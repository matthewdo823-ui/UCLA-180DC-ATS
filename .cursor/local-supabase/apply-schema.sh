#!/usr/bin/env bash
# Apply the prelude + repository SQL migrations to the local dev database.
# Idempotent: every migration uses IF NOT EXISTS / CREATE OR REPLACE, so re-running is safe.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
SQL_DIR="$REPO_ROOT/server/sql"
DB="${LOCAL_DB_NAME:-resume_screener}"

psql() { sudo -u postgres env PGOPTIONS='--client-min-messages=warning' /usr/bin/psql -v ON_ERROR_STOP=1 -d "$DB" "$@"; }

# init.sql is not self-idempotent (unguarded CREATE TYPE/TABLE), so provision the
# schema only once. A populated `users` table means the DB is already set up.
if [ "$(psql -tAc "SELECT to_regclass('public.users') IS NOT NULL")" = "t" ]; then
  echo "[schema] already provisioned; skipping"
  exit 0
fi

echo "[schema] applying prelude"
psql -f "$HERE/prelude.sql" >/dev/null

# Fresh-install order (see server/sql/README.md), plus the extra tables the API needs
# at runtime (password reset, assignments, storage columns). Legacy/repair scripts and
# the partial->full index fix are intentionally skipped for a fresh database.
MIGRATIONS=(
  init.sql
  add_cycles_and_rounds.sql
  add_google_form_response_id.sql
  add_cycle_form_config.sql
  add_interview_evaluations.sql
  add_save_resume_review.sql
  add_resume_review_unique_per_grader.sql
  add_round_decisions.sql
  add_round_notifications.sql
  add_final_round.sql
  add_frq_reviews.sql
  add_resume_review_overrides.sql
  alter_resume_review_overrides_total_score.sql
  add_candidate_admin_overrides.sql
  add_candidate_referrals.sql
  add_candidate_summaries.sql
  add_password_reset_tokens.sql
  add_resume_assignments.sql
  add_resume_storage.sql
  add_round_auto_decision_percentages.sql
  allow_frq_score_zero.sql
)

for m in "${MIGRATIONS[@]}"; do
  echo "[schema] applying $m"
  psql -f "$SQL_DIR/$m" >/dev/null
done

echo "[schema] applying grants"
psql -f "$HERE/grants.sql" >/dev/null

echo "[schema] done"
