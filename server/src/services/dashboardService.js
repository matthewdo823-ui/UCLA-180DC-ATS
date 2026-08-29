const supabase = require("../config/supabase");
const {
  getActiveCycleRow,
  getResumeScreenRoundForCycle,
  getRoundsForCycle,
} = require("../utils/cycleContext");
const {
  countDecisions,
  summarizeIncompleteDeliberation,
  deliberationHasStarted,
  normalizeRoundDecision,
} = require("../utils/roundDecisions");
const {
  mapScoreboardRoundContext,
  resolveDeliberationRounds,
  loadDeliberationPoolForRound,
} = require("./roundDeliberationService");
const { isInterviewRoundType, isResumeScreenType, getPriorRound } = require("../utils/rounds");

const configuredGraderReviewGoal = Number(process.env.GRADER_REVIEW_GOAL);
const GRADER_REVIEW_GOAL = Number.isFinite(configuredGraderReviewGoal) && configuredGraderReviewGoal > 0
  ? configuredGraderReviewGoal
  : 30;

function buildPhaseLabel(cycle, activeRound) {
  if (cycle && activeRound) return `${cycle.name} · ${activeRound.name}`;
  if (cycle) return `${cycle.name} · No active round`;
  return "No active cycle";
}

async function loadPersonalResumeProgress(userId, cycleId, resumeRoundId) {
  let reviewQuery = supabase
    .from("resume_reviews")
    .select("submitted_at")
    .eq("graded_by", userId)
    .order("submitted_at", { ascending: false });

  if (cycleId) reviewQuery = reviewQuery.eq("cycle_id", cycleId);
  if (resumeRoundId) reviewQuery = reviewQuery.eq("round_id", resumeRoundId);

  const { data: reviews, error } = await reviewQuery;
  if (error) throw error;

  const count = (reviews || []).length;
  const expectedReviews = GRADER_REVIEW_GOAL;
  const progressPct = expectedReviews > 0 ? Math.min(100, Math.round((count / expectedReviews) * 100)) : 0;

  return {
    mode: "resume",
    count,
    expectedReviews,
    progressPct,
    goalComplete: count >= expectedReviews,
    lastActivityAt: reviews?.[0]?.submitted_at || null,
    breakdown: null,
  };
}

async function loadPriorRoundGate(cycleId, activeRound) {
  const rounds = await getRoundsForCycle(cycleId);
  const priorRound = getPriorRound(rounds, activeRound);
  if (!priorRound) {
    return { gateStarted: false, eligibleCandidateIds: null };
  }

  if (isResumeScreenType(priorRound.type)) {
    const { data: roundDecisionRows, error } = await supabase
      .from("round_decisions")
      .select("candidate_id, decision")
      .eq("cycle_id", cycleId)
      .eq("round_id", priorRound.id);

    if (error) throw error;

    const gateStarted = deliberationHasStarted(roundDecisionRows);
    const eligibleCandidateIds = gateStarted
      ? new Set(
        (roundDecisionRows || [])
          .filter((row) => normalizeRoundDecision(row.decision) === "advance")
          .map((row) => row.candidate_id)
          .filter(Boolean)
      )
      : null;

    return { gateStarted, eligibleCandidateIds };
  }

  const { data: priorEvaluations, error } = await supabase
    .from("interview_evaluations")
    .select("candidate_id, decision")
    .eq("cycle_id", cycleId)
    .eq("round_id", priorRound.id);

  if (error) throw error;

  const gateStarted = (priorEvaluations || []).some(
    (row) => String(row.decision || "pending").trim().toLowerCase() !== "pending"
  );
  const eligibleCandidateIds = gateStarted
    ? new Set(
      (priorEvaluations || [])
        .filter((row) => String(row.decision || "").trim().toLowerCase() === "pass")
        .map((row) => row.candidate_id)
        .filter(Boolean)
    )
    : null;

  return { gateStarted, eligibleCandidateIds };
}

function candidatePassesPriorRoundGate(candidateId, { gateStarted, eligibleCandidateIds }) {
  if (!gateStarted || !eligibleCandidateIds) return true;
  return eligibleCandidateIds.has(candidateId);
}

