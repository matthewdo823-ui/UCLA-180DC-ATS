-- Run once if forms sync fails with:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- PostgREST cannot upsert against partial unique indexes; use a full index instead.
-- (Multiple rows with NULL google_form_response_id per cycle remain allowed.)

DROP INDEX IF EXISTS idx_candidates_cycle_google_form_response;

CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_cycle_google_form_response
  ON candidates (cycle_id, google_form_response_id);
