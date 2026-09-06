import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthedFetch } from "../../auth/AuthContext";
import { API } from "../../constants/config";
import { ROUND_TYPES, isInterviewRoundType, normalizeRoundType } from "../../constants/rounds";
import { readJsonOrThrow, STALE } from "../../lib/queryClient";
import { qk } from "../../lib/queryKeys";
import { scoreboardQueryOptions } from "../../lib/scoreboardQuery";
import { formatReviewCountPair, getFreeResponseReviewCount, getResumeReviewCount } from "../../utils/reviewCounts";

function mapScoreboardToPipeline(scoreboardData, interviewData) {
  const activeRound = scoreboardData?.context?.activeRound;
  const isInterview = isInterviewRoundType(activeRound?.type);

  if (isInterview && interviewData?.stats) {
    const isCoffeeChat = normalizeRoundType(interviewData.context?.round?.type) === ROUND_TYPES.COFFEE_CHAT;
    const stats = isCoffeeChat ? (interviewData.aggregateStats || interviewData.stats) : interviewData.stats;
    const reviewed = isCoffeeChat
      ? stats.graded || 0
      : (stats.pass || 0) + (stats.fail || 0) + (stats.hold || 0);
    return {
      mode: "interview",
      ratingMode: isCoffeeChat ? "coffee_chat" : "decision",
      applicants: stats.total || 0,
      reviewed,
      awaitingReviews: stats.pending || 0,
      totalRatings: stats.totalRatings || 0,
      strongYes: stats.strongYes || 0,
      yes: stats.yes || 0,
      no: stats.no || 0,
      strongNo: stats.strongNo || 0,
      pass: stats.pass || 0,
      fail: stats.fail || 0,
      hold: stats.hold || 0,
      pending: stats.pending || 0,
      undecidedCount: (stats.pending || 0) + (stats.hold || 0),
      personalStats: interviewData.stats || null,
    };
  }

  const stats = scoreboardData?.stats || {};
  const candidates = scoreboardData?.candidates || [];
  const resumeReviewed = candidates.filter((candidate) => getResumeReviewCount(candidate) > 0).length;
  const frqReviewed = candidates.filter((candidate) => getFreeResponseReviewCount(candidate) > 0).length;
  const fullyReviewed = candidates.filter(
    (candidate) => getResumeReviewCount(candidate) > 0 && getFreeResponseReviewCount(candidate) > 0
  ).length;
  const applicants = stats.applicants || 0;
  const undecidedCount = scoreboardData?.context?.undecidedCount
    ?? ((stats.pending || 0) + (stats.hold || 0));

  return {
    mode: "resume",
    applicants,
    reviewed: fullyReviewed,
    resumeReviewed,
    frqReviewed,
    resumeReviewsRemaining: Math.max(0, applicants - resumeReviewed),
    frqReviewsRemaining: Math.max(0, applicants - frqReviewed),
    awaitingReviews: Math.max(0, applicants - fullyReviewed),
    advanced: stats.advanced || 0,
    hold: stats.hold || 0,
    rejected: stats.rejected || 0,
    pending: stats.pending || 0,
    undecidedCount,
  };
}

function mapGraderScoreboard(graderData, frqGraderData) {
  const stats = graderData?.stats || {};
  const frqByGraderId = new Map(
    (frqGraderData?.graders || []).map((grader) => [String(grader.id), grader.reviewCount || 0])
  );
  const graders = (Array.isArray(graderData?.graders) ? graderData.graders : []).map((grader) => ({
    ...grader,
    resumeReviewCount: grader.reviewCount || 0,
    frqReviewCount: frqByGraderId.get(String(grader.id)) || 0,
  }));
  const expectedReviews = stats.expectedReviews || 30;
  const expectedFrqReviews = frqGraderData?.stats?.expectedReviews ?? 0;
  const graderProgress = [...graders].sort((a, b) => {
    const resumeDelta = (b.resumeReviewCount || 0) - (a.resumeReviewCount || 0);
    if (resumeDelta) return resumeDelta;
    const frqDelta = (b.frqReviewCount || 0) - (a.frqReviewCount || 0);
    if (frqDelta) return frqDelta;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  const behindGraders = graders
    .filter((g) => (g.reviewCount || 0) > 0 && (g.reviewCount || 0) < expectedReviews)
    .sort((a, b) => (a.reviewCount || 0) - (b.reviewCount || 0))
    .slice(0, 5);

  const behindCount = graders.filter(
    (g) => (g.reviewCount || 0) > 0 && (g.reviewCount || 0) < expectedReviews
  ).length;

  return {
    graders: stats.graders ?? graders.length,
    activeGraders: stats.activeGraders ?? graders.filter((g) => (g.reviewCount || 0) > 0).length,
    notStarted: graders.filter((g) => (g.reviewCount || 0) === 0).length,
    totalReviews: stats.totalReviews ?? graders.reduce((sum, g) => sum + (g.reviewCount || 0), 0),
    totalResumeGrades: stats.totalReviews ?? graders.reduce((sum, g) => sum + (g.resumeReviewCount || 0), 0),
    totalFrqGrades: frqGraderData?.stats?.totalReviews ?? graders.reduce((sum, g) => sum + (g.frqReviewCount || 0), 0),
    avgReviews: stats.avgReviews ?? 0,
    expectedReviews,
    expectedFrqReviews,
    graderProgress,
    behindGraders,
    behindCount,
    completeCount: graders.filter((g) => (g.reviewCount || 0) >= expectedReviews).length,
  };
}

function mapCoffeeChatGraderScoreboard(graderData) {
  const stats = graderData?.stats || {};
  const graders = Array.isArray(graderData?.graders) ? graderData.graders : [];
  return {
    mode: "coffee_chat",
    graders: stats.graders ?? graders.length,
    activeGraders: stats.activeGraders ?? graders.filter((grader) => (grader.reviewCount || 0) > 0).length,
    notStarted: graders.filter((grader) => (grader.reviewCount || 0) === 0).length,
    totalReviews: stats.totalReviews ?? graders.reduce((sum, grader) => sum + (grader.reviewCount || 0), 0),
    expectedReviews: stats.expectedReviews ?? 0,
    graderProgress: [...graders].sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0) || String(a.name || "").localeCompare(String(b.name || ""))),
  };
}

