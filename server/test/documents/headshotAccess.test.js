const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY ||= 'test-only';

const { createCandidateDocumentHandlers } = require('../../src/controllers/candidateDocumentController');

const candidateId = '00000000-0000-4000-8000-000000000002';
const row = {
  id: candidateId,
  cycle_id: '00000000-0000-4000-8000-000000000003',
  headshot: 'https://drive.google.com/open?id=stored_headshot_version',
};

function clientFor(candidate = row) {
  const calls = [];
  return {
    calls,
    from(table) {
      const filters = [];
      const query = {
        select() { return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        async maybeSingle() { calls.push({ table, filters }); return { data: candidate, error: null }; },
      };
      return query;
    },
  };
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(key, value) { this.headers[key] = value; },
    json(body) { this.body = body; return this; },
  };
}

function request(user = { role: 'member' }, version = 'stored_headshot_version') {
  return { user, params: { candidateId }, query: { version } };
}

test('headshot fallback streams only the URL stored for the candidate', async () => {
  let streamed;
  const client = clientFor();
  const { headshotContent } = createCandidateDocumentHandlers({
    client,
    stream: async (url, _res, options) => { streamed = { url, options }; },
  });
  const res = response();
  await headshotContent(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(streamed.url, row.headshot);
  assert.equal(streamed.options.thumbnailSize, 320);
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
  assert.deepEqual(client.calls[0].filters, [['id', candidateId]]);
});

test('caller cannot substitute a different Drive file version', async () => {
  let streamed = false;
  const { headshotContent } = createCandidateDocumentHandlers({
    client: clientFor(),
    stream: async () => { streamed = true; },
  });
  const res = response();
  await headshotContent(request({ role: 'board' }, 'attacker_chosen_file'), res);
  assert.equal(res.statusCode, 409);
  assert.equal(streamed, false);
});

test('headshot fallback rejects missing, unauthorized and invalid candidates', async () => {
  for (const [req, client, status] of [
    [request(null), clientFor(), 401],
    [request({ role: 'applicant' }), clientFor(), 403],
    [{ user: { role: 'admin' }, params: { candidateId: 'bad' }, query: {} }, clientFor(), 400],
    [request({ role: 'admin' }), clientFor(null), 404],
  ]) {
    const res = response();
    await createCandidateDocumentHandlers({ client }).headshotContent(req, res);
    assert.equal(res.statusCode, status);
  }
});
