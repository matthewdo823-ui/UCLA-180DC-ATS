import { QueryClient } from "@tanstack/react-query";

/**
 * Shared error shape for query functions so pages keep rendering the same
 * `error.message` strings they did when each hook hand-rolled its own try/catch.
 */
export async function readJsonOrThrow(res, fallbackMessage) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || fallbackMessage);
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
      // One retry smooths over a dropped connection without turning a genuine
      // 500 into four sequential round trips against a slow server.
      retry: 1,
    },
  },
});
