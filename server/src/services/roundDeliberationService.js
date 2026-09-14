const { applyScreeningEligibility, screeningAccessError } = require('../utils/screeningEligibility');
const supabase = require("../config/supabase");
const { getRoundsForCycle, getActiveCycleId } = require("../utils/cycleContext");
const { firstRel } = require("../utils/supabaseHelpers");
const {
  normalizeRoundDecision,
  buildDecisionLookup,
  resolveCandidateDecision,
  deliberationHasStarted,
  summarizeIncompleteDeliberation,
} = require("../utils/roundDecisions");
const {
  buildCandidateLinkLookups,
  applyResumeCandidateLink,
} = require("../utils/candidateLink");
const {
  ROUND_TYPES,
  getRoundByType,
  getPriorRound,
  isResumeScreenType,
  sortRounds,
} = require("../utils/rounds");
const { hasReviewScoreValues } = require("../utils/rubric");

function mapScoreboardRoundContext(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    sortOrder: row.sort_order,
    autoAdvancePercent: Number(row.auto_advance_percent) || 0,
    autoRejectPercent: Number(row.auto_reject_percent) || 0,
  };
}

function resolveDeliberationRounds(rounds) {
  const sortedRounds = sortRounds(rounds);
  const resumeRound = getRoundByType(sortedRounds, ROUND_TYPES.RESUME_SCREEN);
  const coffeeChatRound = getRoundByType(sortedRounds, ROUND_TYPES.COFFEE_CHAT);
  const finalRound = getRoundByType(sortedRounds, ROUND_TYPES.FINAL_ROUND);
  const activeRound = sortedRounds.find((round) => round.status === "active") || null;
  const deliberationRound = activeRound || resumeRound;
  const nextRound = activeRound
    ? sortedRounds.find((round) => round.sort_order > activeRound.sort_order) || null
    : null;

  return {
    resumeRound,
    coffeeChatRound,
    finalRound,
    interviewRound: coffeeChatRound,
    deliberationRound,
    activeRound,
    nextRound,
    sortedRounds,
  };
}

function filterCandidatesForDeliberationRound(candidates, { deliberationRound, priorDecisionRows }) {
  if (!deliberationRound || isResumeScreenType(deliberationRound.type)) {
    return candidates;
  }

  const priorLookup = buildDecisionLookup(priorDecisionRows);
  const priorDeliberationStarted = deliberationHasStarted(priorDecisionRows);

  return (candidates || []).filter((candidate) => {
    if (candidate.screeningExclusionReason) return false;
    if (!candidate.numReviews) return false;
    if (!priorDeliberationStarted) return true;
    const priorStatus = normalizeRoundDecision(priorLookup[candidate.candidateId]?.decision);
    return priorStatus === "advance";
  });
}

async function loadPriorRoundDecisionRows(cycleId, deliberationRound, cycleRounds) {
  if (!deliberationRound || isResumeScreenType(deliberationRound.type)) {
    return [];
  }

  const priorRound = getPriorRound(cycleRounds, deliberationRound);
  if (!priorRound || priorRound.id === deliberationRound.id) {
    return [];
  }

  const { data: priorRows, error: priorDecisionError } = await supabase
    .from("round_decisions")
    .select("candidate_id, decision")
    .eq("cycle_id", cycleId)
    .eq("round_id", priorRound.id);

  if (priorDecisionError) throw priorDecisionError;
  return priorRows || [];
}

