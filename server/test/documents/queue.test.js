const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

const connectionString = process.env.TEST_DATABASE_URL;
const db = connectionString ? new Client({ connectionString }) : null;
const sql = name => readFileSync(`${__dirname}/../../sql/${name}`, 'utf8');
before(async () => {
  if (!db) return;
  await db.connect();
  await db.query(`BEGIN;
    DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE TABLE storage.buckets(id text primary key, name text, public boolean);
    CREATE TABLE public.cycles(id uuid primary key);
    CREATE TABLE public.candidates(id uuid primary key, cycle_id uuid references cycles(id));
    CREATE TABLE public.resumes(id uuid primary key, candidate_id uuid references candidates(id), cycle_id uuid references cycles(id), file_url text);
  `);
  await db.query(sql('add_document_sync_queue.sql'));
  await db.query(sql('add_resume_document_sync.sql'));
});
after(async () => { if (db) { await db.query('ROLLBACK'); await db.end(); } });
beforeEach(async () => { if (db) await db.query('TRUNCATE cycles, candidates, resumes, documents CASCADE'); });
const check = (name, fn) => test(name, { skip: !db && 'Set TEST_DATABASE_URL to an empty disposable Postgres database' }, fn);
async function seed(file = 'source_A') {
  const cycle = randomUUID(), candidate = randomUUID(), resume = randomUUID();
  await db.query('INSERT INTO cycles VALUES ($1)', [cycle]);
  await db.query('INSERT INTO candidates VALUES ($1,$2)', [candidate, cycle]);
  await db.query('INSERT INTO resumes VALUES ($1,$2,$3,$4)', [resume, candidate, cycle, `https://drive.google.com/file/d/${file}/view`]);
  return { cycle, candidate, resume };
}
async function doc() { return (await db.query('SELECT * FROM documents')).rows[0]; }
async function claim() { return (await db.query('SELECT * FROM claim_candidate_documents(10,300)')).rows; }
check('saving a resume queues the original source in the same transaction', async () => {
  await db.query('SAVEPOINT application_import');
  const x = await seed();
  assert.equal((await doc()).kind, 'resume');
  assert.equal((await doc()).candidate_id, x.candidate);
  assert.equal((await doc()).drive_file_id, 'source_A');
  assert.equal((await doc()).sync_status, 'pending');
  await db.query('ROLLBACK TO SAVEPOINT application_import');
  assert.equal((await db.query('SELECT * FROM documents')).rowCount, 0);
});
check('repeated Forms sync preserves a ready copy and its source version', async () => {
  const x = await seed();
  const original = await doc();
  await db.query("UPDATE documents SET sync_status='ready', storage_path='stored.pdf', attempts=1");
  await db.query('UPDATE resumes SET file_url=file_url WHERE id=$1', [x.resume]);
  const current = await doc();
  assert.equal(current.source_version, original.source_version);
  assert.equal(current.storage_path, 'stored.pdf');
  assert.equal(current.sync_status, 'ready');
});
check('replacement invalidates a stale worker completion and gets a new object version', async () => {
  const x = await seed();
  const [old] = await claim();
  await db.query('UPDATE resumes SET file_url=$1 WHERE id=$2', ['https://drive.google.com/open?id=source_B', x.resume]);
  const current = await doc();
  assert.equal(current.drive_file_id, 'source_B');
  assert.notEqual(current.source_version, old.source_version);
  const stale = await db.query("UPDATE documents SET sync_status='ready' WHERE id=$1 AND source_version=$2 AND claim_token=$3", [old.id, old.source_version, old.claim_token]);
  assert.equal(stale.rowCount, 0);
  assert.equal((await doc()).sync_status, 'pending');
});
check('expired leases are reclaimed without accepting the prior lease token', async () => {
  await seed();
  const [first] = await claim();
  assert.equal((await claim()).length, 0);
  await db.query("UPDATE documents SET claimed_at=now()-interval '1 hour'");
  const [second] = await claim();
  assert.notEqual(first.claim_token, second.claim_token);
  assert.equal(second.attempts, 2);
});
check('old headshot workers cannot consume newly queued resumes', async () => {
  const x = await seed();
  await db.query("INSERT INTO documents(candidate_id,cycle_id,kind,drive_file_id,source_url) VALUES($1,$2,'headshot','photo','https://drive.google.com/open?id=photo')", [x.candidate, x.cycle]);
  const legacy = await db.query('SELECT * FROM claim_pending_documents(10,300)');
  assert.deepEqual(legacy.rows.map(r => r.kind), ['headshot']);
  assert.deepEqual((await claim()).map(r => r.kind), ['resume']);
});
check('backfill is idempotent and failed copies require explicit retry', async () => {
  const x = await seed();
  await db.query('DELETE FROM documents');
  assert.equal((await db.query('SELECT enqueue_resume_documents($1) AS count', [[x.resume]])).rows[0].count, 1);
  assert.equal((await db.query('SELECT enqueue_resume_documents($1) AS count', [[x.resume]])).rows[0].count, 0);
  await db.query("UPDATE documents SET sync_status='failed'");
  assert.equal((await db.query('SELECT enqueue_resume_documents($1) AS count', [[x.resume]])).rows[0].count, 0);
  assert.equal((await db.query('SELECT enqueue_resume_documents($1,true) AS count', [[x.resume]])).rows[0].count, 1);
});
check('removing a source cancels its queued/stored reference', async () => {
  const x = await seed();
  await db.query("UPDATE resumes SET file_url='' WHERE id=$1", [x.resume]);
  assert.equal((await db.query('SELECT * FROM documents')).rowCount, 0);
});
check('document queue and worker functions are not public client APIs', async () => {
  const { rows: [row] } = await db.query("SELECT has_function_privilege('anon', 'claim_candidate_documents(integer,integer)', 'EXECUTE') AS anon, has_function_privilege('authenticated', 'enqueue_resume_documents(uuid[],boolean)', 'EXECUTE') AS member, relrowsecurity FROM pg_class WHERE oid='documents'::regclass");
  assert.equal(row.anon, false); assert.equal(row.member, false); assert.equal(row.relrowsecurity, true);
});
