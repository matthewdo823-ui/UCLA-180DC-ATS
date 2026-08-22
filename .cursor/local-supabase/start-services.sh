#!/usr/bin/env bash
# Bring up the local Supabase-compatible stack: PostgreSQL + PostgREST + gateway proxy.
# Idempotent and safe to run on every boot. Launches the daemons and returns once ready.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="/tmp/local-supabase"
mkdir -p "$LOG_DIR"

POSTGREST_PORT="${LOCAL_POSTGREST_PORT:-3001}"
PROXY_PORT="${LOCAL_SUPABASE_PORT:-3002}"

wait_for() { # host port label
  for _ in $(seq 1 30); do
    if (exec 3<>"/dev/tcp/$1/$2") 2>/dev/null; then exec 3>&- 3<&-; echo "[services] $3 ready on $1:$2"; return 0; fi
    sleep 0.5
  done
  echo "[services] ERROR: $3 did not become ready on $1:$2" >&2
  return 1
}

# --- PostgreSQL ---------------------------------------------------------------
CLUSTER_VER="$(pg_lsclusters -h 2>/dev/null | awk 'NR==1{print $1}')"
CLUSTER_NAME="$(pg_lsclusters -h 2>/dev/null | awk 'NR==1{print $2}')"
if ! pg_isready -q 2>/dev/null; then
  echo "[services] starting PostgreSQL cluster ${CLUSTER_VER}/${CLUSTER_NAME}"
  sudo pg_ctlcluster "$CLUSTER_VER" "$CLUSTER_NAME" start >/dev/null 2>&1 || true
fi
wait_for 127.0.0.1 5432 postgresql

# --- Schema + seed (idempotent) ----------------------------------------------
"$HERE/provision-db.sh"
"$HERE/apply-schema.sh"
"$HERE/seed-dev-data.sh"

# --- PostgREST ----------------------------------------------------------------
if ! (exec 3<>"/dev/tcp/127.0.0.1/$POSTGREST_PORT") 2>/dev/null; then
  echo "[services] starting PostgREST on :$POSTGREST_PORT"
  nohup postgrest "$HERE/postgrest.conf" >"$LOG_DIR/postgrest.log" 2>&1 &
  disown || true
else
  exec 3>&- 3<&-
  echo "[services] PostgREST already running on :$POSTGREST_PORT"
fi
wait_for 127.0.0.1 "$POSTGREST_PORT" postgrest

# --- Gateway proxy (adds the /rest/v1 prefix supabase-js expects) -------------
if ! (exec 3<>"/dev/tcp/127.0.0.1/$PROXY_PORT") 2>/dev/null; then
  echo "[services] starting Supabase gateway proxy on :$PROXY_PORT"
  nohup node "$HERE/proxy.js" >"$LOG_DIR/proxy.log" 2>&1 &
  disown || true
else
  exec 3>&- 3<&-
  echo "[services] proxy already running on :$PROXY_PORT"
fi
wait_for 127.0.0.1 "$PROXY_PORT" proxy

echo "[services] local Supabase-compatible stack is up"