async function countInterviewPool(cycleId, roundId) {
  const resumeRound = await getResumeScreenRoundForCycle(cycleId);
  if (!resumeRound) return 0;

  const cycleRounds = await getRoundsForCycle(cycleId);
  const activeRound = cycleRounds.find((round) => round.id === roundId) || null;
  if (!activeRound) return 0;

  const priorGate = await loadPriorRoundGate(cycleId, activeRound);

  const { data: candidates, error: candError } = await supabase
    .from("candidates")
    .select("id")
    .eq("cycle_id", cycleId);

  if (candError) throw candError;

  const candidateIds = (candidates || []).map((c) => c.id);
  if (!candidateIds.length) return 0;

  const { data: resumes, error: resumeError } = await supabase
    .from("resumes")
    .select("id, candidate_id")
    .eq("cycle_id", cycleId)
    .in("candidate_id", candidateIds);

  if (resumeError) throw resumeError;

  const resumeIds = (resumes || []).map((r) => r.id);
  if (!resumeIds.length) return 0;

  const { data: reviews, error: reviewError } = await supabase
    .from("resume_reviews")
    .select("resume_id")
    .eq("cycle_id", cycleId)
    .eq("round_id", resumeRound.id)
    .in("resume_id", resumeIds);

  if (reviewError) throw reviewError;

  const resumeByCandidate = {};
  (resumes || []).forEach((r) => {
    resumeByCandidate[r.candidate_id] = r;
  });

  const reviewsByResume = {};
  (reviews || []).forEach((review) => {
    if (!reviewsByResume[review.resume_id]) reviewsByResume[review.resume_id] = 0;
    reviewsByResume[review.resume_id] += 1;
  });

  return (candidates || []).filter((candidate) => {
    const resume = resumeByCandidate[candidate.id];
    if (!resume) return false;
    if (!(reviewsByResume[resume.id] || 0)) return false;
    return candidatePassesPriorRoundGate(candidate.id, priorGate);
  }).length;
}

async function loadPersonalInterviewProgress(userId, cycleId, roundId) {
  const [poolTotal, evaluationsResult] = await Promise.all([
    countInterviewPool(cycleId, roundId),
    supabase
      .from("interview_evaluations")
      .select("decision, updated_at, evaluated_by")
      .eq("round_id", roundId)
      .eq("evaluated_by", userId),
  ]);

  if (evaluationsResult.error) throw evaluationsResult.error;

  const mine = evaluationsResult.data || [];
  const myCompleted = mine.filter((row) => row.decision && row.decision !== "pending");

  const breakdown = { pass: 0, fail: 0, hold: 0, pending: 0, total: poolTotal };
  myCompleted.forEach((row) => {
    const key = row.decision || "pending";
    if (breakdown[key] !== undefined) breakdown[key] += 1;
  });
  breakdown.pending = Math.max(0, poolTotal - myCompleted.length);

  const lastActivityAt = mine
    .map((row) => row.updated_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0] || null;

  const count = myCompleted.length;
  const expectedReviews = poolTotal;
  const progressPct = expectedReviews > 0 ? Math.min(100, Math.round((count / expectedReviews) * 100)) : 0;

  return {
    mode: "interview",
    count,
    expectedReviews,
    progressPct,
    goalComplete: expectedReviews > 0 && count >= expectedReviews,
    lastActivityAt,
    breakdown,
  };
}

