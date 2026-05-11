/*
CREATE TYPE year_enum AS ENUM ('Freshman', 'Sophomore', 'Junior Transfer', 'Junior', 'Senior');
CREATE TABLE candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  major TEXT NOT NULL,
  gpa TEXT NOT NULL,
  year year_enum,
  pronouns TEXT NOT NULL,
  urm TEXT NOT NULL,
  linkedin TEXT NOT NULL,
  gm TEXT NOT NULL,
  newbie_training TEXT NOT NULL,
  why_consulting TEXT NOT NULL,
  why_180DC TEXT NOT NULL,
  why_social_impact TEXT NOT NULL,
  resume_file_url TEXT NOT NULL,
  extenuating_circumstances TEXT NOT NULL,
  headshot TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE resumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    review_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE resume_reviews(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    scores JSONB NOT NULL,
    notes TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DELETE FROM candidates 
WHERE name = ' ';

INSERT INTO resumes (candidate_id, name, file_url)
SELECT id, name, resume_file_url
FROM candidates;

UPDATE resumes 
SET review_count = 0
where name = 'Matthew Do';


SELECT file_url FROM resumes 
ORDER BY review_count ASC, created_at ASC
LIMIT 1;

INSERT INTO resumes (name, file_url)
VALUES('Matthew Do', 'https://drive.google.com/file/d/1gp9NBNRkUWVIdVv3Lr6_v-jzC4IGC1Qn/view?usp=sharing');

INSERT INTO resumes (name, file_url)
VALUES('Booty Do', 'https://drive.google.com/file/d/105rf-ChNPWsfthd9BouPiUG9j-CZqVor/view?usp=drive_link');

create or replace function increment_review_count(resume_id_input uuid)
returns void
language sql
as $$
  update resumes
  set review_count = review_count + 1
  where id = resume_id_input;
$$;
*/

/* id, resume id, scores, notes sbumitted_at*/