import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthedFetch, useAuth } from "../../auth/AuthContext";
import { candidateApplicationQueryOptions, candidateProfileQueryOptions } from "../../lib/candidateApplicationQuery";
import { qk } from "../../lib/queryKeys";
import { loadResumeBlob } from "../../utils/resumeFiles";
import { normalizeError } from "../../utils/errors";

export default function useCandidateApplication(resumeId, cycleId = null) {
  const authedFetch = useAuthedFetch();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const id = String(resumeId || "").trim();
  const profile = useQuery({
    ...candidateProfileQueryOptions(authedFetch, id, cycleId),
    placeholderData: () => {
      const board = queryClient.getQueriesData({ queryKey: qk.scoreboardRoot() })
        .map(([, data]) => data).find(data => (!cycleId || data?.context?.cycle?.id === cycleId)
          && data?.candidates?.some(c => String(c.id) === id));
      const row = board?.candidates?.find(c => String(c.id) === id);
      return row ? { candidate: { ...row, id: row.candidateId }, resume: { id, name: row.name }, context: board.context } : undefined;
    },
  });
  const verified = profile.isSuccess && !profile.isPlaceholderData;
  const details = useQuery({ ...candidateApplicationQueryOptions(authedFetch, id, cycleId), enabled: verified });
  const responses = useQuery({ ...candidateApplicationQueryOptions(authedFetch, id, cycleId, "responses"), enabled: verified });
  const resume = profile.data?.resume;
  useEffect(() => {
    if (!verified || !resume?.fileUrl || !token) return undefined;
    // Let the shell paint before fetching this candidate's document. The viewer
    // shares this cache/inflight request, so opening it never duplicates bytes.
    const timer = setTimeout(() => {
      loadResumeBlob({ resumeId: id, sourceUrl: resume.fileUrl, authToken: token }).catch(() => {});
    }, 150);
    return () => clearTimeout(timer);
  }, [verified, id, resume?.fileUrl, token]);
  const context = details.data?.context || profile.data?.context;
  return {
    candidate: profile.data?.candidate, resume,
    scoring: details.data?.scoring, signals: details.data?.signals, roundDecision: details.data?.roundDecision,
    contextLabel: context?.cycle ? [context.cycle.name, context.round?.name].filter(Boolean).join(" · ") : "Candidate application",
    loading: Boolean(id) && profile.isPending,
    verified,
    error: !id ? "Missing application id in the URL." : profile.error ? normalizeError(profile.error, "loading profile") : null,
    detailsLoading: details.isPending,
    detailsError: details.error,
    refreshDetails: details.refetch,
    responsesState: { responses: responses.data?.responses, loading: responses.isPending, error: responses.error, onRetry: responses.refetch },
    refresh: profile.refetch,
  };
}
