// Central registry of query keys.
//
// Keys live here rather than inline at each call site so that invalidation stays
// honest: when grading submits a review, the scoreboard and dashboard counts are
// immediately wrong, and the only way to reliably expire them is for the reader
// and the invalidator to agree on the exact key. Hard-coded arrays scattered
// across 15 files drift; this doesn't.
//
// Keys are hierarchical — invalidating ["scoreboard"] expires every round's
// scoreboard, while ["scoreboard", roundId] expires just the one.

export const qk = {
  activeCycle: () => ["cycles", "active"],

  scoreboard: (roundId = null, cycleId = null) => ["scoreboard", cycleId ?? "active-cycle", roundId ?? "active-round"],
  scoreboardRoot: () => ["scoreboard"],
  candidateApplication: (resumeId, cycleId = null) => ["candidate-application", String(resumeId || ""), cycleId ?? "active-cycle"],
  candidateApplicationsRoot: () => ["candidate-application"],
  candidateApplicationSummary: (resumeId, cycleId = null) => ["candidate-application-summary", String(resumeId || ""), cycleId ?? "active-cycle"],

  adminDashboard: () => ["dashboard", "admin"],
  graderDashboard: () => ["dashboard", "grader"],
  dashboardRoot: () => ["dashboard"],

  graderScoreboard: () => ["grader-scoreboard"],
  frqGraderScoreboard: () => ["frq-grader-scoreboard"],
  coffeeChatGraderScoreboard: () => ["coffee-chat-grader-scoreboard"],
  interviewCandidates: () => ["interviews", "candidates"],
  demographics: () => ["demographics"],
  users: () => ["users"],

  assignments: () => ["assignments"],
  // ["cycles"] is the parent of ["cycles", "active"] (see activeCycle above), so
  // invalidating this after a cycle/round mutation also expires the active-cycle
  // entry every page reads — exactly what should happen when the active cycle or
  // round changes.
  cycles: () => ["cycles"],
  interestEvents: (cycleId) => ["interest-events", cycleId],
  interestAttendance: (cycleId) => ["interest-attendance", cycleId],
  // Flags and referrals share a page but hit different endpoints; keying by the
  // endpoint gives each mode its own cache entry that survives toggling between them.
  candidateSignals: (endpoint) => [endpoint],
};

/**
 * Everything that goes stale the moment a grader submits or edits a review.
 * Call after any review mutation: `invalidateAfterReview(queryClient)`.
 */
export function invalidateAfterReview(queryClient) {
  queryClient.invalidateQueries({ queryKey: qk.scoreboardRoot() });
  queryClient.invalidateQueries({ queryKey: qk.candidateApplicationsRoot() });
  queryClient.invalidateQueries({ queryKey: qk.dashboardRoot() });
  queryClient.invalidateQueries({ queryKey: qk.graderScoreboard() });
  queryClient.invalidateQueries({ queryKey: qk.frqGraderScoreboard() });
}
