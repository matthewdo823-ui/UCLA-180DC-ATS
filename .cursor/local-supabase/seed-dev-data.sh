#!/usr/bin/env bash
# Seed a demo admin user and a couple of sample candidates so the app is usable
# immediately in local development. Idempotent and dev-only: it writes directly to
# the local Postgres database and never touches a real Supabase project.
#
# Demo admin login:  admin@ucla.edu / password123
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
DB="${LOCAL_DB_NAME:-resume_screener}"

psql() { sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" "$@"; }

if [ "$(psql -tAc "SELECT count(*) FROM users")" != "0" ]; then
  echo "[seed] users already present; skipping"
  exit 0
fi

echo "[seed] creating demo admin (admin@ucla.edu / password123)"
# bcrypt hash of "password123" (cost 12), generated with bcryptjs.
ADMIN_HASH="$(node -e "console.log(require('$REPO_ROOT/server/node_modules/bcryptjs').hashSync('password123', 12))")"

psql <<SQL >/dev/null
INSERT INTO users (email, password_hash, role, first_name, last_name, last_login)
VALUES ('admin@ucla.edu', '${ADMIN_HASH}', 'admin', 'Ada', 'Admin', now())
ON CONFLICT (email) DO NOTHING;

DO \$\$
DECLARE cyc UUID;
BEGIN
  SELECT active_cycle_id INTO cyc FROM app_settings WHERE id = 1;
  IF NOT EXISTS (SELECT 1 FROM candidates) THEN
    INSERT INTO candidates (name, email, major, gpa, year, linkedin, resume_file_url, cycle_id)
    VALUES
      ('Jordan Lee',  'jordan@ucla.edu', 'Economics',     '3.8', 'Sophomore', 'https://linkedin.com/in/jordan', 'https://drive.google.com/file/d/DEMO1/view', cyc),
      ('Priya Patel', 'priya@ucla.edu',  'Business Econ', '3.9', 'Junior',    'https://linkedin.com/in/priya',  'https://drive.google.com/file/d/DEMO2/view', cyc);
    INSERT INTO resumes (candidate_id, name, file_url, cycle_id)
    SELECT id, name, resume_file_url, cyc FROM candidates;
  END IF;
END \$\$;
SQL

echo "[seed] done"
