-- Per-cycle grader workload goals.
-- Existing cycles intentionally remain NULL: the API preserves the legacy
-- environment-backed workload defaults.

ALTER TABLE cycles
  ADD COLUMN IF NOT EXISTS resume_grader_goal INTEGER,
  ADD COLUMN IF NOT EXISTS frq_grader_goal INTEGER;

DO $$ BEGIN
  ALTER TABLE cycles
    ADD CONSTRAINT cycles_resume_grader_goal_positive
    CHECK (resume_grader_goal IS NULL OR resume_grader_goal > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE cycles
    ADD CONSTRAINT cycles_frq_grader_goal_positive
    CHECK (frq_grader_goal IS NULL OR frq_grader_goal > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN cycles.resume_grader_goal IS 'Resume reviews expected from each grader; NULL uses the legacy server default.';
COMMENT ON COLUMN cycles.frq_grader_goal IS 'FRQ reviews expected from each grader; NULL uses the legacy server default.';
