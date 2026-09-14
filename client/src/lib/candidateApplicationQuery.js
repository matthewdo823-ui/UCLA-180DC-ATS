import { API } from "../constants/config";
import { readJsonOrThrow } from "./queryClient";
import { qk } from "./queryKeys";

const CANDIDATE_APPLICATION_STALE_MS = 30 * 1000;

export function candidateApplicationQueryOptions(authedFetch, resumeId, cycleId = null, section = null) {
  const id = String(resumeId || "").trim();

  return {
    queryKey: [...qk.candidateApplication(id, cycleId), ...(section ? [section] : [])],
    enabled: Boolean(id),
    queryFn: async () => {
      const cycleQuery = cycleId ? `?cycleId=${encodeURIComponent(cycleId)}` : "";
      const res = await authedFetch(`${API}/scoreboard/${encodeURIComponent(id)}/application${section ? `/${section}` : ""}${cycleQuery}`);
      return readJsonOrThrow(
        res,
        "loading candidate application",
        "Check GET /scoreboard/:id/application in server/src/routes/resumeRoutes.js"
      );
    },
    staleTime: CANDIDATE_APPLICATION_STALE_MS,
  };
}

export const candidateProfileQueryOptions = (fetcher, id, cycleId) => candidateApplicationQueryOptions(fetcher, id, cycleId, "profile");
