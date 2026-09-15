-- Run once in Supabase SQL Editor (or psql).
-- Demonstrated Interest: event attendance logged via per-event Google Forms,
-- converted at read time into a multiplier on the Resume + FRQ composite score.

-- Multiplier by number of distinct events attended: index n = n events.
-- Counts beyond the last index use the last value. Editable per cycle in Cycle Management.
ALTER TABLE cycles
  ADD COLUMN IF NOT EXISTS interest_multiplier_steps JSONB NOT NULL
    DEFAULT '[1, 1.025, 1.05, 1.075, 1.1]'::jsonb;

-- University ID from the application form; the preferred attendance match key.
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS university_id TEXT;

CREATE INDEX IF NOT EXISTS idx_candidates_cycle_university_id
  ON candidates (cycle_id, university_id);

CREATE TABLE IF NOT EXISTS interest_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id        UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  closes_at       TIMESTAMPTZ NOT NULL,
  google_form_id  TEXT,
  -- { questionId: 'name' | 'email' | 'university_id' }, same shape as cycles.form_field_map
  field_map       JSONB,
  form_title      TEXT,
  mapping_status  TEXT NOT NULL DEFAULT 'unconfigured',
  mapping_error   TEXT,
  last_sync_at    TIMESTAMPTZ,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_interest_events_mapping_status
    CHECK (mapping_status IN ('unconfigured', 'ok', 'stale'))
);

CREATE INDEX IF NOT EXISTS idx_interest_events_cycle_id
  ON interest_events (cycle_id);

CREATE TABLE IF NOT EXISTS interest_attendance (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                  UUID NOT NULL REFERENCES interest_events(id) ON DELETE CASCADE,
  cycle_id                  UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  google_form_response_id   TEXT NOT NULL,
  submitted_at              TIMESTAMPTZ NOT NULL,
  -- Every answer keyed by question id, so a remap can re-derive fields without refetching.
  answers                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_name            TEXT,
  submitted_email           TEXT,
  submitted_university_id   TEXT,
  candidate_id              UUID REFERENCES candidates(id) ON DELETE SET NULL,
  match_method              TEXT,
  status                    TEXT NOT NULL DEFAULT 'unmatched',
  resolved_by               INT REFERENCES users(user_id) ON DELETE SET NULL,
  resolved_at               TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_interest_attendance_status
    CHECK (status IN ('counted', 'unmatched', 'late', 'dismissed')),
  CONSTRAINT chk_interest_attendance_match_method
    CHECK (match_method IS NULL OR match_method IN ('uid', 'email', 'admin'))
);

-- Full (not partial) index so PostgREST upsert can target it; see fix_candidates_form_sync_upsert.sql.
CREATE UNIQUE INDEX IF NOT EXISTS idx_interest_attendance_event_response
  ON interest_attendance (event_id, google_form_response_id);

CREATE INDEX IF NOT EXISTS idx_interest_attendance_cycle_status
  ON interest_attendance (cycle_id, status);

CREATE INDEX IF NOT EXISTS idx_interest_attendance_candidate_id
  ON interest_attendance (candidate_id);
