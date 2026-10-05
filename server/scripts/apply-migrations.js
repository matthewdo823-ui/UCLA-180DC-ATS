#!/usr/bin/env node
/**
 * Apply SQL migrations in the order declared by sql/migrations.json.
 *
 * These migrations were written to be run by hand in the Supabase SQL Editor and
 * are not safe to apply mechanically: the order is curated rather than
 * alphabetical, several are conditional on a given database's state, and init.sql
 * is not idempotent. So this runner never relies on a file being re-runnable —
 * it records what it has applied in `schema_migrations` and runs each file at
 * most once, ever.
 *
 * Usage:
 *   node scripts/apply-migrations.js --plan       # show pending, change nothing
 *   node scripts/apply-migrations.js              # apply pending 'auto' migrations
 *   node scripts/apply-migrations.js --baseline [--through file.sql]
 *                                                # record existing migrations WITHOUT running
 *
 * Requires SUPABASE_DB_URL (or DATABASE_URL) — a Postgres connection string.
 * The Supabase service key will not work: it speaks PostgREST, which cannot
 * execute DDL. From GitHub Actions use the session pooler URL
 * (aws-0-<region>.pooler.supabase.com:5432): the direct db.<ref>.supabase.co
 * host is IPv6-only and hosted runners have no IPv6 route.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dns = require('node:dns');
const { Client } = require('pg');

// GitHub-hosted runners do not consistently have an IPv6 route. Supabase's
// database hostname can resolve to both families, so prefer IPv4 instead of
// intermittently failing before the migration preflight can connect.
dns.setDefaultResultOrder('ipv4first');

const SQL_DIR = path.join(__dirname, '..', 'sql');
const MANIFEST = path.join(SQL_DIR, 'migrations.json');

// Any one of these existing means the database already has the application schema.
const APP_TABLES = ['candidates', 'resumes', 'users'];

// Serializes concurrent runs (two merges landing at once, a manual run racing CI).
// Session-scoped, so it releases when the connection closes even on a crash.
const LOCK_KEY = 8_150_423;

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const PLAN_ONLY = args.has('--plan');
const BASELINE = args.has('--baseline');
const throughIndex = rawArgs.indexOf('--through');
const BASELINE_THROUGH = throughIndex >= 0 ? rawArgs[throughIndex + 1] : null;

function validateArgs() {
  if (throughIndex >= 0 && !BASELINE) {
    throw new Error('--through may only be used with --baseline');
  }
  if (throughIndex >= 0 && (!BASELINE_THROUGH || BASELINE_THROUGH.startsWith('--'))) {
    throw new Error('--through requires a migration filename');
  }
}

function checksum(contents) {
  return crypto.createHash('sha256').update(contents).digest('hex');
}

function loadManifest() {
  const { migrations } = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  return migrations.map((entry) => {
    const filePath = path.join(SQL_DIR, entry.file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Manifest lists ${entry.file}, which does not exist in sql/`);
    }
    const sql = fs.readFileSync(filePath, 'utf8');
    return { ...entry, sql, checksum: checksum(sql) };
  });
}

async function ensureTrackingTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      checksum   TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_by TEXT
    );
  `);
}

/**
 * Refuse to run against a database that already has the schema but no migration
 * history. Without this guard the runner would start at init.sql and fail on an
 * existing production database. Failing loudly with instructions beats a confusing
 * mid-run abort.
 */
async function assertBaselined(client) {
  const { rows: [{ count }] } = await client.query('SELECT count(*)::int AS count FROM schema_migrations');
  if (count > 0) return;

  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[]) LIMIT 1`,
    [APP_TABLES]
  );
  if (!rows.length) return; // genuinely empty database — fine to build from scratch

  throw new Error(
    'This database already has application tables but no schema_migrations history.\n' +
    'Applying from the start would try to re-run init.sql and fail.\n' +
    'Record the existing state first:  npm run migrate:baseline'
  );
}

async function loadApplied(client) {
  const { rows } = await client.query('SELECT filename, checksum FROM schema_migrations');
  return new Map(rows.map((row) => [row.filename, row.checksum]));
}

/**
 * An applied migration whose contents changed means the database and the repo
 * disagree about what actually ran, and no automated fix is safe.
 */
function assertUnchanged(migrations, applied) {
  const drifted = migrations.filter(
    (m) => applied.has(m.file) && applied.get(m.file) !== m.checksum
  );
  if (!drifted.length) return;

  throw new Error(
    'These migrations were edited after being applied:\n' +
    drifted.map((m) => `  - ${m.file}`).join('\n') +
    '\nAn applied migration must never change. Add a new migration instead.'
  );
}

async function record(client, migration) {
  await client.query(
    `INSERT INTO schema_migrations (filename, checksum, applied_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (filename) DO NOTHING`,
    [migration.file, migration.checksum, process.env.GITHUB_ACTOR || 'local']
  );
}

async function main() {
  validateArgs();
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('SUPABASE_DB_URL (or DATABASE_URL) is required');
  }

  const client = new Client({
    connectionString,
    ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await ensureTrackingTable(client);

    const migrations = loadManifest();
    const applied = await loadApplied(client);
    assertUnchanged(migrations, applied);

    if (BASELINE) {
      let baselineMigrations = migrations;
      if (BASELINE_THROUGH) {
        const lastIndex = migrations.findIndex((migration) => migration.file === BASELINE_THROUGH);
        if (lastIndex === -1) throw new Error(`--through names an unknown migration: ${BASELINE_THROUGH}`);
        baselineMigrations = migrations.slice(0, lastIndex + 1);
      }
      const toRecord = baselineMigrations.filter((m) => !applied.has(m.file));
      for (const migration of toRecord) await record(client, migration);
      const suffix = BASELINE_THROUGH ? ` through ${BASELINE_THROUGH}` : '';
      console.log(`Baselined ${toRecord.length} migration(s)${suffix} as already applied. Nothing was executed.`);
      return;
    }

    await assertBaselined(client);

    const pending = migrations.filter((m) => m.mode === 'auto' && !applied.has(m.file));
    const manual = migrations.filter((m) => m.mode === 'manual' && !applied.has(m.file));

    if (manual.length) {
      console.log('Skipping manual migrations (run these by hand if your database needs them):');
      for (const m of manual) console.log(`  - ${m.file}`);
    }

    if (!pending.length) {
      console.log('No pending migrations.');
      return;
    }

    console.log(`${pending.length} pending migration(s):`);
    for (const m of pending) console.log(`  - ${m.file}`);

    if (PLAN_ONLY) {
      console.log('\n--plan: nothing was applied.');
      return;
    }

    for (const migration of pending) {
      process.stdout.write(`Applying ${migration.file} ... `);
      // One transaction per migration: a failure rolls that file back completely
      // and aborts the run, so a partial migration is never recorded as applied.
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await record(client, migration);
        await client.query('COMMIT');
        console.log('ok');
      } catch (err) {
        await client.query('ROLLBACK');
        console.log('FAILED');
        throw new Error(`${migration.file} failed and was rolled back: ${err.message}`);
      }
    }

    console.log(`\nApplied ${pending.length} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  if (err.code === 'ENETUNREACH' && /:[0-9a-f]*:/i.test(err.address || '')) {
    console.error(
      'The database host only resolved to IPv6, which this machine cannot reach.'
      + ' Point SUPABASE_DB_URL at the Supabase session pooler'
      + ' (aws-0-<region>.pooler.supabase.com:5432) instead of db.<ref>.supabase.co.'
    );
  }
  process.exit(1);
});
