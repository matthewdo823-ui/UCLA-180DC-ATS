-- Run once in Supabase SQL Editor (or psql).  These constraints and RPCs make
-- coordination correct across API replicas, cron invocations, and admin tabs.

-- A single active cycle and one active round per cycle are database invariants,
-- not just assumptions made by the Express handlers.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cycles_one_active
  ON cycles ((status)) WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_rounds_one_active_per_cycle
  ON rounds (cycle_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS integration_locks (
  lock_name   TEXT PRIMARY KEY,
  owner_id    UUID NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION acquire_forms_sync_lock(p_owner_id UUID, p_lease_seconds INT DEFAULT 900)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO integration_locks (lock_name, owner_id, expires_at)
  VALUES ('forms-sync', p_owner_id, now() + make_interval(secs => p_lease_seconds))
  ON CONFLICT (lock_name) DO UPDATE
    SET owner_id = EXCLUDED.owner_id,
        expires_at = EXCLUDED.expires_at,
        updated_at = now()
    WHERE integration_locks.expires_at <= now()
       OR integration_locks.owner_id = EXCLUDED.owner_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION release_forms_sync_lock(p_owner_id UUID)
RETURNS VOID LANGUAGE sql AS $$
  DELETE FROM integration_locks WHERE lock_name = 'forms-sync' AND owner_id = p_owner_id;
$$;

-- Short-lived leases reserve shared queue work.  They expire automatically so a
-- disconnected reviewer cannot permanently strand an application.
CREATE TABLE IF NOT EXISTS review_queue_leases (
  resume_id   UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  cycle_id    UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  round_id    UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('resume', 'frq')),
  grader_id   INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (resume_id, cycle_id, round_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_review_queue_leases_expiry ON review_queue_leases (expires_at);

CREATE OR REPLACE FUNCTION claim_review_queue_lease(
  p_resume_id UUID, p_cycle_id UUID, p_round_id UUID, p_grader_id INT, p_kind TEXT,
  p_lease_seconds INT DEFAULT 900
) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
  IF p_kind NOT IN ('resume', 'frq') THEN RAISE EXCEPTION 'Invalid queue lease kind'; END IF;
  INSERT INTO review_queue_leases (resume_id, cycle_id, round_id, kind, grader_id, expires_at)
  VALUES (p_resume_id, p_cycle_id, p_round_id, p_kind, p_grader_id,
          now() + make_interval(secs => p_lease_seconds))
  ON CONFLICT (resume_id, cycle_id, round_id, kind) DO UPDATE
    SET grader_id = EXCLUDED.grader_id,
        expires_at = EXCLUDED.expires_at,
        created_at = now()
    WHERE review_queue_leases.expires_at <= now()
       OR review_queue_leases.grader_id = EXCLUDED.grader_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION release_review_queue_lease(
  p_resume_id UUID, p_cycle_id UUID, p_round_id UUID, p_grader_id INT, p_kind TEXT
) RETURNS VOID LANGUAGE sql AS $$
  DELETE FROM review_queue_leases
  WHERE resume_id = p_resume_id AND cycle_id = p_cycle_id AND round_id = p_round_id
    AND grader_id = p_grader_id AND kind = p_kind;
$$;

-- Serialize lifecycle changes by cycle.  The advisory locks protect the
-- read/validate/update sequence while the partial unique indexes are the final
-- guard against an invalid state.
CREATE OR REPLACE FUNCTION activate_cycle(p_cycle_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ats-cycle-lifecycle'));
  IF NOT EXISTS (SELECT 1 FROM cycles WHERE id = p_cycle_id) THEN
    RAISE EXCEPTION 'Cycle not found';
  END IF;
  UPDATE cycles SET status = 'archived' WHERE status = 'active' AND id <> p_cycle_id;
  UPDATE cycles SET status = 'active' WHERE id = p_cycle_id;
  INSERT INTO app_settings (id, active_cycle_id) VALUES (1, p_cycle_id)
    ON CONFLICT (id) DO UPDATE SET active_cycle_id = EXCLUDED.active_cycle_id;
END;
$$;

CREATE OR REPLACE FUNCTION activate_round(p_round_id UUID)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_cycle_id UUID;
BEGIN
  SELECT cycle_id INTO v_cycle_id FROM rounds WHERE id = p_round_id FOR UPDATE;
  IF v_cycle_id IS NULL THEN RAISE EXCEPTION 'Round not found'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ats-round-lifecycle:' || v_cycle_id::text));
  UPDATE rounds SET status = 'closed' WHERE cycle_id = v_cycle_id AND status = 'active' AND id <> p_round_id;
  UPDATE rounds SET status = 'active' WHERE id = p_round_id;
  RETURN p_round_id;
END;
$$;

CREATE OR REPLACE FUNCTION advance_round(p_round_id UUID)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_cycle_id UUID; v_sort_order INT; v_next_id UUID;
BEGIN
  SELECT cycle_id, sort_order INTO v_cycle_id, v_sort_order FROM rounds
    WHERE id = p_round_id AND status = 'active' FOR UPDATE;
  IF v_cycle_id IS NULL THEN RAISE EXCEPTION 'Only the active round can be advanced'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ats-round-lifecycle:' || v_cycle_id::text));
  UPDATE rounds SET status = 'closed' WHERE id = p_round_id;
  SELECT id INTO v_next_id FROM rounds WHERE cycle_id = v_cycle_id AND sort_order > v_sort_order
    ORDER BY sort_order LIMIT 1 FOR UPDATE;
  IF v_next_id IS NOT NULL THEN UPDATE rounds SET status = 'active' WHERE id = v_next_id; END IF;
  RETURN v_next_id;
END;
$$;

-- One non-test advance batch and one durable recipient record per candidate
-- make email sends idempotent across concurrent requests. A nullable key keeps
-- this safe to run on databases that already have historical resend batches.
ALTER TABLE round_notification_batches
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_round_notification_batches_idempotency_key
  ON round_notification_batches (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE round_notification_recipients
  DROP CONSTRAINT IF EXISTS round_notification_recipients_status_check;
ALTER TABLE round_notification_recipients
  ADD CONSTRAINT round_notification_recipients_status_check
  CHECK (status IN ('pending', 'sent', 'failed', 'skipped'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_round_notification_recipients_batch_candidate
  ON round_notification_recipients (batch_id, candidate_id)
  WHERE candidate_id IS NOT NULL;
