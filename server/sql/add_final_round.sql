-- Run once in Supabase SQL Editor (or psql).
-- Normalizes recruiting rounds to resume_screen, coffee_chat, and final_round.

ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_type_check;

ALTER TABLE rounds
  ADD CONSTRAINT rounds_type_check
  CHECK (type IN ('resume_screen', 'interview', 'coffee_chat', 'final_round'));

UPDATE rounds
SET type = 'coffee_chat',
    name = CASE
      WHEN trim(name) IN ('Interview Management', 'Interview', 'First Round Interviews') THEN 'Coffee Chats'
      ELSE name
    END
WHERE type = 'interview';

UPDATE rounds
SET sort_order = 2
WHERE type = 'coffee_chat';

INSERT INTO rounds (cycle_id, name, type, status, sort_order)
SELECT c.id, 'Final Round', 'final_round', 'draft', 3
FROM cycles c
WHERE NOT EXISTS (
  SELECT 1
  FROM rounds r
  WHERE r.cycle_id = c.id
    AND r.type = 'final_round'
);

UPDATE rounds
SET sort_order = 3
WHERE type = 'final_round';
