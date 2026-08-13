-- Prevent duplicate automatic variance alerts when two reviews are saved concurrently.
-- Run once in Supabase SQL Editor (or psql), after init.sql.

CREATE UNIQUE INDEX IF NOT EXISTS idx_candidate_flags_one_open_auto_variance_per_resume
  ON candidate_flags (candidate_id, resume_id)
  WHERE status = 'open'
    AND flagged_by IS NULL
    AND reason LIKE 'Automatic variance alert:%';
