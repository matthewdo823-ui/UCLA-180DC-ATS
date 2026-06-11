import { useEffect, useState } from "react";
import { useAuthedFetch } from "../../auth/AuthContext";
import { API } from "../../constants/config";

export default function useCandidateApplication(resumeId) {
  const authedFetch = useAuthedFetch();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadApplication() {
      setLoading(true);
      setError("");
      try {
        const res = await authedFetch(`${API}/scoreboard/${resumeId}/application`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error || "Failed to load application");
        }
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load application");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (resumeId) loadApplication();
    return () => { cancelled = true; };
  }, [authedFetch, resumeId]);

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
