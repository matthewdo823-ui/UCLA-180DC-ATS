const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('legacy FRQ zero rejection is repaired for inserts, edits, and RPC saves', {
  skip: !process.env.ZERO_SCORE_TEST_DB_URL && 'Set ZERO_SCORE_TEST_DB_URL to an empty disposable Postgres database',
}, async () => {
  const { Client } = require('pg');
  const db = new Client({ connectionString: process.env.ZERO_SCORE_TEST_DB_URL });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query(`
      CREATE TABLE public.resumes (id uuid PRIMARY KEY, frq_review_count integer NOT NULL DEFAULT 0);
      CREATE TABLE public.frq_reviews (
        id serial PRIMARY KEY, resume_id uuid REFERENCES public.resumes(id),
        score smallint NOT NULL CHECK (score BETWEEN 1 AND 4), notes text,
        graded_by integer, cycle_id uuid, round_id uuid,
        CONSTRAINT preserve_notes CHECK (notes IS NOT NULL)
      );
      CREATE FUNCTION public.save_frq_review(uuid, smallint, text, integer, uuid, uuid)
      RETURNS void LANGUAGE plpgsql AS $$ BEGIN
        IF $2 < 1 THEN RAISE EXCEPTION 'legacy RPC rejects zero'; END IF;
      END $$;
      INSERT INTO public.resumes(id) VALUES ('00000000-0000-0000-0000-000000000001');
    `);
    const args = ['00000000-0000-0000-0000-000000000001', 0, 'No relevant response.', 1,
      '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003'];
    const save = 'SELECT public.save_frq_review($1::uuid,$2::smallint,$3::text,$4::integer,$5::uuid,$6::uuid)';
    async function rejects(sql, params, code) {
      await db.query('SAVEPOINT expected_failure');
      await assert.rejects(db.query(sql, params), error => error.code === code);
      await db.query('ROLLBACK TO SAVEPOINT expected_failure');
    }
    await rejects('INSERT INTO public.frq_reviews(score,notes) VALUES (0,$1)', ['test'], '23514');
    await rejects(save, args, 'P0001');
    const migration = fs.readFileSync(path.join(__dirname, '../../sql/ensure_frq_zero_score_support.sql'), 'utf8');
    await db.query(migration);
    await db.query(migration); // Repeatable for already-upgraded installations.
    await db.query(save, args);
    assert.equal((await db.query('SELECT score FROM public.frq_reviews')).rows[0].score, 0);
    assert.equal((await db.query('SELECT frq_review_count FROM public.resumes')).rows[0].frq_review_count, 1);
    await db.query('UPDATE public.frq_reviews SET score = 4');
    await db.query('UPDATE public.frq_reviews SET score = 0');
    await rejects(save, args, '23505');
    for (const invalid of [-1, 5, null]) {
      await rejects(save, [args[0], invalid, ...args.slice(2)], 'P0001');
    }
    await rejects('UPDATE public.frq_reviews SET score = 5', [], '23514');
    await rejects('UPDATE public.frq_reviews SET notes = NULL', [], '23514');
    assert.equal((await db.query('SELECT frq_review_count FROM public.resumes')).rows[0].frq_review_count, 1);
  } finally {
    await db.query('ROLLBACK');
    await db.end();
  }
});
