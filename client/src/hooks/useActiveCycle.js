import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthedFetch } from "../auth/AuthContext";
import { API } from "../constants/config";
import { isInterviewRoundType, isResumeScreenType } from "../constants/rounds";
import {
  canRecordDecisions,
  canRecordGrades,
  formatRoundPhase,
  isClosedPhase,
} from "../constants/roundPhases";
import { readJsonOrThrow, STALE } from "../lib/queryClient";
import { qk } from "../lib/queryKeys";
import { getRubricForYear } from "../utils/rubric";

export function getGradingPath(activeRound) {
  if (isInterviewRoundType(activeRound?.type)) return "/interviews";
  return "/resume-screener";
}

export function useActiveCycle() {
  const authedFetch = useAuthedFetch();

  const { data, isPending, error, refetch } = useQuery({
    queryKey: qk.activeCycle(),
    queryFn: async () => {
      const res = await authedFetch(`${API}/cycles/active`);
      return readJsonOrThrow(res, "loading the active cycle", "Check GET /cycles/active in server/src/routes/cycleRoutes.js");
    },
    staleTime: STALE.cycle,
  });

  // On failure the previous shape returned empty values alongside the error, and
  // callers destructure these unconditionally — so keep the same nulls rather
  // than surfacing whatever partial data a failed refetch left behind.
  const cycle = error ? null : data?.cycle || null;
  const rounds = error ? [] : (Array.isArray(data?.rounds) ? data.rounds : []);
  const activeRound = error ? null : data?.activeRound || null;
  const loading = isPending;

  const getYearRubric = useCallback((yearRaw) => {
    const rubricConfig = activeRound?.rubricConfig || null;
    return getRubricForYear(rubricConfig, yearRaw);
  }, [activeRound]);

  // A round in setup is not open, so activeRound is null during a setup window.
  // currentRound keeps the label and the page copy meaningful there.
  const currentRound = activeRound || rounds.find((round) => !isClosedPhase(round.status)) || null;

  const phaseLabel = !cycle
    ? "No active cycle"
    : currentRound
      ? `${cycle.name} · ${currentRound.name} · ${formatRoundPhase(currentRound.status)}`
      : `${cycle.name} · No round in progress`;

  const isInterviewRound = isInterviewRoundType(activeRound?.type);
  const isResumeRound = isResumeScreenType(activeRound?.type);

  return {
    cycle,
    rounds,
    activeRound,
    currentRound,
    canGrade: canRecordGrades(activeRound?.status),
    canDeliberate: canRecordDecisions(activeRound?.status),
    loading,
    error: error ? error.message || "Could not load active cycle" : "",
    reload: refetch,
    getYearRubric,
    phaseLabel,
    rubricConfig: activeRound?.rubricConfig || null,
    gradingPath: getGradingPath(activeRound),
    isInterviewRound,
    isResumeRound,
  };
}
