-- Run once in Supabase SQL Editor (or psql).
-- Interview round evaluations — separate from resume_reviews JSONB scores.

CREATE TABLE IF NOT EXISTS interview_evaluations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  cycle_id      UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  round_id      UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  decision      TEXT NOT NULL DEFAULT 'pending'
                CHECK (decision IN ('pending', 'pass', 'fail', 'hold')),
  scheduled_at  TIMESTAMPTZ,
  notes         TEXT,
  evaluated_by  INT REFERENCES users(user_id) ON DELETE SET NULL,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, round_id)
);

CREATE INDEX IF NOT EXISTS idx_interview_evaluations_cycle_id ON interview_evaluations (cycle_id);
CREATE INDEX IF NOT EXISTS idx_interview_evaluations_round_id ON interview_evaluations (round_id);
CREATE INDEX IF NOT EXISTS idx_interview_evaluations_candidate_id ON interview_evaluations (candidate_id);
