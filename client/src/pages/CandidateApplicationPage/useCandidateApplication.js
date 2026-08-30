import { useQuery } from "@tanstack/react-query";
import { useAuthedFetch } from "../../auth/AuthContext";
import { candidateApplicationQueryOptions } from "../../lib/candidateApplicationQuery";
import { normalizeError } from "../../utils/errors";

export default function useCandidateApplication(resumeId) {
  const authedFetch = useAuthedFetch();
  const id = String(resumeId || "").trim();
  const query = useQuery(candidateApplicationQueryOptions(authedFetch, id));
  const data = query.data;

  const contextLabel = data?.context?.cycle && data?.context?.round
    ? `${data.context.cycle.name} · ${data.context.round.name}`
    : "Candidate application";

  return {
    candidate: data?.candidate,
    resume: data?.resume,
    scoring: data?.scoring,
    signals: data?.signals,
    contextLabel,
    loading: Boolean(id) && query.isPending,
    error: !id
      ? "Missing application id in the URL."
      : query.error
        ? normalizeError(query.error, "loading candidate application")
        : null,
    refresh: query.refetch,
  };
}
