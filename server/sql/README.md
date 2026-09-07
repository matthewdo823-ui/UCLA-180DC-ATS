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
| 17 | `add_candidate_referrals.sql` | Member referrals with an admin open/resolved queue |
| 18 | `add_candidate_summaries.sql` | Cached AI candidate summaries for the full application view |
| 19 | `add_password_reset_tokens.sql` | One-time password-reset tokens + atomic reset RPC |
| 20 | `add_resume_assignments.sql` | Admin-directed resume assignments for grader queues |
| 21 | `add_resume_storage.sql` | **Superseded by #28** — its `resumes.storage_path` / `storage_synced_at` columns are unused; still run it for `idx_resumes_candidate_id` |
| 22 | `add_round_auto_decision_percentages.sql` | Auto-advance/reject percentages + combined percentage constraint |
| 23 | `backfill_resume_candidate_ids.sql` | **Optional data repair** — link orphan `resumes` to `candidates` by name / Drive file id |
| 24 | `allow_frq_score_zero.sql` | **Existing databases only** — allows FRQ grades of 0 in the table constraint and save RPC |
| 25 | `add_candidate_referral_resolution.sql` | **Existing-database upgrade** — adds the referral open/resolved workflow |
| 26 | `add_coffee_chat_scoring_and_groups.sql` | Coffee Chat random groups and per-evaluator Strong Yes / Yes / No / Strong No scoring |
| 27 | `add_interview_group_member_assignments.sql` | Assign each member a persistent starting Coffee Chat table |
| 28 | `add_document_sync_queue.sql` | Candidate document sync queue — Drive → Supabase Storage, plus the private bucket |

## Notes

- **Fresh database:** run 1–4, then 6–13, 15–22, and 26–27 in order. Skip 5, 14, and 23–25 unless noted below. Fresh installs of the current `add_frq_reviews.sql` already allow 0–4 FRQ scores, so #24 is only needed on existing databases.
- **Existing database:** skip scripts you have already applied. Each file uses `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` where possible, but re-running `init.sql` or seed blocks in `add_cycles_and_rounds.sql` may fail or duplicate data.
- **`add_coffee_chat_scoring_and_groups.sql` (#26):** preserves legacy interview rows, changes new Coffee Chat evaluations to one row per evaluator, and adds persistent candidate-to-table assignments.
- **`add_interview_group_member_assignments.sql` (#27):** run after #26 to let admins place members at starting tables. Candidate table movement continues to use the assignment table created by #26.
- **`init.sql`** begins with a large commented block (legacy candidate/resume DDL); the active statements start at the `user_role` enum.
- **`fix_candidates_form_sync_upsert.sql` (#5):** Run only if you applied an older `add_cycle_form_config.sql` that created a **partial** unique index (`WHERE google_form_response_id IS NOT NULL`). Fresh installs get the full index from #4 and can skip this. The server also handles form sync without relying on PostgREST upsert.
- **`alter_resume_review_overrides_scores.sql` (#14):** Run only if `resume_review_overrides` was created with a single `override_score` column and no `override_scores`. **Do not run** if you applied the current `add_resume_review_overrides.sql`, which creates both columns.
- **`add_round_auto_decision_percentages.sql` (#22):** Fresh schemas already have the percentage columns from #2, but this script also adds the combined `advance + reject <= 100` constraint, so run it once.
- **`backfill_resume_candidate_ids.sql` (#23):** Run only when you have `resumes` rows with `candidate_id IS NULL` that should be linked to existing candidates.
- **`allow_frq_score_zero.sql` (#24):** Run on existing databases that already applied `add_frq_reviews.sql`. It updates both the table constraint and `save_frq_review()` RPC so a score of 0 is accepted.
- **`add_candidate_referral_resolution.sql` (#25):** Run on existing databases that already applied `add_candidate_referrals.sql` before referral resolution was added.

## Current project migration checklist

- **Required for Coffee Chat grading:** run
  `add_coffee_chat_scoring_and_groups.sql` (#26). Until it is applied, the API
  keeps existing pages readable but disables persistent table assignments and
  per-evaluator Coffee Chat ratings.
- **Required for member starting-table assignments:** run
  `add_interview_group_member_assignments.sql` (#27). Until it is applied,
  admins can still view and rearrange candidate tables, but member starting
  tables remain disabled.
- **Required on the configured existing Supabase project:** run
  `add_candidate_referral_resolution.sql` (#25). The current project has the
  referrals table but does not yet have its `status` and `resolved_at` columns.
- **No database migration is required for profile category labels.** Older
  snapshotless reviews retain their original scores and labels. The API projects
  those labels only when building profile category summaries; original review
  rows and ranking totals remain unchanged.
- **Optional future data backfill:** permanently rewriting legacy review rows
  should happen only after the team decides how retired categories contribute
  to historical totals. That backfill could change rankings and is intentionally
  not included here.
