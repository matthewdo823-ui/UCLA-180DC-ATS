-- The browser talks only to the Express API. It never needs direct PostgREST
-- access to application data, and several tables contain applicant PII.
--
-- RLS with no client policies makes that architecture explicit: anon and
-- authenticated cannot read or mutate these rows even if the Supabase URL and
-- public key are known. The Express API continues to use service_role, which
-- bypasses RLS. Direct database migrations continue to run as the database
-- owner and are unaffected.

-- Lock the API roles out at the schema boundary as well. The database owner can
-- still create migrations; service_role needs USAGE to resolve API queries.
REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON SCHEMA public FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON SCHEMA public FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA public TO service_role;
  END IF;
END $$;

DO $$
DECLARE
  table_name TEXT;
  app_tables CONSTANT TEXT[] := ARRAY[
    'app_settings',
    'candidate_admin_overrides',
    'candidate_flags',
    'candidate_referrals',
    'candidate_summaries',
    'candidates',
    'cycles',
    'deliberation_votes',
    'documents',
    'frq_reviews',
    'interest_attendance',
    'interest_events',
    'interview_evaluations',
    'interview_group_assignments',
    'interview_group_member_assignments',
    'password_reset_tokens',
    'resume_assignments',
    'resume_review_overrides',
    'resume_reviews',
    'resumes',
    'review_claims',
    'round_decisions',
    'round_notification_batches',
    'round_notification_recipients',
    'rounds',
    'schema_migrations',
    'users'
  ];
BEGIN
  FOREACH table_name IN ARRAY app_tables LOOP
    -- Keep this migration safe for installations that intentionally skipped a
    -- legacy or optional migration.
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', table_name);

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon', table_name);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM authenticated', table_name);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO service_role', table_name);
    END IF;
  END LOOP;
END $$;

-- Apply the same server-only contract to objects created by later migrations.
-- Default privileges are scoped to the migration runner's database role, which
-- is also the role that owns the existing application objects.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
-- EXECUTE for functions is granted to PUBLIC by PostgreSQL's global default.
-- A per-schema default cannot subtract a global default, so this revoke must be
-- global for the migration owner; the service_role grant below remains scoped
-- to public.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON FUNCTIONS FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON FUNCTIONS FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
  END IF;
END $$;

-- users.user_id is the one SERIAL key in this schema. Protect its sequence as
-- well so a direct API role cannot enumerate or advance it.
DO $$
BEGIN
  IF to_regclass('public.users_user_id_seq') IS NULL THEN
    RETURN;
  END IF;

  REVOKE ALL PRIVILEGES ON SEQUENCE public.users_user_id_seq FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON SEQUENCE public.users_user_id_seq FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON SEQUENCE public.users_user_id_seq FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL PRIVILEGES ON SEQUENCE public.users_user_id_seq TO service_role;
  END IF;
END $$;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Restrict all
-- application RPCs, including legacy review helpers, to the backend role.
DO $$
DECLARE
  app_function REGPROCEDURE;
BEGIN
  FOR app_function IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'claim_candidate_documents',
        'claim_next_review',
        'claim_pending_documents',
        'enqueue_resume_documents',
        'increment_review_count',
        'queue_resume_document',
        'queue_resume_on_write',
        'renew_review_claim',
        'reset_password_with_token',
        'save_frq_review',
        'save_resume_review'
      ])
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC', app_function);

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM anon', app_function);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM authenticated', app_function);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', app_function);
    END IF;
  END LOOP;
END $$;
