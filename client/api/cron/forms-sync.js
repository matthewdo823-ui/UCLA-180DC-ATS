/**
 * Vercel Cron entrypoint — proxies to the API server's forms sync route.
 *
 * Env (Vercel project):
 *   API_URL — backend base URL (e.g. https://your-api.example.com)
 *   CRON_SECRET — shared secret; Vercel sends it as Authorization: Bearer <CRON_SECRET>
 */

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || "";

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    return res.status(500).json({ error: "API_URL is not configured" });
  }

  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, "")}/cron/forms-sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    });

    const data = await response.json().catch(() => ({}));
    return res.status(response.status).json(data);
  } catch (err) {
    console.error("[formsSync] Vercel cron proxy failed:", err);
    return res.status(500).json({ error: err.message || "Cron proxy failed" });
  }
}
