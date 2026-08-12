-- Run once for databases where the rounds table already exists.
ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS auto_advance_percent NUMERIC NOT NULL DEFAULT 0
    CHECK (auto_advance_percent >= 0 AND auto_advance_percent <= 100),
  ADD COLUMN IF NOT EXISTS auto_reject_percent NUMERIC NOT NULL DEFAULT 0
    CHECK (auto_reject_percent >= 0 AND auto_reject_percent <= 100);

ALTER TABLE rounds
  DROP CONSTRAINT IF EXISTS rounds_auto_decision_percent_total_check;

ALTER TABLE rounds
  ADD CONSTRAINT rounds_auto_decision_percent_total_check
    CHECK (auto_advance_percent + auto_reject_percent <= 100);
