-- Run once in Supabase SQL Editor (or psql).
-- Gives referrals the same open/resolved queue lifecycle as candidate flags.

ALTER TABLE candidate_referrals
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_candidate_referrals_status'
      AND conrelid = 'candidate_referrals'::regclass
  ) THEN
    ALTER TABLE candidate_referrals
      ADD CONSTRAINT chk_candidate_referrals_status
      CHECK (status IN ('open', 'resolved'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_candidate_referrals_status
  ON candidate_referrals (status);
