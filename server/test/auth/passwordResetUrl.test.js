const test = require("node:test");
const assert = require("node:assert/strict");
const { resolvePasswordResetUrl } = require("../../src/utils/clientOrigins");

function withEnv(env, fn) {
  const keys = ["PASSWORD_RESET_URL", "CLIENT_URL", "CORS_ALLOWED_ORIGINS"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, env);
  try { fn(); } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
  }
}

test("an explicit PASSWORD_RESET_URL wins", () => {
  withEnv({ PASSWORD_RESET_URL: "https://ats.example.org/reset-password", CORS_ALLOWED_ORIGINS: "https://other.example.org" }, () => {
    assert.equal(resolvePasswordResetUrl("abc", "https://other.example.org"), "https://ats.example.org/reset-password?token=abc");
  });
});

test("the requesting frontend is used when CORS already trusts it", () => {
  withEnv({ CORS_ALLOWED_ORIGINS: "https://ats.example.org" }, () => {
    assert.equal(resolvePasswordResetUrl("abc", "https://ats.example.org"), "https://ats.example.org/reset-password?token=abc");
  });
});

test("an untrusted Origin header is ignored", () => {
  withEnv({ CORS_ALLOWED_ORIGINS: "https://ats.example.org", CLIENT_URL: "https://ats.example.org" }, () => {
    assert.equal(resolvePasswordResetUrl("abc", "https://evil.example.com"), "https://ats.example.org/reset-password?token=abc");
  });
});

test("a bare CLIENT_URL gets the reset route instead of linking to the site root", () => {
  withEnv({ CLIENT_URL: "https://ats.example.org/" }, () => {
    assert.equal(resolvePasswordResetUrl("abc"), "https://ats.example.org/reset-password?token=abc");
  });
});
