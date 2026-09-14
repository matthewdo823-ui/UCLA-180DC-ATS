-- Resume intake and copy jobs commit together. Apply after migration #28.
-- No existing files are queued by this migration; use documents:backfill.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS source_version UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS claim_token UUID;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Read the canonical resume under a row lock, including for backfills. A stale
-- caller cannot enqueue an earlier upload after a newer resume has been saved.
CREATE OR REPLACE FUNCTION public.queue_resume_document(resume_id UUID, retry_failed BOOLEAN DEFAULT false)
RETURNS BOOLEAN LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  r public.resumes%ROWTYPE;
  file_id TEXT;
  affected INTEGER;
BEGIN
  SELECT * INTO r FROM public.resumes WHERE id = resume_id FOR UPDATE;
  IF NOT FOUND OR r.candidate_id IS NULL OR r.cycle_id IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = r.candidate_id AND c.cycle_id = r.cycle_id)
  THEN RETURN false; END IF;

  IF trim(r.file_url) ~* '^https?://(www\.)?(drive|docs)\.google\.com/' THEN
    file_id := COALESCE(
      substring(r.file_url FROM '[?&]id=([a-zA-Z0-9_-]+)'),
      substring(r.file_url FROM '/d/([a-zA-Z0-9_-]+)')
    );
  END IF;
  IF file_id IS NULL THEN
    DELETE FROM public.documents WHERE candidate_id = r.candidate_id AND kind = 'resume';
    RETURN false;
  END IF;

  INSERT INTO public.documents (candidate_id, cycle_id, kind, drive_file_id, source_url)
  VALUES (r.candidate_id, r.cycle_id, 'resume', file_id, trim(r.file_url))
  ON CONFLICT (candidate_id, kind) DO UPDATE SET
    cycle_id = EXCLUDED.cycle_id, drive_file_id = EXCLUDED.drive_file_id,
    source_url = EXCLUDED.source_url, source_version = gen_random_uuid(),
    sync_status = 'pending', attempts = 0, last_error = NULL,
    storage_path = NULL, content_type = NULL, size_bytes = NULL,
    claimed_at = NULL, claim_token = NULL, synced_at = NULL,
    next_attempt_at = now(), updated_at = now()
  WHERE documents.drive_file_id IS DISTINCT FROM EXCLUDED.drive_file_id
     OR documents.cycle_id IS DISTINCT FROM EXCLUDED.cycle_id
     OR (retry_failed AND documents.sync_status = 'failed');
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_resume_on_write()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM public.queue_resume_document(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_resume_document_on_write ON public.resumes;
CREATE TRIGGER queue_resume_document_on_write
AFTER INSERT OR UPDATE OF file_url, candidate_id, cycle_id ON public.resumes
FOR EACH ROW EXECUTE FUNCTION public.queue_resume_on_write();

CREATE OR REPLACE FUNCTION public.enqueue_resume_documents(resume_ids UUID[], retry_failed BOOLEAN DEFAULT false)
RETURNS INTEGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE resume_id UUID; queued INTEGER := 0;
BEGIN
  IF cardinality(resume_ids) > 500 THEN RAISE EXCEPTION 'At most 500 resumes per batch'; END IF;
  FOR resume_id IN SELECT id FROM public.resumes WHERE id = ANY(resume_ids) ORDER BY id LOOP
    IF public.queue_resume_document(resume_id, retry_failed) THEN queued := queued + 1; END IF;
  END LOOP;
  RETURN queued;
END;
$$;

-- New workers use a new RPC. Old headshot-only processes must never claim resume
-- jobs during a rolling deployment. Each lease has its own completion token.
CREATE OR REPLACE FUNCTION public.claim_candidate_documents(batch_size INTEGER, lease_seconds INTEGER)
RETURNS SETOF public.documents LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF batch_size < 1 OR batch_size > 100 OR lease_seconds < 1 THEN
    RAISE EXCEPTION 'Invalid document claim limits';
  END IF;
  RETURN QUERY UPDATE public.documents d
    SET sync_status = 'active', claimed_at = now(), claim_token = gen_random_uuid(),
        attempts = d.attempts + 1, updated_at = now()
    WHERE d.id IN (
      SELECT c.id FROM public.documents c
      WHERE (c.sync_status = 'pending' AND c.next_attempt_at <= now())
         OR (c.sync_status = 'active' AND c.claimed_at < now() - make_interval(secs => lease_seconds))
      ORDER BY c.next_attempt_at, c.id LIMIT batch_size FOR UPDATE SKIP LOCKED
    ) RETURNING d.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_pending_documents(batch_size INTEGER, lease_seconds INTEGER)
RETURNS SETOF public.documents LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RETURN QUERY UPDATE public.documents d
    SET sync_status = 'active', claimed_at = now(), claim_token = gen_random_uuid(),
        attempts = d.attempts + 1, updated_at = now()
    WHERE d.id IN (
      SELECT c.id FROM public.documents c WHERE c.kind = 'headshot' AND (
        (c.sync_status = 'pending' AND c.next_attempt_at <= now()) OR
        (c.sync_status = 'active' AND c.claimed_at < now() - make_interval(secs => lease_seconds)))
      ORDER BY c.next_attempt_at, c.id LIMIT batch_size FOR UPDATE SKIP LOCKED
    ) RETURNING d.*;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_resume_document(UUID, BOOLEAN),
  public.queue_resume_on_write(), public.enqueue_resume_documents(UUID[], BOOLEAN),
  public.claim_candidate_documents(INTEGER, INTEGER), public.claim_pending_documents(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_resume_document(UUID, BOOLEAN),
  public.queue_resume_on_write(), public.enqueue_resume_documents(UUID[], BOOLEAN),
  public.claim_candidate_documents(INTEGER, INTEGER), public.claim_pending_documents(INTEGER, INTEGER)
  TO service_role;
