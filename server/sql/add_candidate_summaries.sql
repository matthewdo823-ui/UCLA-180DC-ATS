-- Run once in Supabase SQL Editor (or psql).
-- Cached AI candidate summaries for the full application view.

CREATE TABLE IF NOT EXISTS candidate_summaries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id     UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  candidate_id  UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  cycle_id      UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  round_id      UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  summary       TEXT NOT NULL,
  source_hash   TEXT NOT NULL,
  model         TEXT,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (resume_id, cycle_id, round_id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_summaries_resume_id ON candidate_summaries (resume_id);
CREATE INDEX IF NOT EXISTS idx_candidate_summaries_candidate_id ON candidate_summaries (candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_summaries_generated_at ON candidate_summaries (generated_at);
