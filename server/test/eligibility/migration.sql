\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE cycles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text);
CREATE TABLE app_settings(id integer PRIMARY KEY, active_cycle_id uuid);
CREATE TABLE candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cycle_id uuid REFERENCES cycles, year text);
CREATE TABLE rounds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cycle_id uuid REFERENCES cycles, type text);
CREATE TABLE resumes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), candidate_id uuid REFERENCES candidates);
CREATE TABLE round_decisions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), candidate_id uuid REFERENCES candidates, cycle_id uuid REFERENCES cycles, round_id uuid REFERENCES rounds, decision text, notes text, decided_by integer, updated_at timestamptz DEFAULT now(), UNIQUE(candidate_id,round_id));
CREATE TABLE resume_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), resume_id uuid REFERENCES resumes, score integer);
CREATE TABLE frq_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), resume_id uuid REFERENCES resumes, score integer);
CREATE TABLE resume_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), resume_id uuid REFERENCES resumes);
CREATE TABLE interview_evaluations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), candidate_id uuid REFERENCES candidates);
INSERT INTO cycles(id,status) VALUES ('00000000-0000-4000-8000-000000000001','active'),('00000000-0000-4000-8000-000000000002','archived');
INSERT INTO app_settings VALUES(1,'00000000-0000-4000-8000-000000000001');
INSERT INTO rounds(id,cycle_id,type) SELECT '00000000-0000-4000-8000-000000000003',active_cycle_id,'resume_screen' FROM app_settings;
INSERT INTO candidates(id,cycle_id,year) SELECT '00000000-0000-4000-8000-000000000004',active_cycle_id,'Junior' FROM app_settings;
INSERT INTO candidates(id,cycle_id,year) VALUES ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000002','Senior');
INSERT INTO resumes(id,candidate_id) VALUES('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000004');
INSERT INTO resume_reviews(resume_id,score) VALUES('00000000-0000-4000-8000-000000000006',88);
INSERT INTO resume_assignments(resume_id) VALUES('00000000-0000-4000-8000-000000000006');
INSERT INTO round_decisions(candidate_id,cycle_id,round_id,decision) VALUES('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','advance');
\ir ../../sql/add_screening_eligibility.sql
DO $$
DECLARE rid uuid := '00000000-0000-4000-8000-000000000006'; cid uuid := '00000000-0000-4000-8000-000000000004'; cycle uuid := '00000000-0000-4000-8000-000000000001'; transfer uuid; senior uuid; newcycle uuid;
BEGIN
  ASSERT (SELECT screening_exclusion_reason IS NOT NULL FROM candidates WHERE id=cid), 'Existing Junior must be excluded';
  ASSERT (SELECT decision='reject' AND eligibility_rejection FROM round_decisions WHERE candidate_id=cid), 'Existing advance must become a recorded reject';
  ASSERT (SELECT screening_exclusion_reason IS NULL FROM candidates WHERE year='Senior'), 'Archived Senior must retain history';
  ASSERT (SELECT score=88 FROM resume_reviews WHERE resume_id=rid), 'Existing review must not be rewritten';
  ASSERT (SELECT count(*)=1 FROM resume_assignments), 'Existing assignment history retained';
  INSERT INTO candidates(cycle_id,year) VALUES(cycle,'Junior Transfer') RETURNING id INTO transfer;
  ASSERT (SELECT screening_exclusion_reason IS NULL FROM candidates WHERE id=transfer), 'Junior Transfer stays eligible';
  ASSERT NOT EXISTS(SELECT 1 FROM round_decisions WHERE candidate_id=transfer), 'Transfer must not be rejected';
  INSERT INTO candidates(cycle_id,year) VALUES(cycle,'Senior') RETURNING id INTO senior;
  ASSERT (SELECT decision='reject' FROM round_decisions WHERE candidate_id=senior), 'New Senior automatically rejected';
  INSERT INTO candidates(cycle_id,year) VALUES(cycle,'Freshman'),(cycle,'Sophomore'),(cycle,NULL);
  ASSERT (SELECT count(*)=2 FROM candidates WHERE screening_exclusion_reason IS NOT NULL), 'Only exact Junior and Senior excluded';
  BEGIN INSERT INTO resume_reviews(resume_id,score) VALUES(rid,10); RAISE EXCEPTION 'Grade guard failed'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE resume_reviews SET score=10 WHERE resume_id=rid; RAISE EXCEPTION 'Edit guard failed'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO frq_reviews(resume_id,score) VALUES(rid,0); RAISE EXCEPTION 'FRQ guard failed'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO resume_assignments(resume_id) VALUES(rid); RAISE EXCEPTION 'Assignment guard failed'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE round_decisions SET decision='advance' WHERE candidate_id=cid; RAISE EXCEPTION 'Advance guard failed'; EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE candidates SET year='Junior Transfer' WHERE id=cid;
  ASSERT (SELECT screening_exclusion_reason IS NULL FROM candidates WHERE id=cid), 'Corrected standing must become eligible';
  ASSERT NOT EXISTS(SELECT 1 FROM round_decisions WHERE candidate_id=cid), 'Corrected standing returns to pending';
  INSERT INTO frq_reviews(resume_id,score) VALUES(rid,0);
  ASSERT (SELECT score=88 FROM resume_reviews WHERE resume_id=rid), 'Correction retains original review';
  INSERT INTO cycles(status) VALUES('draft') RETURNING id INTO newcycle;
  INSERT INTO candidates(cycle_id,year) VALUES(newcycle,'Senior') RETURNING id INTO senior;
  ASSERT (SELECT screening_exclusion_reason IS NOT NULL FROM candidates WHERE id=senior), 'Future cycle automatically opts in';
  INSERT INTO rounds(cycle_id,type) VALUES(newcycle,'resume_screen');
  ASSERT (SELECT decision='reject' FROM round_decisions WHERE candidate_id=senior), 'Later round creation records pending policy rejects';
  UPDATE cycles SET status='archived' WHERE id=newcycle;
  ASSERT (SELECT screening_exclusion_reason IS NOT NULL FROM candidates WHERE id=senior), 'Archiving preserves established eligibility outcomes';
END $$;
-- More than one queue page of excluded candidates must not hide an eligible one.
INSERT INTO candidates(cycle_id,year) SELECT active_cycle_id,'Senior' FROM app_settings,generate_series(1,105);
INSERT INTO resumes(candidate_id) SELECT id FROM candidates WHERE NOT EXISTS(SELECT 1 FROM resumes WHERE candidate_id=candidates.id);
DO $$ BEGIN
ASSERT (SELECT count(*) >= 1 FROM (SELECT r.id FROM resumes r JOIN candidates c ON c.id=r.candidate_id WHERE c.screening_exclusion_reason IS NULL LIMIT 100) q), 'Eligible candidates must survive more than 100 excluded rows';
END $$;
\ir ../../sql/add_screening_eligibility.sql
ROLLBACK;
