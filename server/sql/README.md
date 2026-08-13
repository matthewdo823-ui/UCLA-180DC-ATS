# SQL migrations — run order

Run these scripts **once** in the Supabase SQL Editor (or `psql` against your Postgres database), in this order:

| # | File | Purpose |
|---|------|---------|
| 1 | `init.sql` | Core schema: users, resume review columns, `candidate_flags` |
| 2 | `add_cycles_and_rounds.sql` | Cycles, rounds, `app_settings`, cycle/round columns on existing tables, seed data |
| 3 | `add_google_form_response_id.sql` | `google_form_response_id` on candidates (dedupe form syncs) |
| 4 | `add_cycle_form_config.sql` | Per-cycle Google Form config; unique index on `(cycle_id, google_form_response_id)` |
| 5 | `fix_candidates_form_sync_upsert.sql` | **Optional upgrade** — replaces a partial form-sync index with a full one (see notes) |
| 6 | `add_interview_evaluations.sql` | `interview_evaluations` table for interview round decisions |
| 7 | `add_save_resume_review.sql` | `save_resume_review()` RPC (atomic review save + optional flag) |
| 8 | `add_resume_review_unique_per_grader.sql` | One review per grader per resume per cycle; duplicate guard in RPC |
| 9 | `add_round_decisions.sql` | Committee round decisions (`advance` / `hold` / `reject`) for live scoreboard deliberation |
| 10 | `add_round_notifications.sql` | Advance email templates per round + send audit log |
| 11 | `add_final_round.sql` | Normalizes recruiting rounds to `resume_screen`, `coffee_chat`, and `final_round` |
| 12 | `add_frq_reviews.sql` | FRQ grading table, `frq_review_count` on resumes, `save_frq_review()` RPC |
| 13 | `add_resume_review_overrides.sql` | Admin per-review score overrides for resume screening grades |
| 14 | `alter_resume_review_overrides_scores.sql` | **Legacy only** — migrates single `override_score` to `override_scores` JSONB |
| 15 | `alter_resume_review_overrides_total_score.sql` | Adds `override_score` back for total raw score overrides (e.g. 24/24) |
| 16 | `add_candidate_admin_overrides.sql` | Admin per-candidate notes + score override on the application page |
| 17 | `add_candidate_referrals.sql` | Member referrals (positive counterpart to flags) |
| 18 | `add_candidate_summaries.sql` | Cached AI candidate summaries for the full application view |
| 19 | `backfill_resume_candidate_ids.sql` | **Optional data repair** — link orphan `resumes` to `candidates` by name / Drive file id |
| 20 | `add_auto_variance_candidate_flags.sql` | Prevent duplicate automatic high-variance flags when graders submit simultaneously |

## Notes

- **Fresh database:** run 1–4, then 6–13, 15–18 in order. Skip 5, 14, and 19 unless noted below.
- **Existing database:** skip scripts you have already applied. Each file uses `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` where possible, but re-running `init.sql` or seed blocks in `add_cycles_and_rounds.sql` may fail or duplicate data.
- **`init.sql`** begins with a large commented block (legacy candidate/resume DDL); the active statements start at the `user_role` enum.
- **`fix_candidates_form_sync_upsert.sql` (#5):** Run only if you applied an older `add_cycle_form_config.sql` that created a **partial** unique index (`WHERE google_form_response_id IS NOT NULL`). Fresh installs get the full index from #4 and can skip this. The server also handles form sync without relying on PostgREST upsert.
- **`alter_resume_review_overrides_scores.sql` (#14):** Run only if `resume_review_overrides` was created with a single `override_score` column and no `override_scores`. **Do not run** if you applied the current `add_resume_review_overrides.sql`, which creates both columns.
- **`backfill_resume_candidate_ids.sql` (#19):** Run only when you have `resumes` rows with `candidate_id IS NULL` that should be linked to existing candidates.
