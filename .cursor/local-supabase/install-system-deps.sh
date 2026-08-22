#!/usr/bin/env bash
# Install the system dependencies for the local Supabase-compatible dev stack:
# PostgreSQL (database) and PostgREST (the REST layer supabase-js talks to).
# Idempotent: skips anything already present.
set -euo pipefail

POSTGREST_VERSION="${POSTGREST_VERSION:-v16.2}"

if ! command -v psql >/dev/null 2>&1; then
  echo "[deps] installing PostgreSQL"
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib
else
  echo "[deps] PostgreSQL already installed"
fi

if ! command -v postgrest >/dev/null 2>&1; then
  echo "[deps] installing PostgREST ${POSTGREST_VERSION}"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/postgrest.tar.xz" \
    "https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/postgrest-${POSTGREST_VERSION}-linux-static-x86-64.tar.xz"
  tar -xf "$tmp/postgrest.tar.xz" -C "$tmp"
  sudo mv "$tmp/postgrest" /usr/local/bin/postgrest
  sudo chmod +x /usr/local/bin/postgrest
  rm -rf "$tmp"
else
  echo "[deps] PostgREST already installed"
fi

echo "[deps] done: $(psql --version | head -1); $(postgrest --version)"
