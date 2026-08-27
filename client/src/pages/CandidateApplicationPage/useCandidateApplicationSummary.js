import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthedFetch } from "../../auth/AuthContext";
import { API } from "../../constants/config";
import { formatResponseError, normalizeError } from "../../utils/errors";

export default function useCandidateApplicationSummary(resumeId, enabled = true) {
  const authedFetch = useAuthedFetch();
  const fetchRef = useRef(authedFetch);
  fetchRef.current = authedFetch;

  const [summary, setSummary] = useState("");
  const [generatedAt, setGeneratedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [unavailable, setUnavailable] = useState(false);

  const loadSummary = useCallback(async (options = {}) => {
    const id = String(resumeId || "").trim();
    if (!id) return;

    setLoading(true);
    setError(null);
    if (!options.preserveSummary) {
      setSummary("");
      setGeneratedAt(null);
    }

    try {
      const url = `${API}/scoreboard/${encodeURIComponent(id)}/application/summary${options.refresh ? "?refresh=1" : ""}`;
      const res = await fetchRef.current(url);

      if (res.status === 503) {
        // Probe on a clone so the original body stays unread for
        // formatResponseError below if this turns out to be a real 503.
        const json = await res.clone().json().catch(() => ({}));
        if (/not configured/i.test(json.error || "")) {
          setUnavailable(true);
          setSummary("");
          setGeneratedAt(null);
          return;
        }
      }

      if (!res.ok) {
        throw await formatResponseError(
          res,
          "generating application summary",
          "Check GET /scoreboard/:id/application/summary in server/src/routes/dashboardRoutes.js"
        );
      }

      const json = await res.json().catch(() => ({}));
      setUnavailable(false);
      setSummary(String(json.summary || "").trim());
      setGeneratedAt(json.generatedAt || null);
    } catch (err) {
      setError(normalizeError(err, "generating candidate summary"));
    } finally {
      setLoading(false);
    }
  }, [resumeId]);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    async function run() {
      await loadSummary();
      if (cancelled) return;
    }
    run();
    return () => { cancelled = true; };
  }, [enabled, loadSummary]);

  return {
    summary,
    generatedAt,
    loading,
    error,
    unavailable,
    refresh: () => loadSummary({ preserveSummary: true, refresh: true }),
  };
}
