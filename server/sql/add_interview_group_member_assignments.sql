-- Coffee Chat starting-table assignments for member graders.
-- Run once after add_coffee_chat_scoring_and_groups.sql.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.interview_group_member_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id      UUID NOT NULL REFERENCES public.cycles(id) ON DELETE CASCADE,
  round_id      UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  user_id       INT NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  group_number  INTEGER NOT NULL CHECK (group_number >= 1),
  assigned_by   INT REFERENCES public.users(user_id) ON DELETE SET NULL,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_interview_group_members_round_group
  ON public.interview_group_member_assignments (round_id, group_number);

COMMENT ON TABLE public.interview_group_member_assignments IS
  'The Coffee Chat table where each member begins grading; graders rotate cyclically after table submission.';

COMMIT;
