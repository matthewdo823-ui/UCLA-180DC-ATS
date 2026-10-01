-- Admin approval and account lifecycle controls.
-- Existing staff remain active; existing applicant-only accounts become pending.

ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by INT REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_by INT REFERENCES users(user_id) ON DELETE SET NULL;

UPDATE users
SET account_status = CASE
  WHEN role::text IN ('admin', 'board', 'member') THEN 'active'
  ELSE 'pending'
END
WHERE account_status IS NULL;

UPDATE users
SET approved_at = COALESCE(approved_at, created_at)
WHERE account_status = 'active';

ALTER TABLE users ALTER COLUMN account_status SET DEFAULT 'pending';
ALTER TABLE users ALTER COLUMN account_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_account_status_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_account_status_check
      CHECK (account_status IN ('pending', 'active', 'deactivated'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_account_status
  ON users (account_status, created_at DESC);