export default function useAdminDashboard(enabled = true) {
  const authedFetch = useAuthedFetch();

  // Independent cache entries rather than one composite blob. Each is keyed
  // and revalidated on its own, and two of them (/scoreboard, /grader-scoreboard)
  // are the same entries the scoreboard and grader pages read — so navigating
  // between those pages and the dashboard serves from cache instead of refetching.
  const scoreboardQuery = useQuery({
    ...scoreboardQueryOptions(authedFetch),
    enabled,
  });

  const adminQuery = useQuery({
    queryKey: qk.adminDashboard(),
    queryFn: async () => {
      const res = await authedFetch(`${API}/dashboard/admin`);
      return readJsonOrThrow(res, "loading the admin dashboard", "Check GET /dashboard/admin in server/src/routes/dashboardRoutes.js");
    },
    enabled,
    staleTime: STALE.dashboard,
  });

  const activeRoundType = normalizeRoundType(scoreboardQuery.data?.context?.activeRound?.type);
  const isCoffeeChat = activeRoundType === ROUND_TYPES.COFFEE_CHAT;
  const roundContextReady = Boolean(scoreboardQuery.data);

  const graderQuery = useQuery({
    queryKey: qk.graderScoreboard(),
    queryFn: async () => {
      const res = await authedFetch(`${API}/grader-scoreboard`);
      return readJsonOrThrow(res, "loading grader coverage", "Check GET /grader-scoreboard in server/src/routes/resumeRoutes.js");
    },
    enabled: enabled && roundContextReady && !isCoffeeChat,
    staleTime: STALE.dashboard,
  });

  const frqGraderQuery = useQuery({
    queryKey: qk.frqGraderScoreboard(),
    queryFn: async () => {
      const res = await authedFetch(`${API}/frq-grader-scoreboard`);
      return readJsonOrThrow(res, "loading free-response grader coverage", "Check GET /frq-grader-scoreboard in server/src/routes/resumeRoutes.js");
    },
    enabled: enabled && roundContextReady && !isCoffeeChat,
    staleTime: STALE.dashboard,
  });

  const coffeeGraderQuery = useQuery({
    queryKey: qk.coffeeChatGraderScoreboard(),
    queryFn: async () => {
      const res = await authedFetch(`${API}/coffee-chat-grader-scoreboard`);
      return readJsonOrThrow(res, "loading Coffee Chat participant coverage", "Check GET /coffee-chat-grader-scoreboard in server/src/routes/interviewRoutes.js");
    },
    enabled: enabled && roundContextReady && isCoffeeChat,
    staleTime: STALE.dashboard,
  });

  const isInterview = isInterviewRoundType(
    scoreboardQuery.data?.context?.activeRound?.type
  );

  // Dependent query: we can't know whether interview stats are relevant until the
  // scoreboard tells us the round type, so this stays a second hop — but only
  // ever runs for interview rounds.
  const interviewQuery = useQuery({
    queryKey: qk.interviewCandidates(),
    queryFn: async () => {
      const res = await authedFetch(`${API}/interviews/candidates`);
      return readJsonOrThrow(res, "loading interview statistics", "Check GET /interviews/candidates in server/src/routes/interviewRoutes.js");
    },
    enabled: enabled && isInterview,
    staleTime: STALE.dashboard,
  });

  // The scoreboard is the only hard dependency — the dashboard cannot render
  // without it. The remaining queries degrade to defaults.
  const error = scoreboardQuery.error
    ? scoreboardQuery.error.message || "Could not load admin dashboard"
    : "";

  const loading =
    enabled &&
    (scoreboardQuery.isPending ||
      adminQuery.isPending ||
      (!isCoffeeChat && (graderQuery.isPending || frqGraderQuery.isPending)) ||
      (isCoffeeChat && coffeeGraderQuery.isPending) ||
      (isInterview && interviewQuery.isPending));

  const scoreboardData = scoreboardQuery.data;
  const rawAdminData = adminQuery.data;
  const graderData = graderQuery.data ?? null;
  const frqGraderData = frqGraderQuery.data ?? null;
  const coffeeGraderData = coffeeGraderQuery.data ?? null;
  const interviewData = interviewQuery.data ?? null;

  const data = useMemo(() => {
    if (error || !scoreboardData) return null;

    // Defaulted inside the memo so a fresh `{}` on each render doesn't defeat it.
    const adminData = rawAdminData ?? {};

    const pipeline = mapScoreboardToPipeline(scoreboardData, interviewData);
    const graderSummary = isCoffeeChat
      ? (coffeeGraderData ? mapCoffeeChatGraderScoreboard(coffeeGraderData) : null)
      : (graderData ? mapGraderScoreboard(graderData, frqGraderData) : null);

    const actionItems = (adminData.actionItems || []).map((item) => {
      if (item.id === "awaiting-reviews" && pipeline.awaitingReviews != null) {
        if (pipeline.mode === "interview") return {
          ...item,
          label: pipeline.ratingMode === "coffee_chat" ? "Coffee Chat grading in progress" : "Interview evaluations still needed",
          detail: pipeline.ratingMode === "coffee_chat"
            ? `${pipeline.totalRatings || 0} Coffee Chat ratings submitted so far.`
            : `${pipeline.awaitingReviews} candidate evaluations remain.`,
          count: pipeline.awaitingReviews,
        };
        return {
          ...item,
          label: "Grading still left in this round",
          detail: `${formatReviewCountPair(pipeline.resumeReviewsRemaining, pipeline.frqReviewsRemaining)} still needed.`,
          countLabel: formatReviewCountPair(pipeline.resumeReviewsRemaining, pipeline.frqReviewsRemaining),
        };
      }
      if (item.id === "undecided" && pipeline.undecidedCount != null) {
        return { ...item, count: pipeline.undecidedCount };
      }
      if (item.id === "advance-emails" && pipeline.advanced != null) {
        return { ...item, count: pipeline.advanced };
      }
      return item;
    });

    return {
      ...adminData,
      actionItems,
      context: {
        ...adminData.context,
        phaseLabel: scoreboardData?.context?.cycle && scoreboardData?.context?.activeRound
          ? `${scoreboardData.context.cycle.name} · ${scoreboardData.context.activeRound.name}`
          : scoreboardData?.context?.cycle
            ? `${scoreboardData.context.cycle.name} · Between rounds`
            : adminData.context?.phaseLabel || "Admin Dashboard",
        activeRound: scoreboardData?.context?.activeRound || adminData.context?.activeRound || null,
        nextRound: scoreboardData?.context?.nextRound || adminData.context?.nextRound || null,
        allRounds: scoreboardData?.context?.allRounds || adminData.context?.allRounds || [],
        cycle: scoreboardData?.context?.cycle || adminData.context?.cycle || null,
        isInterviewRound: isInterview,
        isResumeRound: !isInterview,
      },
      pipeline,
      graderSummary,
      graderLoadError: isCoffeeChat && !coffeeGraderData
        ? "Could not load Coffee Chat participant coverage"
        : !isCoffeeChat && !graderData
        ? "Could not load resume-grader coverage"
        : !isCoffeeChat && !frqGraderData
          ? "Could not load free-response grader coverage"
          : null,
    };
  }, [rawAdminData, coffeeGraderData, error, frqGraderData, graderData, interviewData, isCoffeeChat, isInterview, scoreboardData]);

  const reload = useCallback(() => {
    scoreboardQuery.refetch();
    adminQuery.refetch();
    if (isCoffeeChat) coffeeGraderQuery.refetch();
    else {
      graderQuery.refetch();
      frqGraderQuery.refetch();
    }
    if (isInterview) interviewQuery.refetch();
  }, [adminQuery, coffeeGraderQuery, frqGraderQuery, graderQuery, interviewQuery, isCoffeeChat, isInterview, scoreboardQuery]);

  return { data, loading, error, reload };
}
