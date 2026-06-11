-- Run once after add_round_decisions.sql (or anytime resumes lack candidate_id).
-- Links orphan resumes to candidates in the same cycle by normalized name.

UPDATE resumes r
SET candidate_id = c.id
FROM candidates c
WHERE r.candidate_id IS NULL
  AND r.cycle_id IS NOT NULL
  AND c.cycle_id = r.cycle_id
  AND lower(trim(r.name)) = lower(trim(c.name))
  AND (
    SELECT count(*)
    FROM candidates c2
    WHERE c2.cycle_id = r.cycle_id
      AND lower(trim(c2.name)) = lower(trim(r.name))
  ) = 1;

-- Second pass: disambiguate duplicate names via matching Google Drive file id in URLs.
UPDATE resumes r
SET candidate_id = matched.candidate_id
FROM (
  SELECT DISTINCT ON (r2.id)
    r2.id AS resume_id,
    c.id AS candidate_id
  FROM resumes r2
  JOIN candidates c
    ON c.cycle_id = r2.cycle_id
   AND lower(trim(c.name)) = lower(trim(r2.name))
  WHERE r2.candidate_id IS NULL
    AND r2.cycle_id IS NOT NULL
    AND r2.file_url IS NOT NULL
    AND c.resume_file_url IS NOT NULL
    AND (
      regexp_match(r2.file_url, '/d/([^/]+)') IS NOT NULL
      AND regexp_match(c.resume_file_url, '/d/([^/]+)') IS NOT NULL
      AND (regexp_match(r2.file_url, '/d/([^/]+)'))[1] = (regexp_match(c.resume_file_url, '/d/([^/]+)'))[1]
    )
  ORDER BY r2.id, c.created_at ASC
) matched
WHERE r.id = matched.resume_id
  AND r.candidate_id IS NULL;
