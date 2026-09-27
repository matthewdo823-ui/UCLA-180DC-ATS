const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY ||= 'test-only';
const { createResumeFileHandlers } = require('../../src/controllers/resumeFileController');
const id = '00000000-0000-4000-8000-000000000001';
const candidate = '00000000-0000-4000-8000-000000000002';
const cycle = '00000000-0000-4000-8000-000000000003';
const resume = { id, candidate_id: candidate, cycle_id: cycle, file_url: 'https://drive.google.com/open?id=source_A', candidates: { cycle_id: cycle } };
function clientFor({ resumeRow = resume, document = null, docError = null } = {}) {
  const calls = [];
  return { calls, from(table) {
    const filters = [];
    const q = { select() { return q; }, eq(k,v) { filters.push([k,v]); return q; }, async maybeSingle() {
      calls.push({ table, filters });
      return { data: table === 'resumes' ? resumeRow : document, error: table === 'documents' ? docError : null };
    } }; return q;
  } };
}
function response() { return { statusCode: 200, headers: {}, status(n) { this.statusCode=n; return this; }, setHeader(k,v) { this.headers[k]=v; }, json(x) { this.body=x; return this; } }; }
const request = user => ({ user, params: { id }, query: {} });
test('authorized reader gets a versioned signed link without proxying bytes', async () => {
  const client = clientFor({ document: { storage_path: 'cycle/candidate/resume/v2.pdf', source_version: 'v2', content_type:'application/pdf' } });
  let signed;
  const { fileAccess } = createResumeFileHandlers({ client, sign: async (path,ttl) => { signed={path,ttl}; return 'https://storage.example/file?token=test'; }, stream() { assert.fail('Should not stream on a Storage read'); } });
  const res = response(); await fileAccess(request({ role:'member' }), res);
  assert.equal(res.body.source,'storage'); assert.equal(res.body.version,'v2'); assert.equal(signed.ttl,900);
  assert.equal(res.headers['Cache-Control'],'no-store');
  assert.ok(client.calls[1].filters.some(([k,v])=>k==='drive_file_id' && v==='source_A'));
  assert.ok(client.calls[1].filters.some(([k,v])=>k==='cycle_id' && v===cycle));
});
test('pending, missing-schema and signing failures keep an authorized Drive fallback', async () => {
  for (const config of [{}, { docError:{code:'PGRST205'} }, { document:{ storage_path:'stored.pdf' } }]) {
    const { fileAccess } = createResumeFileHandlers({ client: clientFor(config), sign:async()=>null });
    const res=response(); await fileAccess(request({role:'admin'}),res);
    assert.equal(res.body.source,'drive'); assert.equal(res.body.url,`/resume/${id}/file-content?version=source_A`);
  }
});
test('unauthenticated/unauthorized callers cannot obtain a fallback or signed link', async () => {
  const client=clientFor(); const handlers=createResumeFileHandlers({client});
  for (const [user,status] of [[null,401],[{role:'outsider'},403]]) {
    for (const handler of [handlers.fileAccess,handlers.fileContent]) {
      const res=response(); await handler(request(user),res); assert.equal(res.statusCode,status); assert.equal(res.body.url,undefined);
    }
  }
  assert.equal(client.calls.length,0);
});
test('unknown resume or mismatched candidate cycle is not served', async () => {
  for (const resumeRow of [null,{...resume,candidates:{cycle_id:'other'}}]) {
    const res=response(); await createResumeFileHandlers({client:clientFor({resumeRow})}).fileAccess(request({role:'member'}),res);
    assert.equal(res.statusCode,404);
  }
});
test('fallback resolves the stored URL and rejects an obsolete source version', async () => {
  let streamed;
  const {fileContent}=createResumeFileHandlers({client:clientFor(),stream:async url=>{streamed=url;}});
  const req=request({role:'member'});req.query={version:'old',url:'https://evil.example'};
  const res=response();await fileContent(req,res);assert.equal(res.statusCode,409);assert.equal(streamed,undefined);
  req.query.version='source_A';await fileContent(req,response());assert.equal(streamed,resume.file_url);
});
test('historical profiles retain staff resume access independent of the active cycle', async () => {
  for (const role of ['member', 'board', 'admin']) {
    const res=response();await createResumeFileHandlers({client:clientFor()}).fileAccess(request({role}),res);
    assert.equal(res.statusCode,200);
  }
});
