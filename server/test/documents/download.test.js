const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { fetchDriveResume } = require('../../src/utils/driveResume');
const url = 'https://drive.google.com/file/d/resume123/view';
const pdf = Buffer.from('%PDF-1.4\noriginal resume bytes\n%%EOF');
const response = buffer => ({ data: Readable.from([buffer]) });
test('resume copy uses original Drive media, preserving every PDF byte', async () => {
  const result = await fetchDriveResume(url, { getDrive: async () => ({ files: { get: async (params) => {
    assert.equal(params.alt, 'media'); assert.equal(params.fileId, 'resume123'); return response(pdf);
  } } }), http: { get() { throw new Error('Should not use public fallback'); } } });
  assert.deepEqual(result.buffer, pdf); assert.equal(result.contentType, 'application/pdf');
});
test('image resume keeps its bytes and correct type', async () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  const result = await fetchDriveResume(url, { getDrive: async () => null, http: { get: async () => response(png) } });
  assert.equal(result.contentType, 'image/png'); assert.deepEqual(result.buffer, png);
});
test('private API denial uses only the existing Drive download fallback', async () => {
  let requested;
  const result = await fetchDriveResume(url, { getDrive: async () => ({ files: { get: async () => { throw { code: 403 }; } } }), http: { get: async path => { requested = path; return response(pdf); } } });
  assert.equal(new URL(requested).hostname, 'drive.google.com'); assert.deepEqual(result.buffer, pdf);
});
test('rejects HTML, invalid hosts and oversized chunked downloads', async () => {
  const getDrive = async () => null;
  await assert.rejects(fetchDriveResume(url, { getDrive, http: { get: async () => response(Buffer.from('<html>Login</html>')) } }), /not a supported/);
  await assert.rejects(fetchDriveResume('https://evil.example/open?id=x', { getDrive }), /Invalid Drive/);
  await assert.rejects(fetchDriveResume(url, { getDrive, maxBytes: 10, http: { get: async () => response(pdf) } }), /exceeds/);
});
test('hung downloads are aborted and never uploaded as partial files', async () => {
  const hung = new Readable({ read() {} });
  await assert.rejects(fetchDriveResume(url, { getDrive: async () => null, timeoutMs: 20, http: { get: async () => ({ data: hung }) } }), /timed out/);
  assert.equal(hung.destroyed, true);
});
test('rate limits propagate to worker backoff instead of a second download burst', async () => {
  await assert.rejects(fetchDriveResume(url, { getDrive: async () => ({ files: { get: async () => { throw { code: 429 }; } } }), http: { get() { throw new Error('Should not retry immediately'); } } }), e => e.code === 429);
});
