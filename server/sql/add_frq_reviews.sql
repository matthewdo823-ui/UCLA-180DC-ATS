-- Free-response (application) grading by admins — separate from resume_reviews.
-- Run once in Supabase SQL Editor (or psql against your Postgres database).

CREATE TABLE IF NOT EXISTS frq_reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id    UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  score        SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 4),
  notes        TEXT,
  graded_by    INT REFERENCES users(user_id) ON DELETE SET NULL,
  cycle_id     UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  round_id     UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_frq_reviews_grader_resume_cycle
  ON frq_reviews (graded_by, resume_id, cycle_id)
  WHERE graded_by IS NOT NULL AND cycle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_frq_reviews_resume_id ON frq_reviews (resume_id);
CREATE INDEX IF NOT EXISTS idx_frq_reviews_cycle_round ON frq_reviews (cycle_id, round_id);

ALTER TABLE resumes
  ADD COLUMN IF NOT EXISTS frq_review_count INT NOT NULL DEFAULT 0;

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
