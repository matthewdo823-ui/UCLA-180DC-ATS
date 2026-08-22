-- Prerequisite schema for the local Supabase-compatible dev database.
--
-- server/sql/init.sql references candidates, resumes, and resume_reviews, but their
-- DDL lives inside a large commented-out block at the top of that file (the tables
-- were created earlier in the project's history). This file recreates just those
-- prerequisite objects so the full migration set applies cleanly on a fresh database.
--
-- This is dev/environment scaffolding only. Production uses a hosted Supabase project.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'year_enum') THEN
    CREATE TYPE year_enum AS ENUM ('Freshman', 'Sophomore', 'Junior Transfer', 'Junior', 'Senior');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone_number TEXT,
  major TEXT,
  gpa TEXT,
  year year_enum,
  pronouns TEXT,
  urm TEXT,
  linkedin TEXT,
  gm TEXT,
  newbie_training TEXT,
  why_consulting TEXT,
  why_180DC TEXT,
  why_social_impact TEXT,
  resume_file_url TEXT,
  extenuating_circumstances TEXT,
  headshot TEXT,
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

CREATE OR REPLACE FUNCTION increment_review_count(resume_id_input uuid)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE resumes
  SET review_count = review_count + 1
  WHERE id = resume_id_input;
$$;
