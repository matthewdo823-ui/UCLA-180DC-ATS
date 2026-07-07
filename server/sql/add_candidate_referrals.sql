-- Run once in Supabase SQL Editor (or psql).
-- Member referrals — positive counterpart to candidate_flags.

CREATE TABLE IF NOT EXISTS candidate_referrals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  resume_id     UUID REFERENCES resumes(id) ON DELETE SET NULL,
  referred_by   INT REFERENCES users(user_id) ON DELETE SET NULL,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, referred_by)
);

CREATE INDEX IF NOT EXISTS idx_candidate_referrals_candidate_id
  ON candidate_referrals (candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_referrals_referred_by
  ON candidate_referrals (referred_by);
