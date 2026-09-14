#!/usr/bin/env node
require('dotenv').config();
const { isGoogleDriveFileUrl } = require('../src/utils/drive');

// Dry-run by default. Use --apply to enqueue; file copying stays in the worker.
async function backfillResumeDocuments(client, { cycleId, allCycles = false, apply = false, retryFailed = false, batchSize = 100, after = null, log = console.log }) {
  if (Boolean(cycleId) === Boolean(allCycles)) throw new Error('Choose --cycle <uuid> or --all-cycles');
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw new Error('Batch size must be 1–500');
  let cursor = after;
  const totals = { scanned: 0, eligible: 0, queued: 0, skipped: 0 };
  for (;;) {
    let query = client.from('resumes').select('id, candidate_id, cycle_id, file_url')
      .order('id').limit(batchSize);
    if (cycleId) query = query.eq('cycle_id', cycleId);
    if (cursor) query = query.gt('id', cursor);
    const { data, error } = await query;
    if (error) throw new Error(`Backfill read failed: ${error.message}`);
    if (!data?.length) break;
    const ids = data.filter(r => r.candidate_id && r.cycle_id && isGoogleDriveFileUrl(r.file_url)).map(r => r.id);
    totals.scanned += data.length;
    totals.eligible += ids.length;
    totals.skipped += data.length - ids.length;
    if (apply && ids.length) {
      const result = await client.rpc('enqueue_resume_documents', { resume_ids: ids, retry_failed: retryFailed });
      if (result.error) throw new Error(`Backfill enqueue failed; resume after ${cursor || 'start'}: ${result.error.message}`);
      totals.queued += Number(result.data) || 0;
    }
    cursor = data[data.length - 1].id;
    log(JSON.stringify({ mode: apply ? 'enqueue' : 'dry-run', ...totals, after: cursor }));
  }
  return totals;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const values = {};
  const flags = new Set();
  for (let i = 0; i < args.length; i++) {
    if (['--cycle', '--after', '--batch-size'].includes(args[i])) values[args[i]] = args[++i];
    else if (['--apply', '--all-cycles', '--retry-failed'].includes(args[i])) flags.add(args[i]);
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  const client = require('../src/config/supabase');
  backfillResumeDocuments(client, {
    cycleId: values['--cycle'], allCycles: flags.has('--all-cycles'),
    apply: flags.has('--apply'), retryFailed: flags.has('--retry-failed'),
    after: values['--after'], batchSize: Number(values['--batch-size'] || 100),
  }).then(totals => console.log(JSON.stringify({ complete: true, ...totals })))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { backfillResumeDocuments };
