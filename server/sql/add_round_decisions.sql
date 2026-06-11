-- Run once in Supabase SQL Editor (or psql).
-- Committee decisions per candidate per round (resume screen deliberation, etc.).

CREATE TABLE IF NOT EXISTS round_decisions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  cycle_id      UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  round_id      UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  decision      TEXT NOT NULL DEFAULT 'pending'
                CHECK (decision IN ('pending', 'advance', 'hold', 'reject')),
  notes         TEXT,
  decided_by    INT REFERENCES users(user_id) ON DELETE SET NULL,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, round_id)
);

CREATE INDEX IF NOT EXISTS idx_round_decisions_cycle_id ON round_decisions (cycle_id);
CREATE INDEX IF NOT EXISTS idx_round_decisions_round_id ON round_decisions (round_id);
CREATE INDEX IF NOT EXISTS idx_round_decisions_candidate_id ON round_decisions (candidate_id);
CREATE INDEX IF NOT EXISTS idx_round_decisions_decision ON round_decisions (decision);
