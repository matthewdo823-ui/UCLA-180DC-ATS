/**
 * Background worker: copies candidate documents out of Google Drive into Supabase
 * Storage, so the read path serves CDN-backed signed URLs instead of proxying a
 * Drive stream on every view.
 *
 * Runs as its own Render Background Worker (`npm run worker`) rather than inside
 * the API process — the whole point is keeping slow, rate-limited Drive I/O off
 * the request path.
 *
 * The queue is the `documents` table itself; see sql/add_document_sync_queue.sql.
 */

require("dotenv").config();

const supabase = require("../config/supabase");
const { fetchDriveThumbnail } = require("../utils/driveStream");
const {
  HEADSHOT_SIZE,
  documentStoragePath,
  uploadDocument,
} = require("../utils/documentStorage");

const BATCH_SIZE = Number(process.env.DOC_SYNC_BATCH_SIZE || 10);
// Deliberately low. The failure mode this whole project exists to fix was Drive
// rate-limiting under a burst, and a background job has no user waiting on it —
// there is nothing to buy by going faster.
const CONCURRENCY = Number(process.env.DOC_SYNC_CONCURRENCY || 3);
const IDLE_POLL_MS = Number(process.env.DOC_SYNC_IDLE_POLL_MS || 30_000);
// Must exceed the worst-case time to process one batch, or a slow batch would be
// reclaimed by the next pass while it is still in flight.
const LEASE_SECONDS = Number(process.env.DOC_SYNC_LEASE_SECONDS || 300);
const MAX_ATTEMPTS = Number(process.env.DOC_SYNC_MAX_ATTEMPTS || 5);

let shuttingDown = false;

/** Capped exponential backoff: ~1m, 2m, 4m, 8m, then give up. */
function backoffMs(attempts) {
  return Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 60 * 60_000);
}

async function claimBatch() {
  const { data, error } = await supabase.rpc("claim_pending_documents", {
    batch_size: BATCH_SIZE,
    lease_seconds: LEASE_SECONDS,
  });
  if (error) throw error;
  return data || [];
}

async function markReady(doc, { storagePath, contentType, sizeBytes }) {
  const { error } = await supabase
    .from("documents")
    .update({
      storage_path: storagePath,
      content_type: contentType,
      size_bytes: sizeBytes,
      sync_status: "ready",
      last_error: null,
      claimed_at: null,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", doc.id);
  if (error) throw error;
}

/**
 * A row that has burned through its attempts goes terminal rather than back to
 * pending. An unbounded retry is exactly the fail -> retry -> fail loop that kept
 * the old image proxy hammering a rate-limited Drive for ~100 minutes.
 */
async function markFailure(doc, err) {
  const exhausted = doc.attempts >= MAX_ATTEMPTS;
  const { error } = await supabase
    .from("documents")
    .update({
      sync_status: exhausted ? "failed" : "pending",
      last_error: String(err?.message || err).slice(0, 500),
      next_attempt_at: new Date(Date.now() + backoffMs(doc.attempts)).toISOString(),
      claimed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", doc.id);
  if (error) throw error;

  if (exhausted) {
    console.error(
      `[docSync] ${doc.kind} ${doc.id} failed permanently after ${doc.attempts} attempts:`,
      err?.message || err
    );
  }
}

async function processDocument(doc) {
  if (doc.kind !== "headshot") {
    // Resumes are Stage 3; leaving them claimable would spin them through the
    // retry budget until they went terminal.
    throw new Error(`Unsupported document kind: ${doc.kind}`);
  }

  // Fetching Drive's rendered thumbnail rather than the original is both the size
  // bound and the format guarantee — Drive transcodes HEIC (the iPhone default,
  // and accepted by the Forms "Image" file type) into a browser-renderable JPEG.
  const { buffer, contentType } = await fetchDriveThumbnail(doc.source_url, HEADSHOT_SIZE);

  const storagePath = documentStoragePath({
    cycleId: doc.cycle_id,
    candidateId: doc.candidate_id,
    kind: doc.kind,
    contentType,
  });

  await uploadDocument(storagePath, buffer, contentType);
  await markReady(doc, { storagePath, contentType, sizeBytes: buffer.length });
}

/** Fixed-size worker pool over one claimed batch. */
async function processBatch(docs) {
  const queue = [...docs];
  let succeeded = 0;
  let failed = 0;

  async function runner() {
    while (queue.length && !shuttingDown) {
      const doc = queue.shift();
      try {
        await processDocument(doc);
        succeeded += 1;
      } catch (err) {
        failed += 1;
        try {
          await markFailure(doc, err);
        } catch (updateErr) {
          // Leave the row 'active' — its lease expires and it gets reclaimed.
          console.error(`[docSync] Could not record failure for ${doc.id}:`, updateErr.message);
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, docs.length) }, runner)
  );
  return { succeeded, failed };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log(
    `[docSync] Worker started (batch=${BATCH_SIZE} concurrency=${CONCURRENCY} lease=${LEASE_SECONDS}s)`
  );

  while (!shuttingDown) {
    let docs;
    try {
      docs = await claimBatch();
    } catch (err) {
      console.error("[docSync] Claim failed:", err.message || err);
      await sleep(IDLE_POLL_MS);
      continue;
    }

    if (!docs.length) {
      await sleep(IDLE_POLL_MS);
      continue;
    }

    const { succeeded, failed } = await processBatch(docs);
    console.log(`[docSync] Batch done. claimed=${docs.length} ok=${succeeded} failed=${failed}`);

    // Only idle once the queue is actually drained, so a backlog clears in
    // back-to-back batches instead of one batch per poll interval.
  }

  console.log("[docSync] Worker stopped.");
}

// Render sends SIGTERM on deploy. Finish the document in flight, then exit; rows
// still claimed are recovered by the lease rather than being stranded 'active'.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    if (shuttingDown) process.exit(1);
    console.log(`[docSync] ${signal} received, finishing in-flight work...`);
    shuttingDown = true;
  });
}

run().catch((err) => {
  console.error("[docSync] Fatal:", err);
  process.exit(1);
});
