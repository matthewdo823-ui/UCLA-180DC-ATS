import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthedFetch } from "../../auth/AuthContext";
import { API } from "../../constants/config";
import { formatResponseError, normalizeError } from "../../utils/errors";

export default function useCandidateApplication(resumeId) {
  const authedFetch = useAuthedFetch();
  const fetchRef = useRef(authedFetch);
  fetchRef.current = authedFetch;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    const id = String(resumeId || "").trim();
    if (!id) return;

    setError(null);
    try {
      const res = await fetchRef.current(`${API}/scoreboard/${encodeURIComponent(id)}/application`);
      if (!res.ok) {
        throw await formatResponseError(
          res,
          "loading candidate application",
          "Check GET /scoreboard/:id/application endpoint in server/src/routes/dashboardRoutes.js"
        );
      }
      const json = await res.json().catch(() => ({}));
      setData(json);
    } catch (err) {
      setError(normalizeError(err, "loading candidate application"));
    }
  }, [resumeId]);

  useEffect(() => {
    let cancelled = false;
    const id = String(resumeId || "").trim();

    if (!id) {
      setLoading(false);
      setError("Missing application id in the URL.");
      setData(null);
      return undefined;
    }

    async function loadApplication() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchRef.current(`${API}/scoreboard/${encodeURIComponent(id)}/application`);
        if (!res.ok) {
          throw await formatResponseError(
            res,
            "loading candidate application",
            "Check GET /scoreboard/:id/application endpoint in server/src/routes/dashboardRoutes.js"
          );
        }
        const json = await res.json().catch(() => ({}));
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(normalizeError(err, "loading candidate application"));
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadApplication();
    return () => { cancelled = true; };
  }, [resumeId]);

  const contextLabel = data?.context?.cycle && data?.context?.round
    ? `${data.context.cycle.name} · ${data.context.round.name}`
    : "Candidate application";

  return {
    candidate: data?.candidate,
    resume: data?.resume,
    scoring: data?.scoring,
    signals: data?.signals,
    roundDecision: data?.roundDecision,
    contextLabel,
    loading,
    error,
    refresh,
  };
}
