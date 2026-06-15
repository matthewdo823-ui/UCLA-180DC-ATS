# SQL migrations — run order

Run these scripts **once** in the Supabase SQL Editor (or `psql` against your Postgres database), in this order:

| # | File | Purpose |
|---|------|---------|
| 1 | `init.sql` | Core schema: users, resume review columns, `candidate_flags` |
| 2 | `add_cycles_and_rounds.sql` | Cycles, rounds, `app_settings`, cycle/round columns on existing tables, seed data |
| 3 | `add_google_form_response_id.sql` | `google_form_response_id` on candidates (dedupe form syncs) |
| 4 | `add_cycle_form_config.sql` | Per-cycle Google Form config; scopes response IDs per cycle |
| 5 | `add_interview_evaluations.sql` | `interview_evaluations` table for interview round decisions |
| 6 | `add_save_resume_review.sql` | `save_resume_review()` RPC (atomic review save + optional flag) |
| 7 | `add_resume_review_unique_per_grader.sql` | One review per grader per resume per cycle; duplicate guard in RPC |
| 8 | `add_round_decisions.sql` | Committee round decisions (`advance` / `hold` / `reject`) for live scoreboard deliberation |
| 9 | `add_round_notifications.sql` | Advance email templates per round + send audit log |
| 10 | `backfill_resume_candidate_ids.sql` | Link orphan `resumes` rows to `candidates` by name / Drive file id (optional data repair) |
| 11 | `add_final_round.sql` | Normalizes recruiting rounds to resume_screen, coffee_chat, and final_round |
| 12 | `add_candidate_summaries.sql` | Cached AI candidate summaries for the full application view |

## Notes

- **Fresh database:** run all eight in order.
- **Existing database:** skip scripts you have already applied. Each file uses `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` where possible, but re-running `init.sql` or seed blocks in `add_cycles_and_rounds.sql` may fail or duplicate data.
- `init.sql` begins with a large commented block (legacy candidate/resume DDL); the active statements start at the `user_role` enum.
