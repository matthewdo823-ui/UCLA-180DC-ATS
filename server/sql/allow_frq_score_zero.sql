-- Allow FRQ (application response) grades of 0, matching resume screening 0–4 scoring.
-- Run once in Supabase SQL Editor (or psql) on databases that already have add_frq_reviews.sql.

DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE t.relname = 'frq_reviews'
    AND n.nspname = 'public'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%score%'
  LIMIT 1;

  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE frq_reviews DROP CONSTRAINT %I', conname);
  END IF;
END $$;

ALTER TABLE frq_reviews
  ADD CONSTRAINT frq_reviews_score_check
  CHECK (score BETWEEN 0 AND 4);

CREATE OR REPLACE FUNCTION save_frq_review(
  resume_id_input UUID,
  score_input SMALLINT,
  notes_input TEXT,
  graded_by_input INT,
  cycle_id_input UUID,
  round_id_input UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF score_input < 0 OR score_input > 4 THEN
    RAISE EXCEPTION 'FRQ score must be between 0 and 4';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM frq_reviews
    WHERE resume_id = resume_id_input
      AND graded_by = graded_by_input
      AND cycle_id = cycle_id_input
  ) THEN
    RAISE EXCEPTION 'You have already graded this candidate''s application responses'
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO frq_reviews (
    resume_id,
    score,
    notes,
    graded_by,
    cycle_id,
    round_id
  ) VALUES (
    resume_id_input,
    score_input,
    notes_input,
    graded_by_input,
    cycle_id_input,
    round_id_input
  );

  UPDATE resumes
  SET frq_review_count = frq_review_count + 1
  WHERE id = resume_id_input;
END;
$$;
