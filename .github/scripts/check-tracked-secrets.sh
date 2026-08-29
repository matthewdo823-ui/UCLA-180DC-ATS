#!/usr/bin/env bash
set -euo pipefail

# .gitignore prevents new untracked files from being added accidentally, but it
# cannot protect a file that Git already tracks. Check the repository index on
# every push and pull request so a secret-bearing file cannot silently return.
tracked_secret_files=()
while IFS= read -r file; do
  case "$file" in
    .env|*/.env|.env.*|*/.env.*)
      [[ "$file" == *.env.example ]] || tracked_secret_files+=("$file")
      ;;
    server.env|*/server.env|server/form-config.json|server/gcp/*.json|*service-account*.json|*service_account*.json|*-sa.json|*.sa.json|*credentials*.json)
      tracked_secret_files+=("$file")
      ;;
  esac
done < <(git ls-files)

if ((${#tracked_secret_files[@]})); then
  echo "Tracked secret-bearing files are not allowed:"
  printf '  - %s\n' "${tracked_secret_files[@]}"
  echo "Keep local values in ignored files and commit only sanitized *.example templates."
  exit 1
fi

# Print filenames only—never echo a matched credential value into CI logs.
secret_value_files="$({
  git grep -I -l -E \
    '(^|[^A-Z0-9_])(SUPABASE_SERVICE(_ROLE)?_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|JWT_SECRET|CRON_SECRET|GMAIL_CLIENT_SECRET)[[:space:]]*=[[:space:]]*[^#<[:space:]]+' \
    -- . ':(exclude).github/scripts/check-tracked-secrets.sh' ':(exclude)**/node_modules/**' || true
  git grep -I -l -E \
    'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|"(private_key|client_secret)"[[:space:]]*:[[:space:]]*"[^"[:space:]]+' \
    -- . ':(exclude).github/scripts/check-tracked-secrets.sh' ':(exclude)**/node_modules/**' || true
} | sort -u)"

if [[ -n "$secret_value_files" ]]; then
  echo "Possible populated credentials found in tracked files:"
  while IFS= read -r file; do
    [[ -n "$file" ]] && printf '  - %s\n' "$file"
  done <<< "$secret_value_files"
  echo "Replace committed values with empty or clearly synthetic examples."
  exit 1
fi

echo "Tracked secret guard passed."
