#!/usr/bin/env bash
# Cloud Agent start phase: per-boot runtime initialization.
# Brings up the local database stack (PostgreSQL + PostgREST + gateway proxy) so the
# API has a working backend. The API and web dev servers run as terminals.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Ensure env files exist even if a snapshot predates them.
"$REPO_ROOT/.cursor/local-supabase/write-env.sh"

"$REPO_ROOT/.cursor/local-supabase/start-services.sh"
