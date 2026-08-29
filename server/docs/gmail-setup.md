# Gmail setup for advance notifications

The ATS sends plain-text advance emails through the **Gmail API**. Choose **one** path below.

---

## Important: `@gmail.com` vs Google Workspace

| Sender type | Setup path |
|-------------|------------|
| **Personal Gmail** (e.g. `matthewdo823@gmail.com`) | **OAuth** (Path A) — domain-wide delegation does **not** work for `@gmail.com` |
| **Google Workspace** (e.g. `@ucla.edu`) | **Domain-wide delegation** (Path B) |

---

## Path A — Personal Gmail (OAuth) — recommended for `matthewdo823@gmail.com`

### 1. Enable Gmail API

GCP Console → **APIs & Services → Library** → enable **Gmail API**.

### 2. Configure OAuth consent screen

1. **APIs & Services → OAuth consent screen**
2. User type: **External** (unless you have Workspace internal)
3. App name: e.g. `180DC Resume Screener`
4. Add scope: `https://www.googleapis.com/auth/gmail.send`
5. **Test users**: add `matthewdo823@gmail.com` (required while app is in Testing mode)

### 3. Create OAuth client ID

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**
2. Type: **Desktop app** (simplest for the setup script)  
   — or **Web application** with redirect URI: `http://localhost:3000/oauth2callback`
3. Copy **Client ID** and **Client secret** into `server/.env`:

```bash
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=<your-client-secret>
GMAIL_OAUTH_REDIRECT_URI=http://localhost:3000/oauth2callback
GMAIL_SEND_AS=matthewdo823@gmail.com
GMAIL_FROM_NAME=180DC Recruiting
```

### 4. Get a refresh token

From `server/`:

```bash
npm run gmail-oauth-setup
```

Follow the prompts. Paste the printed `GMAIL_REFRESH_TOKEN` into `.env`.

### 5. Verify

```bash
npm run gmail-test-send
```

You should receive `[ATS] Gmail test` at `matthewdo823@gmail.com`.

---

## Path B — Google Workspace (domain-wide delegation)

Use this if you send from a **Workspace** address (not personal `@gmail.com`).

### 1. Enable Gmail API (same as above)

### 2. Enable domain-wide delegation on your service account

1. GCP → **IAM & Admin → Service Accounts**
2. Open the service account used for Forms sync (or create a dedicated one)
3. **Edit** → enable **Enable Google Workspace Domain-wide Delegation**
4. Copy the **Client ID** (numeric)

### 3. Authorize in Google Workspace Admin

1. Go to [admin.google.com](https://admin.google.com)
2. **Security → Access and data control → API controls → Domain-wide delegation**
3. **Add new**
4. Client ID: paste from step 2
5. OAuth scopes:

   ```
   https://www.googleapis.com/auth/gmail.send
   ```

6. **Authorize**

### 4. Server env

```bash
GOOGLE_CLOUD_KEY_PATH=./gcp/my-service-account.json
GMAIL_IMPERSONATE_USER=recruiting@yourdomain.edu
GMAIL_FROM_NAME=180DC Recruiting
```

Do **not** set `GMAIL_REFRESH_TOKEN` if using delegation (OAuth takes precedence when all three OAuth vars are set).

### 5. Verify

```bash
npm run gmail-test-send -- recruiting@yourdomain.edu
```

---

## Database migration

Run once in Supabase SQL Editor:

```
server/sql/add_round_notifications.sql
```

---

## Using in the app

1. Scoreboard → **Deliberation** mode
2. **Advance email** — edit subject/body (defaults auto-filled with `{{variables}}`)
3. **Send test to me** — sends to your logged-in admin email
4. Close the round
5. **Email advanced (N)** — batch send to all advanced candidates

Batch send is blocked until the round is **closed**. Resend is available after the first batch (with confirmation).

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Gmail is not configured` | Complete Path A or B env vars |
| `unauthorized_client` / delegation errors | Path B: delegation not authorized or wrong Client ID |
| `invalid_grant` | Wrong impersonation user, or OAuth token revoked — re-run `gmail-oauth-setup` |
| `Access blocked: app not verified` | Add yourself as a **Test user** on OAuth consent screen |
| `Insufficient Permission` | Scope missing from consent screen or delegation |
| Personal `@gmail.com` + delegation | Switch to Path A (OAuth) — delegation cannot impersonate consumer Gmail |

---

## Production

Copy the same env vars to your API host. For OAuth, the refresh token does not expire unless revoked. Keep `GMAIL_CLIENT_SECRET` and `GMAIL_REFRESH_TOKEN` secret.

If the OAuth app stays in **Testing** mode, only listed test users can authorize. For a club tool, Testing mode is usually enough; publishing the app requires Google verification for sensitive scopes.
