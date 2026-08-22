// Mint a PostgREST-compatible service_role JWT (HS256) for the local dev API.
// The secret must match jwt-secret in postgrest.conf.
const crypto = require('node:crypto');

const secret = process.env.LOCAL_SUPABASE_JWT_SECRET || 'local-dev-postgrest-jwt-secret-0123456789abcdef';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const header = b64({ alg: 'HS256', typ: 'JWT' });
const payload = b64({ role: 'service_role' });
const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
process.stdout.write(`${header}.${payload}.${sig}`);
