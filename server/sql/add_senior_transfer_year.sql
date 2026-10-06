-- The intake mapper and the screening-eligibility filter both name
-- 'Senior Transfer', but year_enum never had it, so Postgres rejected every
-- query filtering on it (the grading queue) and every intake row carrying it.
ALTER TYPE year_enum ADD VALUE IF NOT EXISTS 'Senior Transfer';
