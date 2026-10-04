# SQL migrations — run order

**These are applied automatically.** Pushing a change under `server/sql/` to `main`
runs [.github/workflows/migrate.yml](../../.github/workflows/migrate.yml), which
applies any pending migration exactly once and records it in `schema_migrations`.
Pull requests get a read-only plan. You should not need to open the Supabase SQL
Editor for a normal migration.

[`migrations.json`](migrations.json) is the ordered source of truth the runner
reads. **Add new migrations to the end of it**, and never edit or reorder an entry
that has already been applied — the runner checksums applied files and refuses to
continue if one changed.

Entries marked `"mode": "manual"` are never applied automatically: they are
conditional on a given database's state (optional upgrades, legacy-only paths, data
repairs) and stay a human decision.

The table below documents the order and intent; it is kept in sync with
`migrations.json` by hand.

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
| 21 | `add_resume_storage.sql` | **Superseded by #29** — its `resumes.storage_path` / `storage_synced_at` columns are unused; still run it for `idx_resumes_candidate_id` |
| 22 | `add_round_auto_decision_percentages.sql` | Auto-advance/reject percentages + combined percentage constraint |
| 23 | `backfill_resume_candidate_ids.sql` | **Optional data repair** — link orphan `resumes` to `candidates` by name / Drive file id |
| 24 | `allow_frq_score_zero.sql` | **Existing databases only** — allows FRQ grades of 0 in the table constraint and save RPC |
| 25 | `add_candidate_referral_resolution.sql` | **Existing-database upgrade** — adds the referral open/resolved workflow |
| 26 | `add_coffee_chat_scoring_and_groups.sql` | Coffee Chat random groups and per-evaluator Strong Yes / Yes / No / Strong No scoring |
| 27 | `add_interview_group_member_assignments.sql` | Assign each member a persistent starting Coffee Chat table |
| 28 | `add_demonstrated_interest.sql` | Demonstrated Interest events, attendance, per-cycle multiplier steps, and `candidates.university_id` |
| 29 | `add_document_sync_queue.sql` | Candidate document sync queue — Drive → Supabase Storage, plus the private bucket |
| 30 | `add_resume_document_sync.sql` | Atomic resume enqueueing, versioned claims, private queue access, and backfill RPC |
| 31 | `add_round_phases.sql` | **Manual coordinated release** — per-round phases (`setup` / `grading` / `deliberation` / `closed`) |
| 32 | `add_cycle_application_question_mapping.sql` | Additive cycle question catalogs, response snapshots, names, and structured application fields |
| 33 | `repair_fall_26_application_mapping.sql` | **Manual post-deploy repair** — correct Fall '26 mappings before its one-time re-sync |
| 34 | `add_board_role.sql` | Add the `board` database role (member access plus FRQ grading in the application) |
| 35 | `add_cycle_grading_goals.sql` | Per-cycle resume/FRQ grader goals and optional shared-pile completion targets |

## First-time setup on a new database

Nothing special is needed — the runner builds a database from empty, `init.sql`
onward. (Until recently it could not: `init.sql` opened a `/*` block comment that
was never closed, so the core tables were silently skipped. That is fixed, and the
one-off data statements that lived inside the comment were dropped rather than
restored.)

For an existing database that already has the schema (i.e. production), record the
current state once so the runner knows what has already happened:

```bash
cd server
npm run migrate:baseline -- --through add_demonstrated_interest.sql
```

That records migrations #1–#28 in `schema_migrations` **without executing
anything**. Do not baseline newer entries unless they are already present in the
database. Until the existing state is recorded, the runner refuses to touch a
database that has application tables but no migration history.

## Notes

- **Fresh database:** the runner applies auto migrations in manifest order. It skips manual entries #5, #14, #23–25, #31, and #33 until an operator explicitly coordinates them.
- **Existing database:** baseline only the migrations already present in that database. Production currently needs to be baselined through #28 with `npm run migrate:baseline -- --through add_demonstrated_interest.sql` before the runner applies additive migrations #29, #30, and #32.
- **`add_coffee_chat_scoring_and_groups.sql` (#26):** preserves legacy interview rows, changes new Coffee Chat evaluations to one row per evaluator, and adds persistent candidate-to-table assignments.
- **`add_interview_group_member_assignments.sql` (#27):** run after #26 to let admins place members at starting tables. Candidate table movement continues to use the assignment table created by #26.
- **`init.sql`** now creates the candidate/resume core schema for a fresh database; existing production tables are protected by the baseline requirement.
- **`fix_candidates_form_sync_upsert.sql` (#5):** Run only if you applied an older `add_cycle_form_config.sql` that created a **partial** unique index (`WHERE google_form_response_id IS NOT NULL`). Fresh installs get the full index from #4 and can skip this. The server also handles form sync without relying on PostgREST upsert.
- **`alter_resume_review_overrides_scores.sql` (#14):** Run only if `resume_review_overrides` was created with a single `override_score` column and no `override_scores`. **Do not run** if you applied the current `add_resume_review_overrides.sql`, which creates both columns.
- **`add_round_auto_decision_percentages.sql` (#22):** Fresh schemas already have the percentage columns from #2, but this script also adds the combined `advance + reject <= 100` constraint, so run it once.
- **`backfill_resume_candidate_ids.sql` (#23):** Run only when you have `resumes` rows with `candidate_id IS NULL` that should be linked to existing candidates.
- **`allow_frq_score_zero.sql` (#24):** Run on existing databases that already applied `add_frq_reviews.sql`. It updates both the table constraint and `save_frq_review()` RPC so a score of 0 is accepted.
- **`add_round_phases.sql` (#31):** Rewrites `rounds.status` from
  `draft`/`active`/`closed` to `setup`/`grading`/`deliberation`/`closed`.
  **Apply it in the same step as the server release that understands the new
  values** — the old CHECK rejects `setup` and `deliberation`, and the new one
  rejects `draft` and `active`, so the database and API cannot straddle the
  change. The script aborts with a named list if any cycle currently has more
  than one open round; close all but one in each, then re-run.

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

## Resume Storage rollout

Migrations #29 and #30 create the private document queue and resume-sync pipeline. See [document storage](../docs/document-storage.md) for worker deployment and the explicit historical backfill.
