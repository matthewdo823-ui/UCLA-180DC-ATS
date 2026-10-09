-- Run once in Supabase SQL Editor (or psql).
-- Per-member deliberation votes: once a round enters the Deliberation phase,
-- any staff member (member, board, admin) casts one Coffee Chat-scaled vote per
-- candidate. These are advisory and live alongside the admin-only round_decisions
-- row that records the committee's final Advance/Hold/Reject call — they do not
-- replace it. Separate from interview_evaluations, which is Coffee Chat grading.

CREATE TABLE IF NOT EXISTS deliberation_votes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id   UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  cycle_id       UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  round_id       UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  rating         TEXT NOT NULL
                 CHECK (rating IN ('strong_yes', 'yes', 'no', 'strong_no')),
  weighted_score SMALLINT NOT NULL
                 CHECK (weighted_score IN (2, 1, -1, -2)),
  notes          TEXT,
  voted_by       INT REFERENCES users(user_id) ON DELETE SET NULL,
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The rating and its weight must agree, mirroring interview_evaluations so a
  -- stored row can never drift from the scale.
  CONSTRAINT deliberation_votes_rating_score_check CHECK (
    (rating = 'strong_yes' AND weighted_score = 2)
    OR (rating = 'yes' AND weighted_score = 1)
    OR (rating = 'no' AND weighted_score = -1)
    OR (rating = 'strong_no' AND weighted_score = -2)
  ),
  -- One vote per member per candidate per round. Re-voting upserts in place.
  UNIQUE (candidate_id, round_id, voted_by)
);

CREATE INDEX IF NOT EXISTS idx_deliberation_votes_round
  ON deliberation_votes (round_id);
CREATE INDEX IF NOT EXISTS idx_deliberation_votes_candidate_round
  ON deliberation_votes (candidate_id, round_id);

COMMENT ON TABLE deliberation_votes IS
  'Advisory per-member votes cast during a round''s Deliberation phase, on the Coffee Chat scale.';
COMMENT ON COLUMN deliberation_votes.rating IS
  'Deliberation vote: strong_yes, yes, no, or strong_no.';
COMMENT ON COLUMN deliberation_votes.weighted_score IS
  'Vote weight matching the Coffee Chat scale: +2, +1, -1, or -2.';
