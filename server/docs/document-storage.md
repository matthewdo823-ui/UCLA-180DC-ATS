# Candidate document storage

Google Forms continues to own intake and the original Drive files. The ATS copies
original resume bytes (PDF, PNG, JPEG, GIF, or WebP) into the private
`candidate-documents` bucket before graders need them. Headshots use 320px
thumbnails. Postgres stores references and job state, not file bytes.

## Intake and reads

Migration #29 adds a trigger to `resumes`: saving/changing a linked Drive source
and enqueueing its copy are one transaction. This covers batched Forms upserts,
per-row fallback, and other resume imports. Repeating the same source preserves a
ready copy. A changed Drive file ID gets a new `source_version` and storage path.
Forms replacements are new Drive uploads; in-place edits to the bytes of the same
Drive ID are not detected automatically.

The worker downloads originals with a 20 MiB cap and a 60-second deadline, checks
file signatures, uploads, and marks ready only if its source version and lease
still match. A failure uses the existing bounded exponential retry policy. Old
versions and uploads abandoned by expired workers can remain in Storage; remove
unreferenced versions according to the team's retention policy after allowing
existing signed links to expire. Deleting a database row does not delete the object.

`GET /resume/:id/file-access` authorizes the same admin/member audience as candidate
profiles, including historical cycles, and returns a 15-minute signed URL for a
ready copy matching the current Drive source. It sends `Cache-Control: no-store`.
If not ready or Storage signing is unavailable, it returns an authenticated
`GET /resume/:id/file-content?version=...` fallback. That endpoint resolves the
source from the resume row and rejects obsolete versions with 409. Permission
failures never bypass the resolver. Existing `/view/pdf` consumers remain compatible.

The viewer caches file bytes, refreshes a failed/expired signed link once, and can
fall back to Drive. ATS bearer tokens are sent only to the ATS API, never Storage.
Image resume uploads retain their native MIME type. Profile modals and the screener
use the same reader.

## Deployment

1. Apply migration #29 after #28 using the ordered migration runner. Existing
   baseline entries must not be edited. Migration #29 queues no historical files.
2. Deploy the API and updated background worker (`npm run worker` from `server/`).
   They need the usual Supabase service key and Google Drive credentials. The new
   worker uses `claim_candidate_documents`; the old RPC now claims only headshots,
   so old workers cannot consume new resume jobs during rollout. Stop old workers
   before declaring rollout complete.
3. Deploy the frontend after the new file-access endpoint is available.
4. Preview the backfill, then enqueue the desired scope:

   ```sh
   npm run documents:backfill -- --cycle <cycle-uuid>
   npm run documents:backfill -- --cycle <cycle-uuid> --apply
   # Or explicitly include every cycle:
   npm run documents:backfill -- --all-cycles --apply
   ```

   This uses keyset pagination and the canonical resume row under a lock. Repeat
   runs do not reset ready jobs. `--after <resume-uuid>` resumes a stopped scan;
   `--retry-failed` with `--apply` explicitly retries terminal failures.
5. Confirm `documents` progresses pending → active → ready and browser file
   requests go to Storage. Pending jobs retain Drive fallback. Verify replacements,
   expired URLs, historical access, and failed downloads before relying on Storage.

## Verification

`npm test` in `server/` checks transport, resolver, worker, and backfill behavior.
Set `TEST_DATABASE_URL` to an **empty disposable local Postgres database** to run
transactional intake/lease/backfill tests; they never use `SUPABASE_DB_URL` or the
application's configured Supabase project. CI provisions this database. Run
`npm test`, `npm run lint`, and `npm run build` in `client/` for the viewer protocol
and production build.

## Profile loading

The profile UI first reads `GET /scoreboard/:resumeId/application/profile` (basic
candidate fields, contact details and resume reference). Scoreboard navigation uses
its cached candidate as placeholder data while this request completes, and hover
prefetches only this lightweight endpoint. After a successful profile read, free
responses (`/application/responses`), grades/signals (the existing `/application`)
and the AI summary load independently. Each section reports its own loading/error
state. Resume bytes begin downloading after a 150 ms paint window and share the
viewer's cache; PDF rendering still waits until the resume modal is opened.
Neither new endpoint fetches grade history. Both use existing staff authentication
and validate the requested cycle against the resume and candidate.

A read-only sample against the configured database (same candidate, three runs)
measured 94–250 ms for profile, 96–123 ms for responses, and 700–844 ms for the
full application handler. These are local handler/database request timings, not
production browser paint or cold-start guarantees. The profile endpoint includes
`Server-Timing` for subsequent measurement. No additional database index is needed
for this split: its lookup uses the existing resume primary key and candidate FK.

Scoreboard rows use neutral gray selection for clicks, keyboard focus and Up/Down
navigation in both normal and deliberation views. Returning with the profile Back
button restores the selected row. Decision shortcuts remain restricted to editable
deliberations.
