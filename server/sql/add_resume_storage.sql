-- Resume file caching (Drive -> Supabase Storage) + missing performance indexes.
--
-- storage_path / storage_synced_at let an incremental sync worker copy each resume
-- out of Google Drive into a private Supabase Storage bucket exactly once, so the
-- grading-phase read path serves from Storage (CDN-cached signed URLs) instead of
-- proxying a Drive stream on every view. NULL storage_path = not yet synced; the
-- serve path falls back to Drive in that case.

ALTER TABLE resumes
  ADD COLUMN IF NOT EXISTS storage_path      TEXT,
  ADD COLUMN IF NOT EXISTS storage_synced_at TIMESTAMPTZ;

-- Partial index: the sync worker only ever scans rows still needing a copy.
CREATE INDEX IF NOT EXISTS idx_resumes_storage_pending
  ON resumes (storage_synced_at)
  WHERE storage_path IS NULL;

-- Performance index flagged in the audit but never added:
-- resumes.candidate_id is the main join/filter column across dashboardService.js
-- and formsSyncService.js; without this it sequential-scans and worsens as the table grows.
CREATE INDEX IF NOT EXISTS idx_resumes_candidate_id
  ON resumes (candidate_id);

-- NOTE: resume_reviews.graded_by is intentionally NOT indexed here. It is already the
-- leading column of the partial index (graded_by, resume_id, cycle_id) created in
-- add_resume_review_unique_per_grader.sql, which covers the cycle-scoped grader-dashboard
-- queries. A standalone index would be redundant and only tax the write-hot review path.
