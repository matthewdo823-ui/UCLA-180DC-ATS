const supabase = require("../config/supabase");
const { getRoundsForCycle } = require("../utils/cycleContext");
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

function mapScoreboardRoundContext(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    sortOrder: row.sort_order,
  };
}

function resolveDeliberationRounds(rounds) {
  const resumeRound = (rounds || []).find((r) => r.type === "resume_screen") || null;
  const interviewRound = (rounds || []).find((r) => r.type === "interview") || null;
  const activeRound = (rounds || []).find((r) => r.status === "active") || null;
  const deliberationRound = activeRound || resumeRound;
  const nextRound = activeRound
    ? (rounds || [])
      .filter((r) => r.sort_order > activeRound.sort_order)
      .sort((a, b) => a.sort_order - b.sort_order)[0] || null
    : null;
  return { resumeRound, interviewRound, deliberationRound, activeRound, nextRound };
}

function filterCandidatesForDeliberationRound(candidates, { deliberationRound, resumeDecisionRows }) {
  if (!deliberationRound || deliberationRound.type !== "interview") {
    return candidates;
  }

  const resumeLookup = buildDecisionLookup(resumeDecisionRows);
  const resumeDeliberationStarted = deliberationHasStarted(resumeDecisionRows);

  return (candidates || []).filter((candidate) => {
    if (!candidate.numReviews) return false;
    if (!resumeDeliberationStarted) return true;
    const priorStatus = normalizeRoundDecision(resumeLookup[candidate.candidateId]?.decision);
    return priorStatus === "advance";
  });
}

async function loadDeliberationPoolForRound(cycleId, deliberationRound, resumeRound) {
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

  let resumeRoundDecisionRows = [];
  if (deliberationRound.type === "interview" && resumeRound?.id !== deliberationRound.id) {
    const { data: priorRows, error: priorDecisionError } = await supabase
      .from("round_decisions")
      .select("candidate_id, decision")
      .eq("cycle_id", cycleId)
      .eq("round_id", resumeRound.id);

    if (priorDecisionError) throw priorDecisionError;
    resumeRoundDecisionRows = priorRows || [];
  }

  const { data: reviews, error: reviewError } = await supabase
    .from("resume_reviews")
    .select("resume_id")
    .eq("cycle_id", cycleId)
    .eq("round_id", resumeRound.id);

  if (reviewError) throw reviewError;

  const reviewCountByResume = {};
  (reviews || []).forEach((review) => {
    reviewCountByResume[review.resume_id] = (reviewCountByResume[review.resume_id] || 0) + 1;
  });

  const poolRows = (resumes || []).map((resume) => {
    const embedded = firstRel(resume.candidates) || {};
    const linked = applyResumeCandidateLink(resume, embedded, candidateLinkLookups);
    return {
      id: resume.id,
      candidateId: linked.candidateId,
      name: resume.name || "Unknown",
      numReviews: reviewCountByResume[resume.id] || 0,
      decision: resolveCandidateDecision(linked.candidateId, decisionLookup, { provisional: false }),
    };
  });

  return filterCandidatesForDeliberationRound(poolRows, {
    deliberationRound,
    resumeDecisionRows: resumeRoundDecisionRows,
  });
}

async function assertDeliberationCompleteForRound(cycleId, roundId) {
  const cycleRounds = await getRoundsForCycle(cycleId);
  const resumeRound = cycleRounds.find((r) => r.type === "resume_screen") || null;
  const deliberationRound = cycleRounds.find((r) => r.id === roundId) || null;

  if (!resumeRound) {
    return { error: "No resume screening round for this cycle", status: 400 };
  }
  if (!deliberationRound) {
    return { error: "Round not found in this cycle", status: 404 };
  }

  const pool = await loadDeliberationPoolForRound(cycleId, deliberationRound, resumeRound);
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
}) {
  if (!activeRound || activeRound.status !== "active") {
    return { error: "This round is closed — activate a round in Cycle Management to record decisions.", status: 400 };
  }

  if (activeRound.type !== "interview" || !resumeRound) {
    return null;
  }

  const { data: resumeDecisionRows, error } = await supabase
    .from("round_decisions")
    .select("candidate_id, decision")
    .eq("cycle_id", cycleId)
    .eq("round_id", resumeRound.id);

  if (error) throw error;

  if (!deliberationHasStarted(resumeDecisionRows)) {
    return null;
  }

  const resumeLookup = buildDecisionLookup(resumeDecisionRows);
  const priorStatus = normalizeRoundDecision(resumeLookup[candidateId]?.decision);
  if (priorStatus !== "advance") {
    return { error: "Only candidates advanced from resume screening can receive decisions in this round.", status: 400 };
  }

  return null;
}

module.exports = {
  mapScoreboardRoundContext,
  resolveDeliberationRounds,
  filterCandidatesForDeliberationRound,
  loadDeliberationPoolForRound,
  assertDeliberationCompleteForRound,
  assertCandidateEligibleForRoundDecision,
};
