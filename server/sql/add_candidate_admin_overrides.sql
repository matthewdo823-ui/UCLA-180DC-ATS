-- Run once in Supabase SQL Editor (or psql).
-- Admin-only per-candidate notes and score overrides for the resume screening round.

CREATE TABLE IF NOT EXISTS candidate_admin_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  cycle_id        UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  round_id        UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  admin_notes     TEXT,
  override_score  NUMERIC,
  admin_user_id   INT REFERENCES users(user_id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, cycle_id, round_id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_admin_overrides_candidate_id
  ON candidate_admin_overrides (candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_admin_overrides_cycle_id
  ON candidate_admin_overrides (cycle_id);
