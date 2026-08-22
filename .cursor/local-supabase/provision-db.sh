#!/usr/bin/env bash
# Ensure the local dev database and PostgREST roles exist. Idempotent.
set -euo pipefail

DB="${LOCAL_DB_NAME:-resume_screener}"
AUTHENTICATOR_PASSWORD="${LOCAL_AUTHENTICATOR_PASSWORD:-devpass}"

# Create the application database if it doesn't exist.
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1; then
  echo "[db] creating database $DB"
  sudo -u postgres createdb "$DB"
else
  echo "[db] database $DB already exists"
fi

# Create the PostgREST roles (authenticator + anon + service_role) if missing.
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" <<SQL >/dev/null
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticator') THEN
    CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD '${AUTHENTICATOR_PASSWORD}';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END \$\$;
GRANT anon TO authenticator;
GRANT service_role TO authenticator;
SQL

echo "[db] roles ready"
