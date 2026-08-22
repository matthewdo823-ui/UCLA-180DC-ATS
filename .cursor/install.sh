#!/usr/bin/env bash
# Cloud Agent install phase: durable, idempotent setup after repository checkout.
#   - system deps for the local Supabase-compatible dev stack (PostgreSQL + PostgREST)
#   - Node dependencies for both packages
#   - local .env files (only if absent; real Supabase secrets take precedence)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "== install: system deps =="
"$REPO_ROOT/.cursor/local-supabase/install-system-deps.sh"

echo "== install: node deps =="
npm ci --prefix server
npm ci --prefix client

echo "== install: env files =="
"$REPO_ROOT/.cursor/local-supabase/write-env.sh"

echo "== install: done =="
