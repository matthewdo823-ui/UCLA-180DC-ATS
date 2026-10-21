const { createClient } = require('@supabase/supabase-js');

// Prefer independently revocable Supabase secret keys. Keep the legacy
// service_role variable only as a temporary fallback during deployment rollout.
const supabaseKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(
    process.env.SUPABASE_URL,
    supabaseKey
);

module.exports = supabase;
