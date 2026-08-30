import { API } from "../constants/config";
import { readJsonOrThrow, STALE } from "./queryClient";
import { qk } from "./queryKeys";

/**
 * Shared query definition for `/scoreboard`.
 *
 * Both the admin dashboard and the scoreboard page read this endpoint. Defining
 * it once means they share a single cache entry, so moving between those two
 * pages doesn't refetch — and it avoids two different query functions writing to
 * the same key, which is how caches start disagreeing with themselves.
 *
 * `mergeWithCached` exists for the scoreboard page, which needs to protect
 * decisions that are still saving from being overwritten by a background refresh
 * that hasn't seen them yet. Callers with nothing to protect omit it.
 */
export function scoreboardQueryOptions(authedFetch, { roundId = null, cycleId = null, mergeWithCached } = {}) {
  return {
    queryKey: qk.scoreboard(roundId, cycleId),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (roundId) params.set("roundId", roundId);
      if (cycleId) params.set("cycleId", cycleId);
      const query = params.size ? `?${params.toString()}` : "";
      const res = await authedFetch(`${API}/scoreboard${query}`);
      const json = await readJsonOrThrow(
        res,
        "loading the candidate scoreboard",
        "Check /scoreboard endpoint in server/src/routes/dashboardRoutes.js"
      );
      return mergeWithCached ? mergeWithCached(json) : json;
    },
    staleTime: STALE.scoreboard,
  };
}
