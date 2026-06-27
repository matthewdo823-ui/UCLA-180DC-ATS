import { useCallback, useEffect, useState } from "react";
import { useAuthedFetch } from "../../auth/AuthContext";
import { API } from "../../constants/config";
import { isInterviewRoundType } from "../../constants/rounds";

function mapScoreboardToPipeline(scoreboardData, interviewData) {
  const activeRound = scoreboardData?.context?.activeRound;
  const isInterview = isInterviewRoundType(activeRound?.type);

  if (isInterview && interviewData?.stats) {
    const stats = interviewData.stats;
    const reviewed = (stats.pass || 0) + (stats.fail || 0) + (stats.hold || 0);
    return {
      mode: "interview",
      applicants: stats.total || 0,
      reviewed,
      awaitingReviews: stats.pending || 0,
      pass: stats.pass || 0,
      fail: stats.fail || 0,
      hold: stats.hold || 0,
      pending: stats.pending || 0,
      undecidedCount: (stats.pending || 0) + (stats.hold || 0),
    };
  }

  const stats = scoreboardData?.stats || {};
  const undecidedCount = scoreboardData?.context?.undecidedCount
    ?? ((stats.pending || 0) + (stats.hold || 0));

  return {
    mode: "resume",
    applicants: stats.applicants || 0,
    reviewed: stats.reviewed || 0,
    awaitingReviews: Math.max(0, (stats.applicants || 0) - (stats.reviewed || 0)),
    advanced: stats.advanced || 0,
    hold: stats.hold || 0,
    rejected: stats.rejected || 0,
    pending: stats.pending || 0,
    undecidedCount,
  };
}

function mapGraderScoreboard(graderData) {
  const stats = graderData?.stats || {};
  const graders = Array.isArray(graderData?.graders) ? graderData.graders : [];
  const expectedReviews = stats.expectedReviews || 30;

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
    avgReviews: stats.avgReviews ?? 0,
    expectedReviews,
    behindGraders,
    behindCount,
    completeCount: graders.filter((g) => (g.reviewCount || 0) >= expectedReviews).length,
  };
}

export default function useAdminDashboard(enabled = true) {
  const authedFetch = useAuthedFetch();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError("");

    try {
      const scoreboardRes = await authedFetch(`${API}/scoreboard`);
      if (!scoreboardRes.ok) {
        const body = await scoreboardRes.json().catch(() => ({}));
        throw new Error(body.error || "Could not load scoreboard data");
      }
      const scoreboardData = await scoreboardRes.json();

      const isInterview = isInterviewRoundType(scoreboardData?.context?.activeRound?.type);

      const [adminRes, graderRes, interviewRes] = await Promise.all([
        authedFetch(`${API}/dashboard/admin`),
        authedFetch(`${API}/grader-scoreboard`),
        isInterview ? authedFetch(`${API}/interviews/candidates`) : Promise.resolve(null),
      ]);

      let adminData = {};
      if (adminRes.ok) {
        adminData = await adminRes.json();
      }

      let graderData = null;
      if (graderRes.ok) {
        graderData = await graderRes.json();
      }

      let interviewData = null;
      if (interviewRes?.ok) {
        interviewData = await interviewRes.json();
      } else if (isInterview && interviewRes && !interviewRes.ok) {
        const body = await interviewRes.json().catch(() => ({}));
        console.warn("Interview stats unavailable:", body.error || interviewRes.status);
      }

      const pipeline = mapScoreboardToPipeline(scoreboardData, interviewData);
      const graderSummary = graderData ? mapGraderScoreboard(graderData) : null;

      const actionItems = (adminData.actionItems || []).map((item) => {
        if (item.id === "awaiting-reviews" && pipeline.awaitingReviews != null) {
          return { ...item, count: pipeline.awaitingReviews };
        }
        if (item.id === "undecided" && pipeline.undecidedCount != null) {
          return { ...item, count: pipeline.undecidedCount };
        }
        if (item.id === "advance-emails" && pipeline.advanced != null) {
          return { ...item, count: pipeline.advanced };
        }
        return item;
      });

      setData({
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
        graderLoadError: graderData ? null : "Could not load grader coverage",
      });
    } catch (err) {
      setData(null);
      setError(err?.message || "Could not load admin dashboard");
    } finally {
      setLoading(false);
    }
  }, [authedFetch, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