async function loadDeliberationPoolForRound(cycleId, deliberationRound, resumeRound, cycleRounds = null) {
  const rounds = cycleRounds || await getRoundsForCycle(cycleId);
  const applyStandingRule = cycleId === await getActiveCycleId();

  const { data: resumes, error: resumeError } = await supabase
    .from("resumes")
    .select(`
      id,
      name,
      candidate_id,
      candidates ( id, email, major, year, gpa )
    `)
    .eq("cycle_id", cycleId);

  if (resumeError) throw resumeError;

  const { data: cycleCandidates, error: cycleCandError } = await supabase
    .from("candidates")
    .select("id, name, email, major, year, gpa, resume_file_url")
    .eq("cycle_id", cycleId);

  if (cycleCandError) throw cycleCandError;

  const candidateLinkLookups = buildCandidateLinkLookups(cycleCandidates);

  const { data: roundDecisionRows, error: decisionError } = await supabase
    .from("round_decisions")
    .select("*")
    .eq("cycle_id", cycleId)
    .eq("round_id", deliberationRound.id);

  if (decisionError) throw decisionError;

  const decisionLookup = buildDecisionLookup(roundDecisionRows);
  const priorRoundDecisionRows = await loadPriorRoundDecisionRows(cycleId, deliberationRound, rounds);

  const { data: reviews, error: reviewError } = await supabase
    .from("resume_reviews")
    .select("resume_id, scores")
    .eq("cycle_id", cycleId)
    .eq("round_id", resumeRound.id);

  if (reviewError) throw reviewError;

  const reviewCountByResume = {};
  (reviews || []).filter(hasReviewScoreValues).forEach((review) => {
    reviewCountByResume[review.resume_id] = (reviewCountByResume[review.resume_id] || 0) + 1;
  });

  const poolRows = (resumes || []).map((resume) => {
    const embedded = firstRel(resume.candidates) || {};
    const linked = applyResumeCandidateLink(resume, embedded, candidateLinkLookups);
    return {
      id: resume.id,
      candidateId: linked.candidateId,
      name: resume.name || "Unknown",
      year: linked.year,
      numReviews: reviewCountByResume[resume.id] || 0,
      decision: resolveCandidateDecision(linked.candidateId, decisionLookup, { provisional: false }),
    };
  });

  return filterCandidatesForDeliberationRound(poolRows.map(candidate => applyScreeningEligibility(candidate, applyStandingRule)), {
    deliberationRound,
    priorDecisionRows: priorRoundDecisionRows,
  });
}

async function assertDeliberationCompleteForRound(cycleId, roundId) {
  const cycleRounds = await getRoundsForCycle(cycleId);
  const resumeRound = getRoundByType(cycleRounds, ROUND_TYPES.RESUME_SCREEN);
  const deliberationRound = cycleRounds.find((round) => round.id === roundId) || null;

  if (!resumeRound) {
    return { error: "No resume screening round for this cycle", status: 400 };
  }
  if (!deliberationRound) {
    return { error: "Round not found in this cycle", status: 404 };
  }

  const pool = await loadDeliberationPoolForRound(cycleId, deliberationRound, resumeRound, cycleRounds);
  const summary = summarizeIncompleteDeliberation(pool);
  if (summary.incompleteCount > 0) {
    const parts = [];
    if (summary.pendingCount) parts.push(`${summary.pendingCount} pending`);
    if (summary.holdCount) parts.push(`${summary.holdCount} on hold`);
    const detail = parts.length ? ` (${parts.join(", ")})` : "";
    return {
      error: `Cannot close round: ${summary.incompleteCount} candidate(s) still need Advance or Reject${detail}.`,
      status: 400,
      ...summary,
    };
  }

  return null;
}

async function assertCandidateEligibleForRoundDecision({
  activeRound,
  resumeRound,
  cycleId,
  candidateId,
  cycleRounds = null,
}) {
  if (!activeRound || activeRound.status !== "active") {
    return { error: "This round is closed — activate a round in Cycle Management to record decisions.", status: 400 };
  }

  const { data: candidate, error } = await supabase.from("candidates").select("year").eq("id", candidateId).eq("cycle_id", cycleId).maybeSingle();
  if (error) throw error;
  const exclusion = screeningAccessError(candidate);
  if (exclusion) return exclusion;

  if (isResumeScreenType(activeRound.type) || !resumeRound) {
    return null;
  }

  const rounds = cycleRounds || await getRoundsForCycle(cycleId);
  const priorRoundDecisionRows = await loadPriorRoundDecisionRows(cycleId, activeRound, rounds);
  if (!priorRoundDecisionRows.length) {
    return null;
  }

  if (!deliberationHasStarted(priorRoundDecisionRows)) {
    return null;
  }

  const priorLookup = buildDecisionLookup(priorRoundDecisionRows);
  const priorStatus = normalizeRoundDecision(priorLookup[candidateId]?.decision);
  if (priorStatus !== "advance") {
    const priorRound = getPriorRound(rounds, activeRound);
    const priorLabel = priorRound?.name || "the previous round";
    return {
      error: `Only candidates advanced from ${priorLabel} can receive decisions in this round.`,
      status: 400,
    };
  }

  return null;
}

module.exports = {
  mapScoreboardRoundContext,
  resolveDeliberationRounds,
  filterCandidatesForDeliberationRound,
  loadPriorRoundDecisionRows,
  loadDeliberationPoolForRound,
  assertDeliberationCompleteForRound,
  assertCandidateEligibleForRoundDecision,
};
