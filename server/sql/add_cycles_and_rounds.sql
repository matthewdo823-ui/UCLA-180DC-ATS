-- Run once in Supabase SQL Editor (or psql against your Postgres database).
-- Adds recruiting cycles, rounds, active-cycle pointer, and backfills existing data.

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cycles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL DEFAULT 'draft'
             CHECK (status IN ('draft', 'active', 'archived')),
  starts_at  TIMESTAMPTZ,
  ends_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cycles_status ON cycles (status);

CREATE TABLE IF NOT EXISTS rounds (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id      UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL
                CHECK (type IN ('resume_screen', 'coffee_chat', 'final_round')),
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'active', 'closed')),
  sort_order    INT NOT NULL DEFAULT 0,
  rubric_config JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, type)
);

CREATE INDEX IF NOT EXISTS idx_rounds_cycle_id ON rounds (cycle_id);
CREATE INDEX IF NOT EXISTS idx_rounds_status ON rounds (status);

CREATE TABLE IF NOT EXISTS app_settings (
  id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  active_cycle_id UUID REFERENCES cycles(id) ON DELETE SET NULL
);

INSERT INTO app_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Scope existing tables to cycles / rounds
-- ---------------------------------------------------------------------------

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS cycle_id UUID REFERENCES cycles(id) ON DELETE SET NULL;

ALTER TABLE resumes
  ADD COLUMN IF NOT EXISTS cycle_id UUID REFERENCES cycles(id) ON DELETE SET NULL;

ALTER TABLE resume_reviews
  ADD COLUMN IF NOT EXISTS cycle_id UUID REFERENCES cycles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS round_id UUID REFERENCES rounds(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rubric_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS normalized_score NUMERIC;

CREATE INDEX IF NOT EXISTS idx_candidates_cycle_id ON candidates (cycle_id);
CREATE INDEX IF NOT EXISTS idx_resumes_cycle_id ON resumes (cycle_id);
CREATE INDEX IF NOT EXISTS idx_resume_reviews_cycle_id ON resume_reviews (cycle_id);
CREATE INDEX IF NOT EXISTS idx_resume_reviews_round_id ON resume_reviews (round_id);

-- ---------------------------------------------------------------------------
-- Seed initial cycle + rounds, backfill legacy rows
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  seed_cycle_id UUID;
  resume_round_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cycles LIMIT 1) THEN
    INSERT INTO cycles (name, slug, status)
    VALUES ('Initial Cycle', 'initial', 'active')
    RETURNING id INTO seed_cycle_id;

    INSERT INTO rounds (cycle_id, name, type, status, sort_order, rubric_config)
    VALUES (
      seed_cycle_id,
      'Resume Screen',
      'resume_screen',
      'active',
      1,
      '{
        "maxPerCategory": 4,
        "byYear": {
          "freshman": {
            "label": "Freshman",
            "imageUrl": "/rubrics/FreshmanRubric.png",
            "metrics": ["leadership/work experience", "business or social impact"]
          },
          "sophomore": {
            "label": "Sophomore",
            "imageUrl": "/rubrics/SophomoreRubric.png",
            "metrics": ["work experience", "leadership experience", "social impact"]
          },
          "junior": {
            "label": "Junior & Senior",
            "imageUrl": "/rubrics/OthersRubric.png",
            "metrics": ["leadership/work experience", "business or social impact"]
          },
          "juniortransfer": {
            "label": "Junior & Senior",
            "imageUrl": "/rubrics/OthersRubric.png",
            "metrics": ["leadership/work experience", "business or social impact"]
          },
          "senior": {
            "label": "Junior & Senior",
            "imageUrl": "/rubrics/OthersRubric.png",
            "metrics": ["leadership/work experience", "business or social impact"]
          }
        }
      }'::jsonb
    )
    RETURNING id INTO resume_round_id;

    INSERT INTO rounds (cycle_id, name, type, status, sort_order)
    VALUES
      (seed_cycle_id, 'Coffee Chats', 'coffee_chat', 'draft', 2),
      (seed_cycle_id, 'Final Round', 'final_round', 'draft', 3);

    UPDATE app_settings
    SET active_cycle_id = seed_cycle_id
    WHERE id = 1;

    UPDATE candidates
    SET cycle_id = seed_cycle_id
    WHERE cycle_id IS NULL;

    UPDATE resumes
    SET cycle_id = seed_cycle_id
    WHERE cycle_id IS NULL;

    UPDATE resume_reviews
    SET cycle_id = seed_cycle_id,
        round_id = resume_round_id
    WHERE cycle_id IS NULL;
  END IF;
END $$;
