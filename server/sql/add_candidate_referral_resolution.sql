-- Run once in Supabase SQL Editor (or psql).
-- Gives referrals the same open/resolved queue lifecycle as candidate flags.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.candidate_referrals
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_candidate_referrals_status'
      AND conrelid = 'public.candidate_referrals'::regclass
  ) THEN
    ALTER TABLE public.candidate_referrals
      ADD CONSTRAINT chk_candidate_referrals_status
      CHECK (status IN ('open', 'resolved'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_candidate_referrals_status
  ON public.candidate_referrals (status);

COMMENT ON COLUMN public.candidate_referrals.status IS
  'Queue state for admin referral triage: open or resolved.';
COMMENT ON COLUMN public.candidate_referrals.resolved_at IS
  'Timestamp when an admin resolved the referral; null while open.';

COMMIT;