async function loadGraderSummary(cycleId, resumeRound) {
  const { data: users, error: userError } = await supabase
    .from("users")
    .select("user_id, email, first_name, last_name, role")
    .in("role", ["admin", "member"])
    .order("first_name", { ascending: true });

  if (userError) throw userError;

  let reviewQuery = supabase
    .from("resume_reviews")
    .select("graded_by")
    .not("graded_by", "is", null);

  if (cycleId && resumeRound) {
    reviewQuery = reviewQuery.eq("cycle_id", cycleId).eq("round_id", resumeRound.id);
  }

  const { data: reviews, error: reviewError } = await reviewQuery;
  if (reviewError) throw reviewError;

  const countByUser = {};
  (reviews || []).forEach((review) => {
    countByUser[review.graded_by] = (countByUser[review.graded_by] || 0) + 1;
  });

  const graders = (users || []).map((user) => {
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;
    const reviewCount = countByUser[user.user_id] || 0;
    return {
      id: user.user_id,
      name,
      email: user.email,
      role: user.role,
      reviewCount,
      expectedReviews: GRADER_REVIEW_GOAL,
      progressPct: Math.min(100, Math.round((reviewCount / GRADER_REVIEW_GOAL) * 100)),
    };
  });

  graders.sort((a, b) => a.reviewCount - b.reviewCount);

  const totalReviews = graders.reduce((sum, g) => sum + g.reviewCount, 0);
  const activeGraders = graders.filter((g) => g.reviewCount > 0).length;
  const notStarted = graders.filter((g) => g.reviewCount === 0).length;
  const behindGraders = graders
    .filter((g) => g.reviewCount > 0 && g.reviewCount < GRADER_REVIEW_GOAL)
    .slice(0, 5);
  const behindCount = graders.filter((g) => g.reviewCount > 0 && g.reviewCount < GRADER_REVIEW_GOAL).length;

  return {
    graders: graders.length,
    activeGraders,
    notStarted,
    totalReviews,
    avgReviews: graders.length ? Number((totalReviews / graders.length).toFixed(1)) : 0,
    expectedReviews: GRADER_REVIEW_GOAL,
    behindGraders,
    behindCount,
    completeCount: graders.filter((g) => g.reviewCount >= GRADER_REVIEW_GOAL).length,
  };
}

async function loadResumePipelineStats(cycleId, deliberationRound, resumeRound, cycleRounds) {
  const pool = await loadDeliberationPoolForRound(cycleId, deliberationRound, resumeRound, cycleRounds);
  const decisionCounts = countDecisions(pool);
  const incompleteSummary = summarizeIncompleteDeliberation(pool);
  const undecidedCount = decisionCounts.pending + decisionCounts.hold;
  const reviewed = pool.filter((c) => c.numReviews > 0).length;
  const awaitingReviews = pool.filter((c) => c.numReviews === 0).length;

  return {
    mode: "resume",
    applicants: pool.length,
    reviewed,
    awaitingReviews,
    advanced: decisionCounts.advance,
    hold: decisionCounts.hold,
    rejected: decisionCounts.reject,
    pending: decisionCounts.pending,
    undecidedCount,
    incompleteCount: incompleteSummary.incompleteCount,
  };
}

async function loadInterviewPipelineStats(cycleId, roundId) {
  const poolTotal = await countInterviewPool(cycleId, roundId);

  const { data: evaluations, error } = await supabase
    .from("interview_evaluations")
    .select("decision")
    .eq("round_id", roundId);

  if (error) throw error;

  const stats = { total: poolTotal, pending: 0, pass: 0, fail: 0, hold: 0 };
  (evaluations || []).forEach((row) => {
    const d = row.decision || "pending";
    if (stats[d] !== undefined) stats[d] += 1;
    else stats.pending += 1;
  });

  const evaluated = stats.pass + stats.fail + stats.hold;
  stats.pending = Math.max(0, poolTotal - evaluated);

  return {
    mode: "interview",
    applicants: poolTotal,
    reviewed: evaluated,
    awaitingReviews: stats.pending,
    pass: stats.pass,
    fail: stats.fail,
    hold: stats.hold,
    pending: stats.pending,
    undecidedCount: stats.pending + stats.hold,
    incompleteCount: stats.pending,
  };
}

