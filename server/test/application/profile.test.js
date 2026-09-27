const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY ||= 'test-only';
const { createApplicationProfileHandlers } = require('../../src/controllers/applicationProfileController');
const id = '00000000-0000-4000-8000-000000000001';
const cycle = '00000000-0000-4000-8000-000000000002';
const row = { id, cycle_id: cycle, file_url: 'resume-source', candidates: { id, cycle_id: cycle, name: 'Candidate', why_consulting: 'Essay' }, cycles: { id: cycle, name: 'Cycle' } };
function fixture(data = row, { firstResumeError = null } = {}) {
  const calls = [];
  let resumeReads = 0;
  const client = { from(table) {
    calls.push(table);
    const query = { select() { return query; }, eq() { return query; }, async maybeSingle() {
      if (table === 'resumes' && resumeReads++ === 0 && firstResumeError) {
        return { data: null, error: firstResumeError };
      }
      return { data: table === 'app_settings' ? { active_cycle_id: cycle } : data };
    } };
    return query;
  } };
  const res = { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; }, setHeader(key, value) { this.headers[key] = value; }, json(body) { this.body = body; return this; } };
  return { ...createApplicationProfileHandlers({ client }), calls, res };
}
const req = cycleId => ({ params: { resumeId: id }, query: cycleId ? { cycleId } : {} });
test('basic profile requires one database request for an explicit cycle and excludes heavy sections', async () => {
  const f = fixture(); await f.profile(req(cycle), f.res);
  assert.equal(f.res.statusCode, 200);
  assert.deepEqual(f.calls, ['resumes']);
  assert.equal(f.res.body.candidate.name, 'Candidate');
  assert.equal(f.res.body.candidate.whyConsulting, undefined);
  assert.equal(f.res.body.scoring, undefined);
  assert.equal(f.res.headers['Cache-Control'], 'no-store');
  assert.match(f.res.headers['Server-Timing'], /profile;dur=/);
});
test('responses do not wait for grade history or include contact information', async () => {
  const f = fixture(); await f.responses(req(cycle), f.res);
  assert.deepEqual(f.calls, ['resumes']);
  assert.equal(f.res.body.responses.whyConsulting, 'Essay');
  assert.equal(f.res.body.candidate, undefined);
});
test('pre-migration schemas fall back to legacy profile and essay columns', async () => {
  const missingColumn = { code: '42703', message: 'column candidates_1.application_responses does not exist' };
  for (const kind of ['profile', 'responses']) {
    const f = fixture(row, { firstResumeError: missingColumn });
    await f[kind](req(cycle), f.res);
    assert.equal(f.res.statusCode, 200);
    assert.deepEqual(f.calls, ['resumes', 'resumes']);
  }
});
test('default cycle resolves active context; historical explicit cycles do not depend on it', async () => {
  const f = fixture(); await f.profile(req(), f.res);
  assert.equal(f.res.statusCode, 200); assert.deepEqual(f.calls, ['resumes', 'app_settings']);
});
test('missing application and mismatched resume/candidate cycles are rejected in both sections', async () => {
  for (const data of [null, { ...row, cycle_id: id }, { ...row, candidates: { ...row.candidates, cycle_id: id } }]) {
    for (const kind of ['profile', 'responses']) {
      const f = fixture(data); await f[kind](req(cycle), f.res);
      assert.equal(f.res.statusCode, 404); assert.equal(f.res.body.candidate, undefined);
    }
  }
});
test('invalid identifiers are rejected before querying', async () => {
  const f = fixture(); await f.profile(req('invalid'), f.res);
  assert.equal(f.res.statusCode, 400); assert.deepEqual(f.calls, []);
});
