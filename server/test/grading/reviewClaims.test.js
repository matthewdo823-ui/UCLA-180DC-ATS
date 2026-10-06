const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

const connectionString = process.env.TEST_DATABASE_URL;
const db = connectionString ? new Client({ connectionString }) : null;
const sql = name => readFileSync(`${__dirname}/../../sql/${name}`, 'utf8');
let cycle;
let ids;

before(async () => {
  if (!db) return;
  await db.connect();
  await db.query(`BEGIN;
    CREATE TABLE public.cycles(id uuid primary key);
    CREATE TABLE public.users(user_id int primary key);
    CREATE TABLE public.resumes(id uuid primary key, cycle_id uuid references cycles(id),
      review_count int not null default 0, frq_review_count int not null default 0);
  `);
  await db.query(sql('add_review_claims.sql'));
});
after(async () => { if (db) { await db.query('ROLLBACK'); await db.end(); } });
beforeEach(async () => {
  if (!db) return;
  await db.query('TRUNCATE cycles, users, resumes, review_claims CASCADE');
  cycle = randomUUID();
  ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  await db.query('INSERT INTO cycles VALUES ($1)', [cycle]);
  await db.query('INSERT INTO users SELECT generate_series(1, 4)');
  for (const id of ids) await db.query('INSERT INTO resumes (id, cycle_id) VALUES ($1, $2)', [id, cycle]);
});
const check = (name, fn) => test(name, { skip: !db && 'Set TEST_DATABASE_URL to an empty disposable Postgres database' }, fn);
const claim = async (grader, kind = 'resume', queue = ids) =>
  (await db.query('SELECT claim_next_review($1, $2, $3, $4::uuid[]) AS id', [kind, cycle, grader, queue])).rows[0].id;

check('graders who open the queue together are given different resumes', async () => {
  assert.deepEqual([await claim(1), await claim(2), await claim(3)], [ids[0], ids[1], ids[2]]);
});

check('a resume someone else is grading ranks behind every unclaimed resume at that count', async () => {
  await db.query('UPDATE resumes SET review_count = 1 WHERE id = ANY($1)', [[ids[2], ids[3]]]);
  assert.equal(await claim(1), ids[0]);
  assert.equal(await claim(2), ids[1]);
  // Both zero-review resumes are held, so the next grader starts on the next count.
  assert.equal(await claim(3), ids[2]);
});

check('reloading keeps the grader on the resume they already hold', async () => {
  assert.equal(await claim(1), ids[0]);
  await db.query('UPDATE resumes SET review_count = 5 WHERE id = $1', [ids[0]]);
  assert.equal(await claim(1), ids[0]);
});

check('expired claims stop holding their resume', async () => {
  assert.equal(await claim(1), ids[0]);
  await db.query("UPDATE review_claims SET expires_at = now() - interval '1 second'");
  assert.equal(await claim(2), ids[0]);
});

check('resume and FRQ queues are claimed independently', async () => {
  assert.equal(await claim(1, 'resume'), ids[0]);
  assert.equal(await claim(1, 'frq'), ids[0]);
  assert.equal(await claim(2, 'frq'), ids[1]);
  await db.query('UPDATE resumes SET frq_review_count = 1 WHERE id = $1', [ids[2]]);
  assert.equal(await claim(3, 'frq'), ids[3]);
});

check('an empty queue releases the grader\'s claim', async () => {
  await claim(1);
  assert.equal(await claim(1, 'resume', []), null);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM review_claims')).rows[0].n, 0);
});
