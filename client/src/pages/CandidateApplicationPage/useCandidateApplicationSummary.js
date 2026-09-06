import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthedFetch } from "../../auth/AuthContext";
import { API } from "../../constants/config";
import { qk } from "../../lib/queryKeys";
import { formatResponseError, normalizeError } from "../../utils/errors";

const SUMMARY_STALE_MS = 5 * 60 * 1000;

export default function useCandidateApplicationSummary(resumeId, enabled = true, cycleId = null) {
  const authedFetch = useAuthedFetch();
  const fetchRef = useRef(authedFetch);
  fetchRef.current = authedFetch;
  const queryClient = useQueryClient();
  const id = String(resumeId || "").trim();
  const queryKey = qk.candidateApplicationSummary(id, cycleId);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(null);

  const fetchSummary = useCallback(async (forceRefresh = false) => {
    const params = new URLSearchParams();
    if (forceRefresh) params.set("refresh", "1");
    if (cycleId) params.set("cycleId", cycleId);
    const suffix = params.size ? `?${params.toString()}` : "";
    const res = await fetchRef.current(
      `${API}/scoreboard/${encodeURIComponent(id)}/application/summary${suffix}`
    );

    if (res.status === 503) {
      const json = await res.clone().json().catch(() => ({}));
      if (/not configured/i.test(json.error || "")) {
        return { unavailable: true, summary: "", generatedAt: null };
      }
    }

    if (!res.ok) {
      throw await formatResponseError(
        res,
        "generating application summary",
        "Check GET /scoreboard/:id/application/summary in server/src/routes/resumeRoutes.js"
      );
    }

    const json = await res.json().catch(() => ({}));
    return {
      unavailable: false,
      summary: String(json.summary || "").trim(),
      generatedAt: json.generatedAt || null,
    };
  }, [cycleId, id]);

  const query = useQuery({
    queryKey,
    enabled: Boolean(enabled && id),
    queryFn: () => fetchSummary(false),
    staleTime: SUMMARY_STALE_MS,
  });

  const refresh = useCallback(async () => {
    if (!id) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const result = await fetchSummary(true);
      queryClient.setQueryData(queryKey, result);
    } catch (err) {
      setRefreshError(normalizeError(err, "generating candidate summary"));
    } finally {
      setRefreshing(false);
    }
  }, [fetchSummary, id, queryClient, queryKey]);

  const data = query.data;
  return {
    summary: data?.summary || "",
    generatedAt: data?.generatedAt || null,
    loading: Boolean(enabled && id) && (query.isPending || refreshing),
    error: refreshError || (query.error ? normalizeError(query.error, "generating candidate summary") : null),
    unavailable: data?.unavailable === true,
    refresh,
  };
}
