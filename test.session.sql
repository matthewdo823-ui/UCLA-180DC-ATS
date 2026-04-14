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
*/

/* id, resume id, scores, notes sbumitted_at*/