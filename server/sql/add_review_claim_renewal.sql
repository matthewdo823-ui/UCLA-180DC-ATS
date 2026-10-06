-- Claim heartbeat for the grading page. add_review_claims.sql (#38) was applied
-- with a 20-minute default lease before this function existed; the server now
-- passes a 5-minute lease explicitly and renews it here while the grader is
-- active, so an abandoned tab frees its resume within minutes.

-- Extends the grader's claim on resume_id_input, or re-takes it if their lease
-- lapsed while nobody else picked it up. Returns FALSE when another grader now
-- holds it.
CREATE OR REPLACE FUNCTION public.renew_review_claim(
  kind_input TEXT,
  cycle_id_input UUID,
  grader_id_input INT,
  resume_id_input UUID,
  lease_seconds INT DEFAULT 300
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  IF kind_input NOT IN ('resume', 'frq') THEN
    RAISE EXCEPTION 'Unknown review kind: %', kind_input;
  END IF;

  -- Same lock as claim_next_review so a re-take cannot race a new claim.
  PERFORM pg_advisory_xact_lock(hashtext('review_claims:' || kind_input || ':' || cycle_id_input::text));

  DELETE FROM public.review_claims WHERE expires_at <= now();

  IF EXISTS (
    SELECT 1 FROM public.review_claims
    WHERE kind = kind_input AND cycle_id = cycle_id_input
      AND resume_id = resume_id_input AND grader_id <> grader_id_input
  ) THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.review_claims (kind, cycle_id, grader_id, resume_id, expires_at)
  VALUES (kind_input, cycle_id_input, grader_id_input, resume_id_input, now() + make_interval(secs => lease_seconds))
  ON CONFLICT (kind, cycle_id, grader_id)
  DO UPDATE SET resume_id = EXCLUDED.resume_id, expires_at = EXCLUDED.expires_at;

  RETURN TRUE;
END;
$$;

-- Supabase API roles only exist on Supabase; keep the file runnable elsewhere.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON FUNCTION public.renew_review_claim(TEXT, UUID, INT, UUID, INT) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.renew_review_claim(TEXT, UUID, INT, UUID, INT) TO service_role;
  END IF;
END $$;
