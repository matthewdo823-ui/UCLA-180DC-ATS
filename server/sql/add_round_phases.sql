-- Run once in Supabase SQL Editor (or psql). Safe to re-run.
-- Per-round phases: setup -> grading -> deliberation -> closed.
--
-- Widens rounds.status from (draft, active, closed) to the four phase values.
-- 'draft' becomes 'setup', 'active' becomes 'grading', and 'deliberation' is
-- new: the window where the scoreboard is frozen and the committee decides.
--
-- Apply this together with the server release that reads and writes the new
-- values. The old CHECK rejects 'setup'/'deliberation' and the new one rejects
-- 'draft'/'active', so the database and the API have to move as one step.

-- Wrapped in a transaction: the constraint is dropped and re-added below, and
-- a failure in between would leave rounds.status accepting any value at all.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Refuse to migrate a cycle that already has two open rounds
-- ---------------------------------------------------------------------------
-- Application code has always assumed at most one, but nothing enforced it.
-- The partial unique index below would fail with a generic duplicate-key
-- error, so name the offending cycles while the old values are still in place.

DO $$
DECLARE
  offenders TEXT;
BEGIN
  SELECT string_agg(cycle_id::TEXT, ', ')
  INTO offenders
  FROM (
    SELECT cycle_id
    FROM rounds
    WHERE status IN ('active', 'grading', 'deliberation')
    GROUP BY cycle_id
    HAVING count(*) > 1
  ) AS duplicates;

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add per-round phases: these cycles have more than one open round (%). Close all but one round in each, then re-run.',
      offenders;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Drop the old CHECK so the backfill can write the new values
-- ---------------------------------------------------------------------------
-- add_cycles_and_rounds.sql declared the constraint inline, so Postgres named
-- it. Look it up by the column it covers rather than trusting that name.

DO $$
DECLARE
  status_attnum SMALLINT;
  doomed TEXT;
BEGIN
  SELECT attnum INTO status_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.rounds'::regclass AND attname = 'status';

  FOR doomed IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.rounds'::regclass
      AND con.contype = 'c'
      AND con.conkey = ARRAY[status_attnum]
  LOOP
    EXECUTE format('ALTER TABLE public.rounds DROP CONSTRAINT %I', doomed);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Backfill and re-constrain
-- ---------------------------------------------------------------------------

ALTER TABLE rounds ALTER COLUMN status SET DEFAULT 'setup';

UPDATE rounds SET status = 'setup'   WHERE status = 'draft';
UPDATE rounds SET status = 'grading' WHERE status = 'active';

ALTER TABLE rounds
  ADD CONSTRAINT rounds_status_check
    CHECK (status IN ('setup', 'grading', 'deliberation', 'closed'));

-- One open round per cycle, now enforced by the database rather than by
-- activateRound() remembering to close its siblings. getOpenRoundForCycle()
-- reads with .maybeSingle(), which throws on a second row.
CREATE UNIQUE INDEX IF NOT EXISTS rounds_one_open_per_cycle
  ON rounds (cycle_id)
  WHERE status IN ('grading', 'deliberation');

-- ---------------------------------------------------------------------------
-- Phase-change audit
-- ---------------------------------------------------------------------------

ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_changed_by INT REFERENCES users(user_id) ON DELETE SET NULL;

UPDATE rounds
SET status_changed_at = created_at
WHERE status_changed_at IS NULL;

COMMIT;
