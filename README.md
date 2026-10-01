# Resume Screener

Internal ATS for UCLA 180 Degrees Consulting — resume screening, interview management, grader scoreboards, and Google Forms candidate intake.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, Vite, React Router |
| Backend | Node.js, Express 5 |
| Database | Supabase (PostgreSQL) |
| Auth | JWT + bcrypt |
| Integrations | Google Forms API, Google Drive (resumes) |

## Project structure

```
├── client/          # React UI (Vite)
├── server/          # Express API
│   ├── sql/         # Database migrations (run in order)
│   ├── scripts/     # Utility scripts (e.g. Google Form field discovery)
│   └── gcp/         # Google service account key (gitignored)
└── images/          # Static assets
```

## Prerequisites

- **Node.js** 20.19+ (22+ recommended; required by Vite 8)
- A **Supabase** project (URL + service role key)
- For Google Forms sync (optional): a Google Cloud service account with Forms API access

## Quick start (local)

### 1. Clone and install dependencies

```bash
git clone <repo-url>
cd "Resume Screener"

cd server && npm install
cd ../client && npm install
```

### 2. Set up the database

Run the SQL migrations in [server/sql/](server/sql/) **once**, in the order documented in [server/sql/README.md](server/sql/README.md), using the Supabase SQL Editor (or `psql`). That file is the authoritative list for both fresh and existing databases.

Do not run the directory alphabetically. Some files are legacy upgrades or optional data repairs, and rerunning `init.sql` or the cycle seed blocks can fail or duplicate data.

### 3. Configure environment variables

**Server** — copy the example and fill in values:

```bash
cp server/.env.example server/.env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key |
| `JWT_SECRET` | Yes | Secret for signing auth tokens |
| `JWT_EXPIRES_IN` | No | JWT lifetime (default `8h`) |
| `PORT` | No | API port (default `3000`) |
| `CORS_ALLOWED_ORIGINS` | No | Comma-separated production frontend origins |
| `GOOGLE_CLOUD_KEY_PATH` | For Forms/Drive | Path to a real GCP service account JSON file |
| `GOOGLE_APPLICATION_CREDENTIALS` | For Forms/Drive | Standard alternative to `GOOGLE_CLOUD_KEY_PATH` |
| `GOOGLE_DRIVE_IMPERSONATE_USER` | Workspace only | User to impersonate for private Forms/Drive files |
| `FORM_CONFIG_PATH` | Legacy only | Fallback `form-config.json` path; current config is stored per cycle |
| `FORMS_SYNC_CRON` | No | In-process sync schedule (default every 10 minutes) |
| `DISABLE_FORMS_SYNC_CRON` | No | Set to `1` when using Vercel cron instead |
| `CRON_SECRET` | For cron | Shared secret for `POST /cron/forms-sync` |
| `DOC_SYNC_BATCH_SIZE` | No | Documents claimed per worker pass (default `10`) |
| `DOC_SYNC_CONCURRENCY` | No | Parallel Drive downloads in the worker (default `3`) |
| `DOC_SYNC_IDLE_POLL_MS` | No | Worker sleep when the queue is empty (default `30000`) |
| `DOC_SYNC_LEASE_SECONDS` | No | Claim lease before a stalled row is reclaimed (default `300`) |
| `DOC_SYNC_MAX_ATTEMPTS` | No | Attempts before a document is marked `failed` (default `5`) |
| `GRADER_REVIEW_GOAL` | No | Resume-review target per grader (default `30`) |
| `FRQ_REVIEW_GOAL` | No | FRQ-review target (defaults to `GRADER_REVIEW_GOAL`) |
| `PASSWORD_RESET_URL` | No | Frontend reset route (default `http://localhost:5173/reset-password`) |
| `GEMINI_API_KEY` | For AI summaries | Enables candidate summaries; omit to hide them |
| Gmail (advance emails) | Optional | See [server/docs/gmail-setup.md](server/docs/gmail-setup.md) — OAuth for personal Gmail or Workspace delegation |

**Client** — copy the example:

```bash
cp client/.env.example client/.env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | Backend URL (default `http://localhost:3000`) |

### 4. Create an admin user

After migrations, register via the API (or insert directly in Supabase):

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@ucla.edu","password":"your-password","first_name":"Your","last_name":"Name"}'
```

Then approve and promote the user to `admin` in Supabase:

```sql
UPDATE users
SET role = 'admin',
    account_status = 'active',
    approved_at = now()