async function loadActionItems({
  activeCycle,
  activeRound,
  resumeRound,
  deliberationRound,
  cycleRounds,
  pipeline,
  graderSummary,
  openFlags,
  oldestFlagAt,
  adminOverridesCount,
  canSendAdvanceEmails,
}) {
  const items = [];

  if (!activeCycle) {
    items.push({
      id: "no-cycle",
      label: "No active recruiting cycle",
      detail: "Create or activate a cycle to begin.",
      count: null,
      severity: "critical",
      path: "/cycle-management",
    });
    return items;
  }

  if (!activeRound) {
    items.push({
      id: "no-active-round",
      label: "No active round",
      detail: "Activate a round in Cycle Management.",
      count: null,
      severity: "critical",
      path: "/cycle-management",
    });
  }

  if (openFlags > 0) {
    items.push({
      id: "open-flags",
      label: "Open candidate flags",
      detail: oldestFlagAt ? `Oldest flag: ${new Date(oldestFlagAt).toLocaleDateString()}` : null,
      count: openFlags,
      severity: "warning",
      path: "/flagged-candidates",
    });
  }

  if (pipeline?.undecidedCount > 0 && deliberationRound?.status === "active") {
    items.push({
      id: "undecided",
      label: "Candidates awaiting deliberation",
      detail: "Advance or reject pending and hold decisions.",
      count: pipeline.undecidedCount,
      severity: "warning",
      path: "/scoreboard",
    });
  }

  if (pipeline?.incompleteCount > 0 && deliberationRound?.status === "active") {
    items.push({
      id: "incomplete-deliberation",
      label: "Incomplete deliberation",
      detail: "Some candidates need final Advance or Reject decisions.",
      count: pipeline.incompleteCount,
      severity: "warning",
      path: "/scoreboard",
    });
  }

  if (graderSummary?.notStarted > 0 && resumeRound && isResumeScreenType(activeRound?.type)) {
    items.push({
      id: "graders-not-started",
      label: "Graders haven't started",
      detail: "Team members with zero resume reviews submitted.",
      count: graderSummary.notStarted,
      severity: "info",
      path: "/grader-scoreboard",
    });
  }

  if (graderSummary?.behindCount > 0 && resumeRound && isResumeScreenType(activeRound?.type)) {
    const behindCount = graderSummary.behindCount;
    items.push({
      id: "graders-behind",
      label: "Graders behind on resume reviews",
      detail: `${behindCount} grader${behindCount === 1 ? "" : "s"} below the ${GRADER_REVIEW_GOAL}-resume-review goal.`,
      count: behindCount,
      severity: "info",
      path: "/grader-scoreboard",
    });
  }

  if (pipeline?.awaitingReviews > 0 && resumeRound && isResumeScreenType(activeRound?.type)) {
    items.push({
      id: "awaiting-reviews",
      label: "Resumes awaiting first grade",
      detail: "Candidates with no resume reviews yet.",
      count: pipeline.awaitingReviews,
      severity: "info",
      path: "/scoreboard",
    });
  }

  if (canSendAdvanceEmails) {
    items.push({
      id: "advance-emails",
      label: "Advance emails ready to send",
      detail: "Round is closed — notify advanced candidates.",
      count: pipeline?.advanced || null,
      severity: "info",
      path: "/scoreboard",
    });
  }

  if (adminOverridesCount > 0) {
    items.push({
      id: "admin-overrides",
      label: "Admin score overrides active",
      detail: "Candidates with manual score adjustments.",
      count: adminOverridesCount,
      severity: "info",
      path: "/scoreboard",
    });
  }

  if (!activeCycle.google_form_id || !activeCycle.form_field_map) {
    items.push({
      id: "form-not-configured",
      label: "Application form not configured",
      detail: "Connect Google Forms sync in Cycle Management.",
      count: null,
      severity: "info",
      path: "/cycle-management",
    });
  }

  return items;
}

async function loadAdminOverridesCount(cycleId, resumeRoundId) {
  if (!cycleId || !resumeRoundId) return 0;
  try {
    const { count, error } = await supabase
      .from("candidate_admin_overrides")
      .select("id", { count: "exact", head: true })
      .eq("cycle_id", cycleId)
      .eq("round_id", resumeRoundId)
      .not("override_score", "is", null);
    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

async function loadDemographicsSnapshot(cycleId) {
  const { data: candidates, error } = await supabase
    .from("candidates")
    .select("year, major, urm")
    .eq("cycle_id", cycleId);

  if (error) throw error;

  const rows = candidates || [];
  const yearCounts = {};
  const urmCounts = { yes: 0, no: 0, other: 0 };

  rows.forEach((row) => {
    const year = String(row.year || "Not specified").trim() || "Not specified";
    yearCounts[year] = (yearCounts[year] || 0) + 1;

    const urm = String(row.urm || "").trim().toLowerCase();
    if (urm === "yes" || urm === "y") urmCounts.yes += 1;
    else if (urm === "no" || urm === "n") urmCounts.no += 1;
    else if (urm) urmCounts.other += 1;
  });

  return {
    totalApplicants: rows.length,
    yearBreakdown: Object.entries(yearCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count })),
    urmPercent: rows.length
      ? Math.round((urmCounts.yes / rows.length) * 100)
      : null,
  };
}

