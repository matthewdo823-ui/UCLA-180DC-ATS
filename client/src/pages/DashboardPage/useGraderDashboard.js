import { useQuery } from "@tanstack/react-query";
import { useAuthedFetch } from "../../auth/AuthContext";
import { API } from "../../constants/config";
import { readJsonOrThrow, STALE } from "../../lib/queryClient";
import { qk } from "../../lib/queryKeys";

export default function useGraderDashboard(enabled = true) {
  const authedFetch = useAuthedFetch();

  const { data, isPending, error, refetch } = useQuery({
    queryKey: qk.graderDashboard(),
    queryFn: async () => {
      const res = await authedFetch(`${API}/dashboard/grader`);
      return readJsonOrThrow(res, "Could not load dashboard");
    },
    enabled,
    staleTime: STALE.dashboard,
  });

  return {
    data: error ? null : data ?? null,
    // A disabled query sits in `pending` forever; callers treat this hook as
    // idle when disabled, so don't report loading in that case.
    loading: enabled && isPending,
    error: error ? error.message || "Could not load dashboard" : "",
    reload: refetch,
  };
}
