import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthedFetch } from "../../auth/AuthContext";
import { API } from "../../constants/config";

export default function useCandidateApplicationSummary(resumeId, enabled = true) {
  const authedFetch = useAuthedFetch();
  const fetchRef = useRef(authedFetch);
  fetchRef.current = authedFetch;

  const [summary, setSummary] = useState("");
  const [generatedAt, setGeneratedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);

  const loadSummary = useCallback(async (options = {}) => {
    const id = String(resumeId || "").trim();
    if (!id) return;

    setLoading(true);
    setError("");
    if (!options.preserveSummary) {
      setSummary("");
      setGeneratedAt(null);
    }

    try {
      const url = `${API}/scoreboard/${encodeURIComponent(id)}/application/summary${options.refresh ? "?refresh=1" : ""}`;
      const res = await fetchRef.current(url);
      const json = await res.json().catch(() => ({}));

      if (res.status === 503 && /not configured/i.test(json.error || "")) {
        setUnavailable(true);
        setSummary("");
        setGeneratedAt(null);
        return;
      }

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("Summary endpoint not found — restart the API server and try again.");
        }
        throw new Error(json.error || "Failed to generate summary");
      }

      setUnavailable(false);
      setSummary(String(json.summary || "").trim());
      setGeneratedAt(json.generatedAt || null);
    } catch (err) {
      setError(err?.message || "Failed to generate summary");
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
