# UCLA 180DC Recruiting ATS

This is the internal recruiting app for UCLA 180 Degrees Consulting. It started
as a resume screener and now covers most of the recruiting cycle: application
intake, resume and free-response grading, candidate review, round decisions,
interviews, assignments, and recruiting history.

It is an internal operations tool, not an applicant-facing portal.

## How the app fits together

```text
Google Form
    ↓
Candidate + resume import
    ↓
Resume and free-response grading
    ↓
Scoreboard deliberation
    ↓
Coffee chats / interviews
    ↓
Final decisions and round history
```

Admins set up a recruiting cycle, its rounds, the grading rubric, and the
Google Form mapping in **Cycle Management**. Form sync creates candidate and
resume records. Members grade assigned applications, while admins can monitor
progress, review flags and referrals, and inspect a candidate's full profile.

The **Scoreboard** is the committee view. It combines the available scoring
evidence and supports advance, hold, and reject decisions. Finalizing a round
moves advanced candidates into the next round and keeps the old decisions
available as history.

## Current development status

`main` is the stable repository baseline, but active recruiting work is often
reviewed as a stack of pull requests. In a stacked PR, each PR targets the
feature branch directly below it instead of `main`.

That creates one important distinction:

> A stacked PR marked **Merged** has been accepted into its parent feature
> branch. It is not necessarily on `main` or deployed yet.

The current cycle-management, Coffee Chat, and deliberation work was reviewed
through PRs
[#1312](https://github.com/matthewdo823-ui/UCLA-180DC-ATS/pull/1312),
[#1313](https://github.com/matthewdo823-ui/UCLA-180DC-ATS/pull/1313),
[#1314](https://github.com/matthewdo823-ui/UCLA-180DC-ATS/pull/1314), and
[#1315](https://github.com/matthewdo823-ui/UCLA-180DC-ATS/pull/1315).
Check a PR's **base branch** before assuming its code is on `main`.

Database changes are separate from code merges. SQL files under `server/sql/`
must be applied manually, in the documented order, before code that depends on
them is deployed. A prepared migration in Git does not mean the production
Supabase project has already run it.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite, React Router, TanStack Query |
| Backend | Node.js, Express 5 |
| Database | Supabase/PostgreSQL |
| Authentication | JWT and bcrypt |
| Integrations | Google Forms, Google Drive, Gmail, optional Gemini summaries |

## Repository layout

```text
client/             React application
server/             Express API
server/sql/         Supabase migrations and migration runbook
server/scripts/     Google Forms and Gmail setup utilities
server/docs/        Integration-specific documentation
images/             Static project images
```

The frontend and backend are separate Node projects. Install and run them from
their own directories; there is no root command that starts the full app.

## Local setup

### 1. Install dependencies

Use Node.js 22 or newer.

```bash
git clone https://github.com/matthewdo823-ui/UCLA-180DC-ATS.git
cd UCLA-180DC-ATS
npm --prefix server install
npm --prefix client install
```

### 2. Create the database

Create a Supabase project, then follow
[server/sql/README.md](server/sql/README.md). Run migrations once and in the
listed order—not alphabetically. Some files are upgrades or optional repairs,
and rerunning seed migrations can fail or duplicate data.

### 3. Configure the environment

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

At minimum, the server needs `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and a new
`JWT_SECRET`. The client needs `VITE_API_URL`, normally
`http://localhost:3000` for local development.

The example files document the optional Google, Gmail, cron, Gemini, CORS, and
review-goal settings. Never commit `.env` files, Supabase service keys, Google
credentials, refresh tokens, or production secrets.

### 4. Create the first admin

Start the API, register a user, then promote that user in Supabase:

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@ucla.edu","password":"choose-a-password","first_name":"Your","last_name":"Name"}'
```

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@ucla.edu';
```

### 5. Run the app

In one terminal:

```bash
npm --prefix server run dev
```

In another:

```bash
npm --prefix client run dev
```

Open the URL printed by Vite, usually <http://localhost:5173>.

## Google Form and resume sync

Google integration is optional for development but required for real candidate
imports.

1. Create a Google Cloud service account and enable the Forms API.
2. Give it access to the recruiting Form and uploaded Drive files.
3. Set `GOOGLE_CLOUD_KEY_PATH` or `GOOGLE_APPLICATION_CREDENTIALS`.
4. In **Cycle Management**, add the Form URL, discover its fields, review the
   mapping, and save it to that cycle.
5. Run a manual sync or configure one cron owner.

Do not run both the in-process cron and Vercel cron. Set
`DISABLE_FORMS_SYNC_CRON=1` when Vercel owns the schedule. Workspace-only files
may also require domain-wide delegation and `GOOGLE_DRIVE_IMPERSONATE_USER`.

## Roles

| Role | Access |
| --- | --- |
| `applicant` | No internal recruiting access |
| `member` | Assigned grading, candidate views, and scoreboards |
| `admin` | Cycle setup, assignments, users, deliberation, overrides, and exports |

## Checks

There is not yet a backend test suite. Before opening a PR, run the available
frontend and syntax checks:

```bash
npm --prefix client run lint
npm --prefix client run build
node --check server/index.js
find server/src -name '*.js' -print0 | xargs -0 -n1 node --check
```

If a PR changes the database, update
[server/sql/README.md](server/sql/README.md) and state clearly whether the
migration has actually been applied.

## Deployment

The usual split is:

- **Frontend:** Vercel, built from `client/`
- **API:** a Node host such as Railway, Render, or Fly.io
- **Database:** Supabase

Set `VITE_API_URL` to the deployed API, add the frontend origin to
`CORS_ALLOWED_ORIGINS`, and use the same `CRON_SECRET` on both sides when
Vercel proxies the Forms sync cron. See
[server/docs/gmail-setup.md](server/docs/gmail-setup.md) before enabling advance
emails.

## Common problems

- **No candidates appear for grading:** confirm the cycle and resume-screen
  round are active, the Form sync completed, and resume records belong to the
  current cycle.
- **A feature exists in a merged PR but not in production:** check the PR's base
  branch and confirm the stack has reached `main`.
- **A page fails after deployment:** check whether its SQL migration was applied
  to the same Supabase project used by the API.
- **CORS errors:** add the exact frontend origin to
  `CORS_ALLOWED_ORIGINS`.
- **Forms sync fails:** verify the key path, Form access, field mapping, and
  Drive permissions or impersonation settings.
