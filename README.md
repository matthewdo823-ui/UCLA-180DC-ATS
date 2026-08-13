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

- **Node.js** 18+ (20+ recommended)
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

Run the SQL migrations in [server/sql/](server/sql/) **once**, in order, in the Supabase SQL Editor (or via `psql`):

1. `init.sql`
2. `add_cycles_and_rounds.sql`
3. `add_google_form_response_id.sql`
4. `add_cycle_form_config.sql`
5. `add_interview_evaluations.sql`
6. `add_save_resume_review.sql`
7. `add_resume_review_unique_per_grader.sql`
8. `add_round_decisions.sql`
9. `add_round_notifications.sql`

See [server/sql/README.md](server/sql/README.md) for details on fresh vs. existing databases.

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
| `PORT` | No | API port (default `3000`) |
| `AUTO_FLAG_VARIANCE_THRESHOLD` | No | Normalized-score spread (0–100) that automatically flags a candidate after two independent reviews; defaults to a conservative `60` |
| `CORS_ALLOWED_ORIGINS` | No | Comma-separated production frontend origins |
| `GOOGLE_CLOUD_KEY_PATH` | For Forms sync | Path to GCP service account JSON |
| `FORM_CONFIG_PATH` | For Forms sync | Path to `form-config.json` (default: `server/form-config.json`) |
| `FORMS_SYNC_CRON` | No | Cron expression for in-process sync (default: every 15 min) |
| `DISABLE_FORMS_SYNC_CRON` | No | Set to `1` when using Vercel cron instead |
| `CRON_SECRET` | For cron | Shared secret for `POST /cron/forms-sync` |
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

Then promote the user to `admin` in Supabase:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@ucla.edu';
```

### 5. Start the app

Open two terminals:

**API server** (from `server/`):

```bash
npm start
# or, with auto-reload (requires nodemon: npm i -g nodemon):
npm run dev
```

**Frontend** (from `client/`):

```bash
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`) and log in.

## Google Forms sync (optional)

Used to pull new applications from a Google Form into the database.

1. Create a GCP service account, enable the **Google Forms API**, and download the JSON key.
2. Place the key at `server/gcp/my-service-account.json` (or set `GOOGLE_CLOUD_KEY_PATH`).
3. Copy and edit the form config:

   ```bash
   cp server/form-config.example.json server/form-config.json
   ```

4. Discover question IDs for your form (from `server/`):

   ```bash
   npm run discover-form-fields
   ```

   Paste the suggested `fieldMap` into `form-config.json`.

5. Restart the API. Sync runs on the cron schedule (`FORMS_SYNC_CRON`) unless `DISABLE_FORMS_SYNC_CRON=1`.

## Roles

| Role | Access |
|------|--------|
| `applicant` | Limited — redirected to no-access for most pages |
| `member` | Grade resumes, view scoreboards |
| `admin` | Full access — user/cycle management, grader scoreboard, flagged candidates, scoreboard deliberation & export |

## Production deployment

Typical setup:

- **Frontend** → Vercel (`client/`)
  - Set `VITE_API_URL` to your API base URL
  - Set `API_URL` and `CRON_SECRET` for the Vercel cron proxy ([client/api/cron/forms-sync.js](client/api/cron/forms-sync.js))
  - Cron schedule is defined in [client/vercel.json](client/vercel.json) (every 15 minutes)
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
| `npm run dev` | `server/` | Start API with nodemon |
| `npm run discover-form-fields` | `server/` | Print Google Form question → field map |
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

- **CORS errors** — Ensure `CORS_ALLOWED_ORIGINS` includes your frontend URL. `http://localhost:*` is always allowed in development.
- **Login fails after setup** — Confirm migrations ran and the user exists with a valid `password_hash`.
- **Forms sync not running** — Check `GOOGLE_CLOUD_KEY_PATH`, `form-config.json`, and that the service account can access the form.
- **Port in use** — Change `PORT` in `server/.env` and update `VITE_API_URL` in `client/.env` to match.
