// One-time repair: apply only the existing Coffee Chat participant migration.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL;
  const expected = process.env.EXPECTED_PROJECT_REF;
  if (!connectionString || !expected) throw new Error('Missing database connection or expected project reference');
  const url = new URL(connectionString);
  const directRef = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(url.hostname)?.[1];
  const poolRef = /\.([a-z0-9]+)$/.exec(decodeURIComponent(url.username))?.[1];
  const isPooler = url.hostname.endsWith('.pooler.supabase.com');
  if ((directRef || (isPooler && poolRef)) !== expected) {
    throw new Error('Database secret does not identify the expected Supabase project; no SQL was applied');
  }
  // Match the repository migration runner's Supabase TLS configuration.
  let client = new Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
  } catch (error) {
    await client.end();
    if (!directRef || !['ENETUNREACH', 'EHOSTUNREACH'].includes(error.code)) throw error;
    // This project's DNS address belongs to AWS us-east-1. Session pooling
    // preserves the advisory lock and transaction and supports IPv4 runners.
    let connected = false;
    for (const index of [0, 1, 2]) {
      const pooled = new URL(url);
      pooled.hostname = `aws-${index}-us-east-1.pooler.supabase.com`;
      pooled.port = '5432';
      pooled.username = `postgres.${expected}`;
      client = new Client({ connectionString: pooled.toString(), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
      try {
        await client.connect();
        connected = true;
        console.log('Connected to the expected project through its IPv4 session pooler.');
        break;
      } catch {
        await client.end();
      }
    }
    if (!connected) throw new Error('No session pooler accepted the configured project credentials; no SQL was applied');
  }
  try {
    await client.query("SET statement_timeout = '30s'");
    await client.query('SELECT pg_advisory_lock($1)', [8150423]);
    const parents = await client.query("SELECT to_regclass('public.cycles') AS cycles, to_regclass('public.rounds') AS rounds, to_regclass('public.users') AS users");
    if (Object.values(parents.rows[0]).some(value => !value)) throw new Error('Required parent tables are missing; no SQL was applied');
    const sql = fs.readFileSync(path.join(__dirname, '../sql/add_interview_group_member_assignments.sql'), 'utf8');
    await client.query(sql);
    await client.query('SELECT id, cycle_id, round_id, user_id, group_number, assigned_by, assigned_at, updated_at FROM public.interview_group_member_assignments LIMIT 0');
    const unique = await client.query("SELECT 1 FROM pg_constraint WHERE conrelid = 'public.interview_group_member_assignments'::regclass AND contype = 'u' AND pg_get_constraintdef(oid) = 'UNIQUE (round_id, user_id)'");
    if (!unique.rowCount) throw new Error('Starting-table uniqueness constraint is missing');
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('Coffee Chat participant starting-table schema verified. PostgREST schema reload requested.');
  } finally {
    await client.end();
  }
}

main().catch(error => {
  // Never print the database URL or a connection object's credentials.
  const safeMessages = ['Missing database connection or expected project reference', 'Database secret does not identify the expected Supabase project; no SQL was applied', 'Required parent tables are missing; no SQL was applied', 'Starting-table uniqueness constraint is missing', 'No session pooler accepted the configured project credentials; no SQL was applied'];
  console.error(safeMessages.includes(error.message) ? error.message : `Starting-table setup failed (${error.code || error.name}). Inspect database connectivity/schema; connection details omitted.`);
  process.exitCode = 1;
});
