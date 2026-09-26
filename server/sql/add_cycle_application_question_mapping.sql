-- Cycle-specific application questions and durable response snapshots.
-- Run once before deploying the matching server/client changes.

ALTER TABLE cycles
  ADD COLUMN IF NOT EXISTS form_question_catalog JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS form_gradable_question_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS referral_source TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS previously_applied TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS professional_development TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS consulting_connect_interest TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS application_responses JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Repair the known Fall 2026 mapping. The old configuration discarded last names and
-- displayed "How did you hear about 180DC?" as a Why 180DC essay. A form re-sync after
-- this migration fills the new candidate columns and response snapshots.
UPDATE cycles
SET
  form_field_map = (
    form_field_map
      - '590912e7'
      - '583d1f73'
      - '7ed1bc9c'
      - '54dfe3c6'
  ) || jsonb_build_object(
    '590912e7', 'first_name',
    '2cae28a9', 'last_name',
    '583d1f73', 'referral_source',
    '3cd0a836', 'previously_applied',
    '17edfccc', 'professional_development',
    '2102dabf', 'consulting_connect_interest'
  ),
  form_question_catalog = jsonb_build_array(
    jsonb_build_object(
      'questionId', '7ed1bc9c',
      'title', 'Why are you interested in consulting, and why are you specifically interested in joining 180 Degrees Consulting at UCLA? (250-word limit)',
      'type', 'paragraph'
    ),
    jsonb_build_object(
      'questionId', '54dfe3c6',
      'title', 'Beyond the experiences and accomplishments listed on your resume, how have your lived experiences shaped who you are today (and/or the way you approach your goals, relationships, and challenges)? (150-word limit)',
      'type', 'paragraph'
    )
  ),
  form_gradable_question_ids = jsonb_build_array('7ed1bc9c', '54dfe3c6')
WHERE name = 'Fall 26'
  AND form_field_map ? '590912e7';

