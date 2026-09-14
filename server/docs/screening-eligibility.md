# Class-standing read rule

For the active recruiting cycle, exact Junior or Senior standing produces a
computed rejection and 0% applicant score. Junior Transfer remains eligible.
This is evaluated from `candidates.year` when reading; it does not persist a new
status, write a zero grade, or overwrite a committee decision. No migration or
backfill is required. Future cycles use the rule while active; historical-cycle
views retain their stored results.

The same rule filters shared Resume/FR queues and assigned work before query
limits, removes applicants from pending-grade counts and interview grading, and
blocks new grading or advancement through the API. Applications remain on the
resume scoreboard and profile with a clear tag. Bias adjustment cannot raise a
computed policy zero. Resume deliberation counts, completion checks, exports and
advance-email recipient selection use the computed result, so graders do not need
to manually reject these applicants. No email is sent by merely reading a result.

Existing reviews, assignments and decisions stay in the database as recorded.
Correcting class standing takes effect on the next fresh read; there is no policy
status to clear. The normal cache freshness rules still apply. The API checks are
not a new database constraint: scripts writing directly with a service key must
honor this policy themselves.

Validation: `node --test server/test/eligibility/*.test.js`; client lint/build;
browser checks for visible zero/tag, bias adjustment, pending filters and transfer
eligibility. A read-only active-cycle check found 11 Juniors, 2 Seniors and 29
Junior transfers; the filtered queue contains 365 eligible resumes. No live data
was changed.
