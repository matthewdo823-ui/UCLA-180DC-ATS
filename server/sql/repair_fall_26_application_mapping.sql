-- Manual post-deploy data repair for the known Fall 2026 Google Form.
-- Run after the application-question code and additive schema migration are live,
-- then run one Fall 2026 form sync to backfill names and response snapshots.

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