WHERE email = 'you@ucla.edu';
```

### 5. Start the app

Open two terminals:

**API server** (from `server/`):

```bash
npm start
# or, with Node's built-in auto-reload:
npm run dev
```

**Frontend** (from `client/`):

```bash
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`) and log in.

## Google Forms sync (optional)

Used to pull new applications from a Google Form into the active or draft recruiting cycle.

1. Create a GCP service account, enable the **Google Forms API**, and download the JSON key.
2. Place the key at `server/gcp/my-service-account.json` (or set `GOOGLE_CLOUD_KEY_PATH`).
3. Give that service account read access to the Form and uploaded Drive files. For Workspace-only files, configure `GOOGLE_DRIVE_IMPERSONATE_USER` and domain-wide delegation.
4. In **Cycle Management**, add the Google Form URL to the target cycle, discover the fields, confirm the field mapping, and save it.
5. Use **Sync form** for a manual import, or restart the API to run the configured in-process schedule. Set `DISABLE_FORMS_SYNC_CRON=1` when an external cron owns the schedule.

`server/form-config.json` and `FORM_CONFIG_PATH` remain available only as a legacy fallback. `npm run discover-form-fields` also uses that legacy file unless `GOOGLE_FORM_ID` is supplied.

## Document sync worker

Candidate headshots are copied out of Google Drive into a private Supabase Storage
bucket by a background worker, so the avatar grid is served from Supabase's CDN
instead of proxying a Drive stream per image on every view.

Run `add_document_sync_queue.sql` (migration #29) first — it creates the `documents`
queue table, the `claim_pending_documents` RPC, and the `candidate-documents` bucket.

```bash
cd server && npm run worker
```

On Render, deploy this as a **Background Worker** alongside the web service: same
repo, root directory `server`, build `npm install`, start `npm run worker`, and the
same environment variables as the API (it needs `SUPABASE_URL`,
`SUPABASE_SERVICE_KEY`, and Google Drive credentials).

The queue is the `documents` table itself — the Forms sync enqueues a row as it
records each candidate, and the worker claims batches with `FOR UPDATE SKIP LOCKED`.
Rows that fail back off exponentially and go terminal (`sync_status = 'failed'`)
after `DOC_SYNC_MAX_ATTEMPTS`, so a permanently broken Drive file can't retry forever.

Until a document is synced, the read path falls back to the existing Drive proxy, so
the worker can be deployed before or after the API without breaking images.

## Roles

| Role | Access |
|------|--------|
| `applicant` | Limited — redirected to no-access for most pages |
| `member` | Grade resumes, view scoreboards |
| `board` | Member access plus free-response grading on candidate applications |
| `admin` | Full access — user/cycle management, grader scoreboard, flagged candidates, scoreboard deliberation & export |

New registrations are access requests. They start with `account_status = 'pending'`
and cannot sign in until an admin approves them from **Team access**. Admins can
also deactivate active accounts without deleting their historical ATS activity.

## Production deployment

Typical setup:

- **Frontend** → Vercel (`client/`)
  - Set `VITE_API_URL` to your API base URL
  - Set `API_URL` and `CRON_SECRET` for the Vercel cron proxy ([client/api/cron/forms-sync.js](client/api/cron/forms-sync.js))
  - Cron schedule is defined in [client/vercel.json](client/vercel.json) (currently daily at `00:00` UTC)
- **API** → any Node host (Railway, Render, Fly.io, etc.)
  - Set all server env vars
  - Add your Vercel frontend URL to `CORS_ALLOWED_ORIGINS`
  - Set `DISABLE_FORMS_SYNC_CRON=1` if using Vercel cron
  - Set `CRON_SECRET` to match the Vercel project

Build the frontend for production:

```bash
cd client && npm run build
```

## Useful scripts

| Command | Where | Description |
|---------|-------|-------------|
| `npm start` | `server/` | Start API |
| `npm run dev` | `server/` | Start API with Node's built-in watch mode |
| `npm run worker` | `server/` | Run the document sync worker (Drive → Supabase Storage) |
| `npm run discover-form-fields` | `server/` | Print Google Form question → field map |
| `npm run gmail-oauth-setup` | `server/` | Create a Gmail OAuth refresh token |
| `npm run gmail-test-send` | `server/` | Send a Gmail configuration test |
| `npm run dev` | `client/` | Start Vite dev server |
| `npm run build` | `client/` | Production build |
| `npm run lint` | `client/` | ESLint |

## API overview

| Prefix | Purpose |
|--------|---------|
| `/auth` | Login, register |
| `/cron` | Forms sync trigger (cron secret required) |
| `/` | Resumes, cycles, interviews, users |

All protected routes expect `Authorization: Bearer <token>`.

## Troubleshooting

- **CORS errors** — Ensure `CORS_ALLOWED_ORIGINS` includes your production frontend URL. Local `localhost`, `127.0.0.1`, and IPv6 loopback origins are allowed in development.
- **Login fails after setup** — Confirm migrations ran and the user exists with a valid `password_hash`.
- **Grading has no resumes** — Confirm a cycle and its `resume_screen` round are active, resumes belong to that cycle, and their `file_url` values are Google Drive links.
- **Forms sync not running** — Confirm `GOOGLE_CLOUD_KEY_PATH` points to an existing JSON file, the cycle has a saved Form configuration, and the service account can access the Form and uploaded files.
- **Port in use** — Change `PORT` in `server/.env` and update `VITE_API_URL` in `client/.env` to match.
