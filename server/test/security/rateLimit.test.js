const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createIpRateLimiter, getClientIp } = require('../../src/middleware/rateLimitMiddleware');

function response() {
  return {
    headers: {},
    statusCode: 200,
    set(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('rate limiter uses Express trusted-proxy result, not a spoofed forwarded header', () => {
  const req = {
    ip: '203.0.113.8',
    headers: { 'x-forwarded-for': '198.51.100.99, 203.0.113.8' },
    socket: { remoteAddress: '10.0.0.4' },
  };
  assert.equal(getClientIp(req), '203.0.113.8');
});

test('rate limiter blocks repeated attempts for one trusted client IP', () => {
  const limit = createIpRateLimiter({ maxAttempts: 2, windowMs: 60_000, errorMessage: 'blocked' });
  const req = { ip: '203.0.113.8', headers: {}, socket: {} };
  let allowed = 0;
  limit(req, response(), () => { allowed += 1; });
  limit(req, response(), () => { allowed += 1; });
  const blocked = response();
  limit(req, blocked, () => { allowed += 1; });
  assert.equal(allowed, 2);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.body.error, 'blocked');
  assert.ok(Number(blocked.headers['Retry-After']) > 0);
});

test('rate limiter bounds distinct client records', () => {
  const limit = createIpRateLimiter({ maxAttempts: 1, windowMs: 60_000, errorMessage: 'blocked', maxTrackedIps: 2 });
  for (const ip of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) {
    limit({ ip, headers: {}, socket: {} }, response(), () => {});
  }
  const retryOldest = response();
  let allowed = false;
  limit({ ip: '203.0.113.1', headers: {}, socket: {} }, retryOldest, () => { allowed = true; });
  assert.equal(allowed, true);
});
