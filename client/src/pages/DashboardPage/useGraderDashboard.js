import { useCallback, useEffect, useState } from "react";
import { useAuthedFetch } from "../../auth/AuthContext";
import { API } from "../../constants/config";

export default function useGraderDashboard(enabled = true) {
  const authedFetch = useAuthedFetch();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError("");
    try {
      const res = await authedFetch(`${API}/dashboard/grader`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not load dashboard");
      }
      setData(await res.json());
    } catch (err) {
      setData(null);
      setError(err?.message || "Could not load dashboard");
    } finally {
      setLoading(false);
    }
  }, [authedFetch, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
