-- Atomic save for resume reviews: insert review, bump review_count, optional flag.
-- Run once in Supabase SQL Editor (or psql against your Postgres database).

CREATE OR REPLACE FUNCTION save_resume_review(
  resume_id_input UUID,
  scores_input JSONB,
  notes_input TEXT,
  decision_input review_decision,
  graded_by_input INT,
  cycle_id_input UUID,
  round_id_input UUID,
  rubric_snapshot_input JSONB,
  normalized_score_input NUMERIC,
  candidate_id_input UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM resume_reviews
    WHERE resume_id = resume_id_input
      AND graded_by = graded_by_input
      AND cycle_id = cycle_id_input
  ) THEN
    RAISE EXCEPTION 'You have already reviewed this resume'
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO resume_reviews (
    resume_id,
    scores,
    notes,
    decision,
    graded_by,
    cycle_id,
    round_id,
    rubric_snapshot,
    normalized_score
  ) VALUES (
    resume_id_input,
    scores_input,
    notes_input,
    decision_input,
    graded_by_input,
    cycle_id_input,
    round_id_input,
    rubric_snapshot_input,
    normalized_score_input
  );

  UPDATE resumes
  SET review_count = review_count + 1
  WHERE id = resume_id_input;

  IF decision_input = 'flag' AND candidate_id_input IS NOT NULL THEN
    INSERT INTO candidate_flags (
      candidate_id,
      resume_id,
      flagged_by,
      reason
    ) VALUES (
      candidate_id_input,
      resume_id_input,
      graded_by_input,
      COALESCE(NULLIF(TRIM(notes_input), ''), 'Flagged during resume review')
    );
  END IF;
END;
$$;