async function getGraderDashboard(userId) {
  const activeCycle = await getActiveCycleRow();
  const activeCycleId = activeCycle?.id || null;
  const cycleRounds = activeCycleId ? await getRoundsForCycle(activeCycleId) : [];
  const { resumeRound, activeRound } = resolveDeliberationRounds(cycleRounds);
  const isInterviewRound = isInterviewRoundType(activeRound?.type);

  let personal;
  if (isInterviewRound && activeRound) {
    personal = await loadPersonalInterviewProgress(userId, activeCycleId, activeRound.id);
  } else {
    personal = await loadPersonalResumeProgress(
      userId,
      activeCycleId,
      resumeRound?.id || null
    );
  }

  return {
    context: {
      cycle: activeCycle ? { id: activeCycle.id, name: activeCycle.name } : null,
      activeRound: mapScoreboardRoundContext(activeRound),
      isInterviewRound,
      isResumeRound: isResumeScreenType(activeRound?.type),
      phaseLabel: buildPhaseLabel(activeCycle, activeRound),
    },
    personal,
  };
}

async function getAdminDashboard(_userId) {
  const activeCycle = await getActiveCycleRow();
  const activeCycleId = activeCycle?.id || null;
  const cycleRounds = activeCycleId ? await getRoundsForCycle(activeCycleId) : [];
  const {
    resumeRound,
    deliberationRound,
    activeRound,
    nextRound,
    sortedRounds,
  } = resolveDeliberationRounds(cycleRounds);

  const isInterviewRound = isInterviewRoundType(activeRound?.type);

  const [
    graderSummary,
    flagsResult,
    adminOverridesCount,
    demographics,
  ] = await Promise.all([
    activeCycleId && resumeRound
      ? loadGraderSummary(activeCycleId, resumeRound)
      : Promise.resolve(null),
    activeCycleId
      ? supabase
        .from("candidate_flags")
        .select("id, created_at, candidates!inner(cycle_id)")
        .eq("status", "open")
        .eq("candidates.cycle_id", activeCycleId)
        .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    loadAdminOverridesCount(activeCycleId, resumeRound?.id),
    activeCycleId ? loadDemographicsSnapshot(activeCycleId) : Promise.resolve(null),
  ]);

  if (flagsResult.error) throw flagsResult.error;

  const openFlags = (flagsResult.data || []).length;
  const oldestFlagAt = flagsResult.data?.[0]?.created_at || null;

  let pipeline = {
    mode: "none",
    applicants: 0,
    reviewed: 0,
    awaitingReviews: 0,
    undecidedCount: 0,
    incompleteCount: 0,
  };

  if (isInterviewRound && activeRound) {
    pipeline = await loadInterviewPipelineStats(activeCycleId, activeRound.id);
  } else if (activeCycleId && resumeRound && deliberationRound) {
    pipeline = await loadResumePipelineStats(
      activeCycleId,
      deliberationRound,
      resumeRound,
      cycleRounds
    );
  }

  const canSendAdvanceEmails = Boolean(
    deliberationRound
    && deliberationRound.status === "closed"
    && (pipeline.advanced || 0) > 0
  );

  const actionItems = await loadActionItems({
    activeCycle,
    activeRound,
    resumeRound,
    deliberationRound,
    cycleRounds,
    pipeline,
    graderSummary,
    openFlags,
    oldestFlagAt,
    adminOverridesCount,
    canSendAdvanceEmails,
  });

  return {
    context: {
      cycle: activeCycle ? {
        id: activeCycle.id,
        name: activeCycle.name,
        hasFormConfig: Boolean(activeCycle.google_form_id && activeCycle.form_field_map),
      } : null,
      activeRound: mapScoreboardRoundContext(activeRound),
      deliberationRound: mapScoreboardRoundContext(deliberationRound),
      resumeRound: mapScoreboardRoundContext(resumeRound),
      nextRound: mapScoreboardRoundContext(nextRound),
      allRounds: (sortedRounds || cycleRounds).map(mapScoreboardRoundContext),
      isInterviewRound,
      isResumeRound: isResumeScreenType(activeRound?.type),
      phaseLabel: buildPhaseLabel(activeCycle, activeRound),
    },
    pipeline,
    graderSummary,
    actionItems,
    demographics,
    flags: { open: openFlags, oldestAt: oldestFlagAt },
    adminOverridesCount,
    canSendAdvanceEmails,
  };
}

module.exports = {
  GRADER_REVIEW_GOAL,
  getGraderDashboard,
  getAdminDashboard,
};
