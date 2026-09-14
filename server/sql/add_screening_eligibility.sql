-- Apply after the core cycle, FRQ, round-decision and assignment migrations.
-- Existing archived cycles retain their outcomes. Active/draft and new cycles
-- enforce exact Junior/Senior standing; Junior Transfer remains eligible.
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS upperclass_rejection_enabled BOOLEAN NOT NULL DEFAULT false;
UPDATE cycles SET upperclass_rejection_enabled = true
WHERE status IN ('active', 'draft') OR id = (SELECT active_cycle_id FROM app_settings WHERE id = 1);
ALTER TABLE cycles ALTER COLUMN upperclass_rejection_enabled SET DEFAULT true;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS screening_exclusion_reason TEXT;
ALTER TABLE round_decisions ADD COLUMN IF NOT EXISTS eligibility_rejection BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION set_screening_eligibility() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.screening_exclusion_reason := CASE
    WHEN NEW.year::text IN ('Junior', 'Senior') AND EXISTS (
      SELECT 1 FROM cycles WHERE id = NEW.cycle_id AND upperclass_rejection_enabled
    ) THEN 'Junior/Senior standing; Junior transfers remain eligible'
    ELSE NULL END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS candidate_screening_eligibility ON candidates;
CREATE TRIGGER candidate_screening_eligibility
BEFORE INSERT OR UPDATE OF year, cycle_id, screening_exclusion_reason ON candidates
FOR EACH ROW EXECUTE FUNCTION set_screening_eligibility();

CREATE OR REPLACE FUNCTION sync_eligibility_rejection() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.screening_exclusion_reason IS NULL THEN
    -- A corrected standing returns to pending; never invent a grader score or
    -- resurrect an earlier acceptance. Existing human reviews remain untouched.
    DELETE FROM round_decisions WHERE candidate_id = NEW.id AND eligibility_rejection;
  ELSE
    INSERT INTO round_decisions(candidate_id, cycle_id, round_id, decision, notes, eligibility_rejection)
    SELECT NEW.id, NEW.cycle_id, id, 'reject', NEW.screening_exclusion_reason, true
    FROM rounds WHERE cycle_id = NEW.cycle_id AND type = 'resume_screen'
    ON CONFLICT (candidate_id, round_id) DO UPDATE SET
      decision = 'reject', notes = EXCLUDED.notes, eligibility_rejection = true,
      decided_by = NULL, updated_at = now()
    WHERE round_decisions.decision <> 'reject' OR NOT round_decisions.eligibility_rejection;
    -- If the applicant had already progressed, preserve the record but prevent
    -- an existing later-round acceptance from bypassing this eligibility rule.
    UPDATE round_decisions SET decision = 'reject', notes = NEW.screening_exclusion_reason,
      eligibility_rejection = true, decided_by = NULL, updated_at = now()
    WHERE candidate_id = NEW.id AND decision <> 'reject';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS candidate_eligibility_decision ON candidates;
CREATE TRIGGER candidate_eligibility_decision
AFTER INSERT OR UPDATE OF year, cycle_id, screening_exclusion_reason ON candidates
FOR EACH ROW EXECUTE FUNCTION sync_eligibility_rejection();

CREATE OR REPLACE FUNCTION refresh_cycle_eligibility() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE candidates SET year = year WHERE cycle_id = NEW.id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cycle_eligibility_policy ON cycles;
CREATE TRIGGER cycle_eligibility_policy AFTER UPDATE OF upperclass_rejection_enabled ON cycles
FOR EACH ROW WHEN (OLD.upperclass_rejection_enabled IS DISTINCT FROM NEW.upperclass_rejection_enabled)
EXECUTE FUNCTION refresh_cycle_eligibility();

CREATE OR REPLACE FUNCTION initialize_round_eligibility() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.type = 'resume_screen' THEN
    UPDATE candidates SET year = year WHERE cycle_id = NEW.cycle_id AND screening_exclusion_reason IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS round_eligibility_decisions ON rounds;
CREATE TRIGGER round_eligibility_decisions AFTER INSERT ON rounds
FOR EACH ROW EXECUTE FUNCTION initialize_round_eligibility();

-- Persist current exclusions and decisions atomically, without adding/deleting grades.
UPDATE candidates SET year = year;

CREATE OR REPLACE FUNCTION guard_excluded_resume_work() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM candidates c JOIN resumes r ON r.candidate_id = c.id
    WHERE r.id = NEW.resume_id FOR SHARE OF c;
  IF EXISTS (SELECT 1 FROM resumes r JOIN candidates c ON c.id = r.candidate_id
             WHERE r.id = NEW.resume_id AND c.screening_exclusion_reason IS NOT NULL) THEN
    RAISE EXCEPTION 'This applicant is automatically rejected by class standing and does not require grading'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS eligible_resume_review ON resume_reviews;
CREATE TRIGGER eligible_resume_review BEFORE INSERT OR UPDATE ON resume_reviews
FOR EACH ROW EXECUTE FUNCTION guard_excluded_resume_work();
DROP TRIGGER IF EXISTS eligible_frq_review ON frq_reviews;
CREATE TRIGGER eligible_frq_review BEFORE INSERT OR UPDATE ON frq_reviews
FOR EACH ROW EXECUTE FUNCTION guard_excluded_resume_work();
DROP TRIGGER IF EXISTS eligible_resume_assignment ON resume_assignments;
CREATE TRIGGER eligible_resume_assignment BEFORE INSERT OR UPDATE ON resume_assignments
FOR EACH ROW EXECUTE FUNCTION guard_excluded_resume_work();

CREATE OR REPLACE FUNCTION guard_excluded_candidate_decision() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM candidates WHERE id = NEW.candidate_id FOR SHARE;
  IF NEW.decision <> 'reject' AND EXISTS (
    SELECT 1 FROM candidates WHERE id = NEW.candidate_id AND screening_exclusion_reason IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Automatically rejected applicants cannot be advanced or placed on hold'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS eligible_round_decision ON round_decisions;
CREATE TRIGGER eligible_round_decision BEFORE INSERT OR UPDATE ON round_decisions
FOR EACH ROW EXECUTE FUNCTION guard_excluded_candidate_decision();

CREATE OR REPLACE FUNCTION guard_excluded_interview_work() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM candidates WHERE id = NEW.candidate_id FOR SHARE;
  IF EXISTS (SELECT 1 FROM candidates WHERE id = NEW.candidate_id AND screening_exclusion_reason IS NOT NULL) THEN
    RAISE EXCEPTION 'This applicant is automatically rejected by class standing and does not require grading'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS eligible_interview_evaluation ON interview_evaluations;
CREATE TRIGGER eligible_interview_evaluation BEFORE INSERT OR UPDATE ON interview_evaluations
FOR EACH ROW EXECUTE FUNCTION guard_excluded_interview_work();
