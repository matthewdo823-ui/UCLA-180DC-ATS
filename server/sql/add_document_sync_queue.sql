-- Candidate document sync queue (Google Drive -> Supabase Storage).
--
-- Replaces the never-used storage columns from add_resume_storage.sql. Those lived
-- on `resumes`, which has no room for headshots: a headshot is a bare
-- candidates.headshot URL with no row of its own, and headshots are the images the
-- avatar grid renders hundreds of at a time. A separate table gives every synced
-- file the same shape regardless of which column it came from.
--
-- The table is also the queue. The work item *is* the row, so a document is
-- enqueued by the same insert that records it — there is no second store to fall
-- out of sync with, and nothing to lose if a worker dies mid-batch.

DO $$ BEGIN
  CREATE TYPE document_kind AS ENUM ('resume', 'headshot');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE document_sync_status AS ENUM ('pending', 'active', 'ready', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  -- Denormalized from candidates so the worker can build the storage path from a
  -- claimed row without a join on the hot path.
  cycle_id        UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  kind            document_kind NOT NULL,

  drive_file_id   TEXT NOT NULL,
  source_url      TEXT NOT NULL,

  storage_path    TEXT,
  content_type    TEXT,
  size_bytes      BIGINT,

  sync_status     document_sync_status NOT NULL DEFAULT 'pending',
  attempts        INT NOT NULL DEFAULT 0,
  last_error      TEXT,
  -- Retry schedule. A row is claimable once this passes; the worker pushes it
  -- forward on each failure so a rate-limited Drive isn't hammered on a tight loop.
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Lease timestamp. An 'active' row whose claim has aged past the worker's lease
  -- becomes claimable again, so a crashed or redeployed worker doesn't strand work.
  claimed_at      TIMESTAMPTZ,
  synced_at       TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One row per file per candidate. This is what makes at-least-once delivery
  -- safe: re-enqueueing is an upsert and reprocessing overwrites one storage path.
  UNIQUE (candidate_id, kind)
);

-- The worker's claim query only ever looks at unfinished rows.
CREATE INDEX IF NOT EXISTS idx_documents_claimable
  ON documents (next_attempt_at)
  WHERE sync_status IN ('pending', 'active');

-- Read path: "is this candidate's headshot ready, and where is it?"
CREATE INDEX IF NOT EXISTS idx_documents_candidate_ready
  ON documents (candidate_id, kind)
  WHERE sync_status = 'ready';

-- Atomically claim a batch of due documents.
--
-- FOR UPDATE SKIP LOCKED is what makes this safe to run from more than one worker
-- (or from a worker overlapping its own redeploy): each claims a disjoint set
-- instead of blocking on the same rows. Reclaiming expired 'active' rows in the
-- same pass is the visibility timeout — the only recovery path for a worker that
-- died between claiming and finishing.
CREATE OR REPLACE FUNCTION claim_pending_documents(batch_size INT, lease_seconds INT)
RETURNS SETOF documents
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE documents d
     SET sync_status = 'active',
         claimed_at  = now(),
         attempts    = d.attempts + 1,
         updated_at  = now()
   WHERE d.id IN (
     SELECT c.id
       FROM documents c
      WHERE (c.sync_status = 'pending' AND c.next_attempt_at <= now())
         OR (c.sync_status = 'active'
             AND c.claimed_at < now() - make_interval(secs => lease_seconds))
      ORDER BY c.next_attempt_at
      LIMIT batch_size
      FOR UPDATE SKIP LOCKED
   )
  RETURNING d.*;
END;
$$;

-- Private bucket: these files are access-controlled, so the API authorizes the
-- request and mints a signed URL rather than exposing the bucket publicly.
INSERT INTO storage.buckets (id, name, public)
VALUES ('candidate-documents', 'candidate-documents', false)
ON CONFLICT (id) DO NOTHING;
