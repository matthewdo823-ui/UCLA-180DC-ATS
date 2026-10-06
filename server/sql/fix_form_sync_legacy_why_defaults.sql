-- The application response snapshot supersedes these three fixed essay fields.
-- Keep the legacy columns non-null for older readers, but let current form-sync
-- inserts omit them without being rejected by Postgres.
ALTER TABLE candidates
  ALTER COLUMN why_consulting SET DEFAULT '',
  ALTER COLUMN why_180dc SET DEFAULT '',
  ALTER COLUMN why_social_impact SET DEFAULT '';

-- A failed sync used to advance this watermark even when individual candidate
-- inserts were rejected. Replaying configured, open cycles is safe because form
-- responses are upserted by (cycle_id, google_form_response_id).
UPDATE cycles
SET last_form_sync_at = NULL
WHERE google_form_id IS NOT NULL
  AND status IN ('active', 'draft');
