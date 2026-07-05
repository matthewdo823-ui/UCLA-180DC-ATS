-- Run if you already created resume_review_overrides with override_score (NUMERIC).
-- Migrates to per-metric override_scores (JSONB).

ALTER TABLE resume_review_overrides
  ADD COLUMN IF NOT EXISTS override_scores JSONB;

ALTER TABLE resume_review_overrides
  DROP COLUMN IF EXISTS override_score;
