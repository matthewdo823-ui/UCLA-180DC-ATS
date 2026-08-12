-- One-time, short-lived password reset tokens. Store only token hashes so a
-- database read cannot be used to reset an account.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_active
  ON password_reset_tokens (user_id, expires_at)
  WHERE used_at IS NULL;

-- Consume the token and update the credential in one transaction. This makes
-- concurrent uses of the same link safe: exactly one call can succeed.
CREATE OR REPLACE FUNCTION reset_password_with_token(
  token_hash_input TEXT,
  password_hash_input TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  reset_user_id INT;
BEGIN
  UPDATE password_reset_tokens
  SET used_at = now()
  WHERE token_hash = token_hash_input
    AND used_at IS NULL
    AND expires_at > now()
  RETURNING user_id INTO reset_user_id;

  IF reset_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE users SET password_hash = password_hash_input WHERE user_id = reset_user_id;
  RETURN TRUE;
END;
$$;
