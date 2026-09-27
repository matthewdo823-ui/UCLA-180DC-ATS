-- Cycle-specific application questions and durable response snapshots.
-- Run once before deploying the matching server/client changes.

ALTER TABLE cycles
  ADD COLUMN IF NOT EXISTS form_question_catalog JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS form_gradable_question_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS referral_source TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS previously_applied TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS professional_development TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS consulting_connect_interest TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS application_responses JSONB NOT NULL DEFAULT '[]'::jsonb;
