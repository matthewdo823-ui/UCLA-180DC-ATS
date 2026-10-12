# Incident Analysis — Outbound Bandwidth Spike & Service Suspension

**Service:** `resume-screener-api` (Node/Express, Render Hobby workspace)
**Incident window:** Aug 22, 2026, ~18:18–20:01 UTC (12:18–2:01 PM MDT)
**Suspension:** Aug 24, 2026 6:38 AM — "Suspended by Monthly Quota Exceeded"
**Resumed:** Aug 27, 2026 10:59 AM
**Record type:** Maintainer incident analysis

---

## Summary

During a beta-testing session on Aug 22, a group of testers loaded image-heavy
pages backed by the Google Drive image proxy (`GET /view/image`). Because the
proxy caches only in each user's browser and shares no bytes across users, every
tester downloaded every image in full through the Render service. This generated
**2.85 GB of outbound HTTP responses in a single hour** (the 1:00 PM MDT hour),
on top of ~540 MB the hour before. That consumed the Hobby plan's 5 GB monthly
bandwidth allowance, and the service was suspended two days later when the meter
crossed the limit.

No code was deployed on Aug 22. The bug was already live (last deploy Aug 18,
PR #1286 `baf9ed9`); the beta traffic simply exercised it for the first time at
scale.

---

## Timeline (UTC)

- **Aug 18, 19:01** — Last deploy goes live (PR #1286). Image proxy in its current form ships.
- **Aug 22, 18:18:53** — Service cold-starts (`npm start` → "Server running on port 10000"). This is a wake-from-idle on the Free instance, triggered by the first request of the beta burst — **not** a deploy.
- **Aug 22, 18:21–20:01** — Continuous `Proxy error (image)` entries. Most are empty-message failures (connection resets/aborts); a handful are explicit `503`s from Drive. This is the error storm.
- **Aug 22, ~19:00 (1 PM MDT hour)** — Peak: **2.85 GB** HTTP Responses in one hour (prior hour: 540.96 MB).
- **Aug 24, 06:38** — Render suspends the service; monthly bandwidth quota exceeded.
- **Aug 27, 10:59** — Service resumed. **Underlying bug still live at time of writing.**

---

## Root cause

There were two distinct mechanisms. One spent the bandwidth; the other filled the logs.

### 1. The bandwidth (the 2.85 GB) — no cross-user caching

The proxy (`server/src/utils/driveStream.js`) sets exactly one cache directive:

```
Cache-Control: private, max-age=86400
```

This is a **browser-only** cache. `max-age=86400` makes a single user's *repeat*
views of the same image free for a day — but `private` deliberately forbids any
shared or CDN cache from storing the response, because each response is
authorized against one staff member's token and must not be reused for anyone else.

The consequence: **zero byte-sharing across users.** When the beta group opened
the same candidate list, each tester's browser fetched every image fresh, in
full, through Render. A 40-image scoreboard viewed by 8 testers is not 40
downloads — it is 320, despite only 40 unique files existing. At an estimated
~2 MB per full-resolution image, that math reaches 2.85 GB within an hour
(2.85 GB ÷ ~2 MB ≈ ~1,400 full sends).

**Critical point for the fix:** Render bills *outbound* bytes (server → browser).
A server-side cache of the Drive file would only save the Drive → server download
(ingress, which is unbilled). Every browser still receives the full image from
Render. **Adding a server cache will not lower the bill.** The fix has to reduce
bytes leaving Render, not bytes entering it.

### 2. The error storm (the logs) — Drive rate-limiting + retry fan-out + no-cache loop

Once load hit Google Drive hard enough, Drive began rate-limiting: that is the
source of the `503`s and the `403`s. Two design details amplified this into a
self-sustaining loop:

- **Retry fan-out.** Each request tries the Drive API first, then falls back to
  `streamViaPublicUrl` → `fetchPublicDriveStream`, which in the virus-scan-warning
  branch can issue **up to three** `axios.get` calls. Under rate-limiting, one
  client request fans out into two-to-four failing Drive hits.
- **Failures aren't cached.** Error responses are sent with `Cache-Control: no-store`
  (correctly — you don't want a 404 baked in for a day). But that means a failed
  image is re-requested by the frontend on the next render, which regenerates the
  same load, which produces more failures. Fail → don't cache → re-render →
  re-request → more load. It ran ~100 minutes until beta traffic subsided.

---

## Impact

- Service suspended for ~3 days (Aug 24 06:38 → Aug 27 10:59) once the quota tripped.
- Beta testers saw broken/failing images during the incident window.
- 5 GB monthly bandwidth allowance consumed almost entirely by a single hour of one page.

---

## Why the "obvious" fix is the wrong one

The reflexive fix — "cache the Drive file on the server so we stop re-fetching it" —
solves the wrong side of the ledger. It reduces **ingress** (Drive → Render), which
Render does not bill. It does nothing for **egress** (Render → browser), which is
what got metered and what caused the suspension. This is the single most important
thing to get right before writing any code.

---

## Remediation — ordered by impact on the Render bill

1. **Serve thumbnails, not originals, in list/grid views.** *(Biggest, safest win.)*
   A scoreboard showing 40 candidate images needs ~200px previews, not 2 MB
   full-res files. Google Drive exposes a `thumbnailLink` / sized export that cuts
   per-image bytes 20–100×. This alone likely keeps monthly usage well under 5 GB.
   Reserve the full-size proxy for the single-file detail view where the user
   actually opened one resume.

2. **Redirect instead of proxy for full-file views (where possible).** For
   link-shareable files, `302` the browser straight to Drive and let Google serve
   the bytes — **zero Render egress.** Caveat: the current `private` + token design
   implies these files are access-controlled, so this may not be viable for all of
   them. Audit which images are genuinely sensitive vs. link-shareable before
   relying on this.

3. **Fix the retry loop so failures don't re-request forever** and successful
   images reliably populate the browser cache. This stops the compounding load
   pattern from section 2 of the root cause.

### Stability fixes (help reliability, *not* the bill)

- **Coalesce in-flight requests / add a short-lived server cache** so concurrent
  identical requests share one Drive fetch instead of each hammering Drive
  independently. Reduces the rate-limiting that caused the storm.
- **Fix the mid-stream fallback bug** in `streamViaDriveApi`: if the API stream
  fails *after headers are sent* with 403/401/404, the function returns `false` and
  the caller falls through to `streamViaPublicUrl`, which re-downloads and attempts
  to set headers again on an already-started response. Guard the fallback with a
  `res.headersSent` check.
- **Improve error logging.** `sendDriveProxyError` currently logs `err.message`
  alone, which is why most log lines are blank. Add `err.code` and
  `err.response?.status` so upstream 503s vs. connection resets are distinguishable
  next time.

---

## Immediate actions (before re-exposing the page)

The service is live again as of Aug 27 10:59 AM and **the bug is unfixed**. If a
tester reopens the same image-heavy page, the remaining quota can be burned and the
service re-suspended.

- [ ] Pause beta on the image-heavy view, or temporarily stop the frontend from
      rendering those images, until the thumbnail fix lands.
- [ ] Implement remediation #1 (thumbnails in list/grid views).
- [ ] Audit which Drive images are access-controlled vs. link-shareable to decide
      if remediation #2 (redirect) is viable.
- [ ] Fix the retry loop and the `headersSent` fallback bug.
- [ ] Improve proxy error logging.

---

## Notes / non-causes ruled out

- **Not a deploy regression** — last deploy was Aug 18, four days before the spike.
- **Not the background cron** — logs confirm `[formsSync] In-process cron disabled`.
- **The 18:18:53 restart is a symptom, not a cause** — a cold-start from idle
  triggered by the first burst request, not a crash and not a deploy.
