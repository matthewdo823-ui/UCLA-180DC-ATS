import { useCallback, useEffect, useState } from "react";
import { useAuthedFetch } from "../auth/AuthContext";
import { API } from "../constants/config";
import { isInterviewRoundType, isResumeScreenType } from "../constants/rounds";
import { getRubricForYear } from "../utils/rubric";

export function getGradingPath(activeRound) {
  if (isInterviewRoundType(activeRound?.type)) return "/interviews";
  return "/resume-screener";
}

export function useActiveCycle() {
  const authedFetch = useAuthedFetch();
  const [cycle, setCycle] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [activeRound, setActiveRound] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authedFetch(`${API}/cycles/active`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not load active cycle");
      }
      const data = await res.json();
      setCycle(data.cycle || null);
      setRounds(Array.isArray(data.rounds) ? data.rounds : []);
      setActiveRound(data.activeRound || null);
    } catch (e) {
      setCycle(null);
      setRounds([]);
      setActiveRound(null);
      setError(e.message || "Could not load active cycle");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const getYearRubric = useCallback((yearRaw) => {
    const rubricConfig = activeRound?.rubricConfig || null;
    return getRubricForYear(rubricConfig, yearRaw);
  }, [activeRound]);

  const phaseLabel = cycle && activeRound
    ? `${cycle.name} · ${activeRound.name}`
    : cycle
      ? `${cycle.name} · No active round`
      : "No active cycle";

  const isInterviewRound = isInterviewRoundType(activeRound?.type);
  const isResumeRound = isResumeScreenType(activeRound?.type);

  return {
    cycle,
    rounds,
    activeRound,
    loading,
    error,
    reload: load,
    getYearRubric,
    phaseLabel,
    rubricConfig: activeRound?.rubricConfig || null,
    gradingPath: getGradingPath(activeRound),
    isInterviewRound,
    isResumeRound,
  };
}
