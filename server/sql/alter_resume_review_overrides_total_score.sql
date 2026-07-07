-- Run once in Supabase SQL Editor (or psql).
-- Store admin review overrides as a single total raw score (e.g. 24/24) instead of per-metric JSON.

ALTER TABLE resume_review_overrides
  ADD COLUMN IF NOT EXISTS override_score NUMERIC;
