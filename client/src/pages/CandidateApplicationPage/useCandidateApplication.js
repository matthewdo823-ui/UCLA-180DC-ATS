import { useEffect, useRef, useState } from "react";
import { useAuthedFetch } from "../../auth/AuthContext";
import { API } from "../../constants/config";

export default function useCandidateApplication(resumeId) {
  const authedFetch = useAuthedFetch();
  const fetchRef = useRef(authedFetch);
  fetchRef.current = authedFetch;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      setError("");
      try {
        const res = await fetchRef.current(`${API}/scoreboard/${encodeURIComponent(id)}/application`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error || "Failed to load application");
        }
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          const message = err?.message || "Failed to load application";
          setError(
            message === "Failed to fetch"
              ? "Could not reach the API — check that the server is running on port 3000."
              : message
          );
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
    contextLabel,
    loading,
    error,
  };
}
