-- Core schema: candidates, resumes, resume reviews, users, candidate flags.
--
-- This file previously could not be run at all: line 1 opened a `/*` block comment
-- that was not closed until just before the `users` table, so candidates, resumes,
-- resume_reviews and year_enum were never created and the ALTER TABLE statements
-- against resume_reviews failed on a fresh database. The schema is restored here.
--
-- Deliberately NOT restored from that block: a one-off `DELETE FROM candidates`,
-- a backfill that copied candidates into resumes, a scratch SELECT, and two
-- hard-coded test resume rows. Those were one-time operations against a specific
-- database in 2024, not part of the schema.
--
-- Statements are guarded so this file is safe to re-run against a partially built
-- database; the migration runner still applies it at most once.

DO $$ BEGIN
  CREATE TYPE year_enum AS ENUM ('Freshman', 'Sophomore', 'Junior Transfer', 'Junior', 'Senior');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  major TEXT NOT NULL,
  gpa TEXT NOT NULL,
  year year_enum,
  pronouns TEXT NOT NULL,
  urm TEXT NOT NULL,
  linkedin TEXT NOT NULL,
  gm TEXT NOT NULL,
  newbie_training TEXT NOT NULL,
  why_consulting TEXT NOT NULL,
  why_180DC TEXT NOT NULL,
  why_social_impact TEXT NOT NULL,
  resume_file_url TEXT NOT NULL,
  extenuating_circumstances TEXT NOT NULL,
  headshot TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    review_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resume_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    scores JSONB NOT NULL,
    notes TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('applicant', 'member', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
    -- Unique identifier for each user
    user_id SERIAL PRIMARY KEY,

    -- Authentication details
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,

    -- Authorization / RBAC
    role user_role NOT NULL DEFAULT 'applicant',

    -- Profile Information
    first_name VARCHAR(100),
    last_name VARCHAR(100),

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE
);

-- Index the email for faster login lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Reviewer attribution. Split from the column add because ADD CONSTRAINT has no
-- IF NOT EXISTS form.
ALTER TABLE resume_reviews ADD COLUMN IF NOT EXISTS graded_by INT;

DO $$ BEGIN
  ALTER TABLE resume_reviews
    ADD CONSTRAINT fk_graded_by
    FOREIGN KEY (graded_by)
    REFERENCES users(user_id)
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE review_decision AS ENUM ('pass', 'flag', 'reject');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE resume_reviews
  ADD COLUMN IF NOT EXISTS decision review_decision NOT NULL DEFAULT 'pass';

CREATE INDEX IF NOT EXISTS idx_resume_reviews_resume_decision
ON resume_reviews(resume_id, decision);

CREATE TABLE IF NOT EXISTS candidate_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL,
  flagged_by INT REFERENCES users(user_id) ON DELETE SET NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT chk_candidate_flags_status CHECK (status IN ('open', 'resolved'))
);
CREATE INDEX IF NOT EXISTS idx_candidate_flags_status ON candidate_flags(status);
CREATE INDEX IF NOT EXISTS idx_candidate_flags_candidate_id ON candidate_flags(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_flags_resume_id ON candidate_flags(resume_id);

-- Retained from the original file. Nothing in the API calls it today (review
-- counting happens inside save_resume_review()), but it is harmless and dropping
-- it would be a behaviour change unrelated to fixing the comment bug.
CREATE OR REPLACE FUNCTION increment_review_count(resume_id_input uuid)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE resumes
  SET review_count = review_count + 1
  WHERE id = resume_id_input;
$$;
