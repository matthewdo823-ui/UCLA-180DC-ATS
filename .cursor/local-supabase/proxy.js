// Minimal Supabase-gateway shim for local development.
//
// The Express API talks to Supabase via supabase-js, which issues requests to
// `${SUPABASE_URL}/rest/v1/...` (and `/rest/v1/rpc/...`). Hosted Supabase routes
// those through Kong to PostgREST, stripping the `/rest/v1` prefix. This tiny proxy
// reproduces just that behavior for a local PostgREST instance — no external deps.

const http = require('node:http');

const LISTEN_PORT = Number(process.env.LOCAL_SUPABASE_PORT || 3002);
const POSTGREST_HOST = process.env.LOCAL_POSTGREST_HOST || '127.0.0.1';
const POSTGREST_PORT = Number(process.env.LOCAL_POSTGREST_PORT || 3001);

const server = http.createServer((req, res) => {
  let path = req.url;

  // Strip the Supabase REST prefix; everything after it maps 1:1 to PostgREST.
  if (path.startsWith('/rest/v1')) {
    path = path.slice('/rest/v1'.length) || '/';
  } else if (path === '/health' || path === '/') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'local-supabase-proxy' }));
    return;
  }

  const headers = { ...req.headers, host: `${POSTGREST_HOST}:${POSTGREST_PORT}` };

  const upstream = http.request(
    { host: POSTGREST_HOST, port: POSTGREST_PORT, method: req.method, path, headers },
    (upRes) => {
      res.writeHead(upRes.statusCode || 502, upRes.headers);
      upRes.pipe(res);
    }
  );

  upstream.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'local-supabase-proxy upstream error', detail: String(err) }));
  });

  req.pipe(upstream);
});

server.listen(LISTEN_PORT, '127.0.0.1', () => {
  console.log(`[local-supabase-proxy] :${LISTEN_PORT} -> PostgREST ${POSTGREST_HOST}:${POSTGREST_PORT} (strips /rest/v1)`);
});
