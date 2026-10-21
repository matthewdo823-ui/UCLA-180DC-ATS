# Contributing

Thank you for improving the ATS. Keep changes small enough to review and include
tests for authorization, persistence, and failure paths when behavior changes.

## Local checks

Run these before opening a pull request:

```bash
bash .github/scripts/check-tracked-secrets.sh
npm ci --prefix server
npm test --prefix server
npm ci --prefix client
npm run lint --prefix client
npm test --prefix client
npm run build --prefix client
```

The database-backed queue tests also use `TEST_DATABASE_URL`; CI supplies a
disposable PostgreSQL instance.

## Data and credentials

Use only synthetic candidate data. Do not attach real resumes, headshots,
application responses, database exports, or production logs to code, issues, or
pull requests. Keep local credentials in ignored files copied from the `.env.example`
templates.

## Database changes

Add a new SQL migration and append it to `server/sql/migrations.json`. Never edit
an already-applied migration. Production plans and applies run only through the
manual database workflow using trusted code from `main`.

## Pull requests

Explain the user-visible behavior, security or privacy impact, and verification
performed. A maintainer must review changes to authentication, authorization,
database migrations, workflows, or secret handling.
