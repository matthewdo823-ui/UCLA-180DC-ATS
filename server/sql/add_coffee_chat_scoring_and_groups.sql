-- Coffee Chat grouping and per-evaluator scoring.
-- Run once after add_interview_evaluations.sql.

ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS interview_group_count INTEGER NOT NULL DEFAULT 1
    CHECK (interview_group_count >= 1 AND interview_group_count <= 100);

CREATE TABLE IF NOT EXISTS interview_group_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  cycle_id      UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  round_id      UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  group_number  INTEGER NOT NULL CHECK (group_number >= 1),
  assigned_by   INT REFERENCES users(user_id) ON DELETE SET NULL,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, round_id)
);

CREATE INDEX IF NOT EXISTS idx_interview_groups_round
  ON interview_group_assignments (round_id, group_number);

ALTER TABLE interview_evaluations
  ADD COLUMN IF NOT EXISTS rating TEXT,
  ADD COLUMN IF NOT EXISTS weighted_score SMALLINT;

ALTER TABLE interview_evaluations
  DROP CONSTRAINT IF EXISTS interview_evaluations_rating_check,
  DROP CONSTRAINT IF EXISTS interview_evaluations_weighted_score_check,
  DROP CONSTRAINT IF EXISTS interview_evaluations_rating_score_check,
  DROP CONSTRAINT IF EXISTS interview_evaluations_candidate_id_round_id_key;

ALTER TABLE interview_evaluations
  ADD CONSTRAINT interview_evaluations_rating_check
    CHECK (rating IS NULL OR rating IN ('strong_yes', 'yes', 'no', 'strong_no')),
  ADD CONSTRAINT interview_evaluations_weighted_score_check
    CHECK (weighted_score IS NULL OR weighted_score IN (2, 1, -1, -2)),
  ADD CONSTRAINT interview_evaluations_rating_score_check
    CHECK (
      (rating IS NULL AND weighted_score IS NULL)
      OR (rating = 'strong_yes' AND weighted_score = 2)
      OR (rating = 'yes' AND weighted_score = 1)
      OR (rating = 'no' AND weighted_score = -1)
      OR (rating = 'strong_no' AND weighted_score = -2)
    );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'interview_evaluations_candidate_round_evaluator_key'
  ) THEN
    ALTER TABLE interview_evaluations
      ADD CONSTRAINT interview_evaluations_candidate_round_evaluator_key
      UNIQUE (candidate_id, round_id, evaluated_by);
  END IF;
END $$;

COMMENT ON COLUMN interview_evaluations.rating IS
  'Per-evaluator Coffee Chat rating: strong_yes, yes, no, or strong_no.';
COMMENT ON COLUMN interview_evaluations.weighted_score IS
  'Coffee Chat rating weight: +2, +1, -1, or -2.';
