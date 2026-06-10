-- Run once in Supabase SQL Editor (or psql).
-- Stores per-cycle Google Form sync config and scopes new applicants to that cycle.

ALTER TABLE cycles
  ADD COLUMN IF NOT EXISTS google_form_id TEXT,
  ADD COLUMN IF NOT EXISTS form_field_map JSONB,
  ADD COLUMN IF NOT EXISTS form_resume_question_id TEXT,
  ADD COLUMN IF NOT EXISTS form_headshot_question_id TEXT,
  ADD COLUMN IF NOT EXISTS last_form_sync_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cycles_google_form_id
  ON cycles (google_form_id)
  WHERE google_form_id IS NOT NULL;

-- Allow the same Google response id in different cycles (one form per cycle).
DROP INDEX IF EXISTS idx_candidates_google_form_response_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_cycle_google_form_response
  ON candidates (cycle_id, google_form_response_id)
  WHERE google_form_response_id IS NOT NULL;
