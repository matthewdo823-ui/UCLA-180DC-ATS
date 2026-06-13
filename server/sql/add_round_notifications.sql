-- Run once in Supabase SQL Editor (or psql).
-- Advance-notification email templates (per round) and send audit log.

ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS advance_notification JSONB;

CREATE TABLE IF NOT EXISTS round_notification_batches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id         UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  round_id         UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL DEFAULT 'advance'
                   CHECK (notification_type IN ('advance')),
  is_test          BOOLEAN NOT NULL DEFAULT false,
  sent_by          INT REFERENCES users(user_id) ON DELETE SET NULL,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipient_count  INT NOT NULL DEFAULT 0,
  failed_count     INT NOT NULL DEFAULT 0,
  subject_snapshot TEXT,
  body_snapshot    TEXT
);

CREATE INDEX IF NOT EXISTS idx_round_notification_batches_round_id
  ON round_notification_batches (round_id);

CREATE INDEX IF NOT EXISTS idx_round_notification_batches_sent_at
  ON round_notification_batches (sent_at DESC);

CREATE TABLE IF NOT EXISTS round_notification_recipients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id    UUID NOT NULL REFERENCES round_notification_batches(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
  email       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'sent'
              CHECK (status IN ('sent', 'failed', 'skipped')),
  error       TEXT
);

CREATE INDEX IF NOT EXISTS idx_round_notification_recipients_batch_id
  ON round_notification_recipients (batch_id);
