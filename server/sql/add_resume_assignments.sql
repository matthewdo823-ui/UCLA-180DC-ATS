-- Admin-directed grading assignments: pin specific candidates to specific graders.
-- Graders drain their assignments first, then fall back to the shared priority queue.
-- Run once in Supabase SQL Editor (or psql against your Postgres database).

CREATE TABLE IF NOT EXISTS resume_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id    UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  resume_id   UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  grader_id   INT  NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  assigned_by INT  REFERENCES users(user_id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One assignment per (grader, resume) per cycle; bulk assign relies on this for upserts.
CREATE UNIQUE INDEX IF NOT EXISTS idx_resume_assignments_unique
ON resume_assignments (cycle_id, grader_id, resume_id);

-- Queue lookup: "what is still assigned to me in this cycle".
CREATE INDEX IF NOT EXISTS idx_resume_assignments_grader_cycle
ON resume_assignments (grader_id, cycle_id, created_at);

CREATE INDEX IF NOT EXISTS idx_resume_assignments_resume
ON resume_assignments (resume_id);
