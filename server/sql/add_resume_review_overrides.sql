-- Run once in Supabase SQL Editor (or psql).
-- Admin-only per-review score overrides for resume screening grades.

CREATE TABLE IF NOT EXISTS resume_review_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id       UUID NOT NULL REFERENCES resume_reviews(id) ON DELETE CASCADE,
  override_score  NUMERIC,
  admin_notes     TEXT,
  admin_user_id   INT REFERENCES users(user_id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (review_id)
);

CREATE INDEX IF NOT EXISTS idx_resume_review_overrides_review_id
  ON resume_review_overrides (review_id);
