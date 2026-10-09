const test = require('node:test');
const assert = require('node:assert/strict');

const { fetchAllRows, fetchAllRowsResult } = require('../../src/utils/supabasePagination');

function pagedQuery(rows, calls, failure = null) {
  return () => ({
    async range(from, to) {
      calls.push([from, to]);
      if (failure && from >= failure.from) return { data: null, error: failure.error };
      return { data: rows.slice(from, to + 1), error: null };
    },
  });
}

test('fetchAllRows reads past Supabase\'s first result page', async () => {
  const rows = Array.from({ length: 2005 }, (_, index) => ({ id: index + 1 }));
  const calls = [];

  const loaded = await fetchAllRows(pagedQuery(rows, calls));

  assert.equal(loaded.length, 2005);
  assert.deepEqual(loaded.at(-1), { id: 2005 });
  assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test('fetchAllRowsResult preserves a later-page database error', async () => {
  const rows = Array.from({ length: 1000 }, (_, index) => ({ id: index + 1 }));
  const calls = [];
  const failure = { from: 1000, error: new Error('second page failed') };

  const result = await fetchAllRowsResult(pagedQuery(rows, calls, failure));

  assert.equal(result.data, null);
  assert.equal(result.error, failure.error);
  assert.deepEqual(calls, [[0, 999], [1000, 1999]]);
});
