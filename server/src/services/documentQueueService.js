const { isGoogleDriveFileUrl, extractDriveFileID } = require("../utils/drive");
const { randomUUID } = require('node:crypto');

/**
 * Enqueue candidate headshots for background copy into Supabase Storage.
 *
 * There is no separate queue to write to: a `documents` row *is* the queue entry,
 * so enqueueing happens in the same insert that records the file. That removes the
 * dual-write failure mode where a row exists but its job was lost (or vice versa).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {Array<{ candidateId: string, headshot: string }>} items
 * @param {string} cycleId
 * @returns {Promise<number>} rows enqueued or re-queued
 */
async function enqueueHeadshotDocuments(client, items, cycleId) {
  const rows = [];
  const seen = new Set();

  for (const { candidateId, headshot } of items) {
    // A headshot that never mapped to a real Drive file renders as initials and
    // has nothing to download — skip rather than queue guaranteed failures.
    if (!candidateId || !isGoogleDriveFileUrl(headshot)) continue;

    const driveFileId = extractDriveFileID(headshot);
    if (!driveFileId) continue;

    // A page can contain the same candidate twice; Postgres rejects an upsert
    // whose batch hits one conflict target more than once.
    if (seen.has(candidateId)) continue;
    seen.add(candidateId);

    rows.push({
      candidate_id: candidateId,
      cycle_id: cycleId,
      kind: "headshot",
      drive_file_id: driveFileId,
      source_url: headshot.trim(),
    });
  }

  if (!rows.length) return 0;

  // ignoreDuplicates so a re-sync of the same page doesn't reset rows the worker
  // has already finished — every tick re-reads responses inside the watermark
  // window, and without this each pass would re-download everything.
  const { error: insertError } = await client
    .from("documents")
    .upsert(rows, { onConflict: "candidate_id,kind", ignoreDuplicates: true });
  if (insertError) throw insertError;

  return rows.length + (await requeueChangedHeadshots(client, rows));
}

/**
 * Google Forms lets a respondent edit a submitted response, which keeps the same
 * response id and therefore updates the existing candidate row in place. When that
 * edit swaps the uploaded headshot, the already-synced document points at the old
 * Drive file — `ignoreDuplicates` above deliberately won't touch it — so those rows
 * are reset here and picked up on the next worker pass.
 */
async function requeueChangedHeadshots(client, rows) {
  const byCandidateId = new Map(rows.map((row) => [row.candidate_id, row]));

  const { data: existing, error } = await client
    .from("documents")
    .select("id, candidate_id, drive_file_id")
    .eq("kind", "headshot")
    .in("candidate_id", [...byCandidateId.keys()]);
  if (error) throw error;

  const stale = (existing || []).filter(
    (row) => row.drive_file_id !== byCandidateId.get(row.candidate_id)?.drive_file_id
  );
  if (!stale.length) return 0;

  const results = await Promise.all(
    stale.map((row) => {
      const fresh = byCandidateId.get(row.candidate_id);
      return client
        .from("documents")
        .update({
          drive_file_id: fresh.drive_file_id,
          source_url: fresh.source_url,
          sync_status: "pending",
          attempts: 0,
          last_error: null,
          next_attempt_at: new Date().toISOString(),
          claimed_at: null,
          storage_path: null,
          source_version: randomUUID(),
          claim_token: null,
          synced_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("drive_file_id", row.drive_file_id);
    })
  );

  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;

  return stale.length;
}

module.exports = { enqueueHeadshotDocuments };
