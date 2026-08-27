import { QueryClient } from "@tanstack/react-query";
import { formatResponseError } from "../utils/errors";

/**
 * Shared JSON reader for query and fetch functions.
 * Throws a UserFriendlyError on non-2xx responses with status code context,
 * an explanatory sentence, and optional developer diagnostics.
 */
export async function readJsonOrThrow(res, fallbackContext = "loading data", devHint = "") {
  if (!res.ok) {
    throw await formatResponseError(res, fallbackContext, devHint);
  }
  return res.json();
}

export const STALE = {
  // The active cycle changes maybe twice a quarter but is fetched on nearly every
  // page — by far the best caching ratio in the app.
  cycle: 10 * 60 * 1000,
  // Counts drift as graders work. Half a minute of staleness is invisible to a
  // human reading a dashboard, and stale-while-revalidate means they see the old
  // number instantly and the new one a beat later rather than a spinner.
  dashboard: 30 * 1000,
  scoreboard: 30 * 1000,
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Backend is on Render's free tier and cold-starts; refetching on every tab
      // focus would mean regularly paying that latency for data nobody asked to
      // refresh. Explicit reloads and mutation invalidation cover correctness.
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      // Keep unused data around long enough to cover normal navigation, so
      // bouncing between pages reads from cache instead of refetching.
      gcTime: 10 * 60 * 1000,
      staleTime: STALE.dashboard,
      // One retry smooths over a dropped connection or a genuine 5xx without
      // turning it into four sequential round trips against a slow server. But
      // 4xx (401/403/404/422/…) will never succeed on retry — retrying them just
      // doubles a doomed request, the same fan-out that fed the bandwidth
      // incident — so retry only network errors (no status) and 5xx.
      retry: (failureCount, error) => failureCount < 1 && (!error?.status || error.status >= 500),
    },
  },
});
