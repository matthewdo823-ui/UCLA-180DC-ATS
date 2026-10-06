-- Spread grading so every resume / free response is graded once before any is
-- graded twice. The queues already order by review_count, but a count only
-- moves when a review is submitted, so graders who open the queue around the
-- same time were all handed the same lowest-count resume. A claim reserves the
-- served resume for one grader until they submit or the lease runs out, and
-- claims held by others count toward a resume's place in the queue.

CREATE TABLE IF NOT EXISTS public.review_claims (
  kind       TEXT NOT NULL CHECK (kind IN ('resume', 'frq')),
  cycle_id   UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  grader_id  INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  resume_id  UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  -- One open claim per grader per queue: taking the next resume replaces it.
  PRIMARY KEY (kind, cycle_id, grader_id)
);

CREATE INDEX IF NOT EXISTS idx_review_claims_resume
  ON public.review_claims (kind, cycle_id, resume_id);

ALTER TABLE public.review_claims ENABLE ROW LEVEL SECURITY;

-- candidate_ids is the caller's eligible queue, already filtered (eligibility,
-- valid file, not yet reviewed by this grader) and in tie-break order. Returns
-- the claimed resume id, or NULL when the list is empty.
CREATE OR REPLACE FUNCTION public.claim_next_review(
  kind_input TEXT,
  cycle_id_input UUID,
  grader_id_input INT,
  candidate_ids UUID[],
  lease_seconds INT DEFAULT 1200
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  picked UUID;
BEGIN
  IF kind_input NOT IN ('resume', 'frq') THEN
    RAISE EXCEPTION 'Unknown review kind: %', kind_input;
  END IF;

  -- Serialize pickers on one queue; without this two graders can read the same
  -- counts in parallel and claim the same resume.
  PERFORM pg_advisory_xact_lock(hashtext('review_claims:' || kind_input || ':' || cycle_id_input::text));

  DELETE FROM public.review_claims WHERE expires_at <= now();

  IF candidate_ids IS NULL OR cardinality(candidate_ids) = 0 THEN
    DELETE FROM public.review_claims
    WHERE kind = kind_input AND cycle_id = cycle_id_input AND grader_id = grader_id_input;
    RETURN NULL;
  END IF;

  SELECT c.id INTO picked
  FROM unnest(candidate_ids) WITH ORDINALITY AS c(id, pos)
  JOIN public.resumes r ON r.id = c.id
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE rc.grader_id <> grader_id_input) AS held_by_others,
      bool_or(rc.grader_id = grader_id_input) AS held_by_me
    FROM public.review_claims rc
    WHERE rc.kind = kind_input AND rc.cycle_id = cycle_id_input AND rc.resume_id = c.id
  ) claims ON TRUE
  ORDER BY
    -- A reload keeps the grader on the resume they were already given.
    COALESCE(claims.held_by_me, FALSE) DESC,
    (CASE WHEN kind_input = 'frq' THEN r.frq_review_count ELSE r.review_count END)
      + COALESCE(claims.held_by_others, 0),
    -- On a tie, a resume nobody is holding beats one being graded right now.
    COALESCE(claims.held_by_others, 0),
    c.pos
  LIMIT 1;

  IF picked IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.review_claims (kind, cycle_id, grader_id, resume_id, expires_at)
  VALUES (kind_input, cycle_id_input, grader_id_input, picked, now() + make_interval(secs => lease_seconds))
  ON CONFLICT (kind, cycle_id, grader_id)
  DO UPDATE SET resume_id = EXCLUDED.resume_id, expires_at = EXCLUDED.expires_at;

  RETURN picked;
END;
$$;

-- Supabase API roles only exist on Supabase; keep the file runnable elsewhere.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON FUNCTION public.claim_next_review(TEXT, UUID, INT, UUID[], INT) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.claim_next_review(TEXT, UUID, INT, UUID[], INT) TO service_role;
  END IF;
END $$;
