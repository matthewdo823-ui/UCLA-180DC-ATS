/*
CREATE TABLE resumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    review_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reviews(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    scores JSONB NOT NULL,
    notes TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


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