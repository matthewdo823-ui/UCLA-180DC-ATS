-- Run once in Supabase SQL Editor (or your migration runner).
-- Deduplicates Google Form syncs by stable responseId from the Forms API.
-- PostgreSQL UNIQUE allows multiple NULL rows (legacy CSV imports).

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS google_form_response_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_google_form_response_id
  ON candidates (google_form_response_id);
