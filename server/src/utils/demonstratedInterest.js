/**
 * Demonstrated Interest: event attendance (logged via per-event Google Forms) becomes a
 * multiplier on the Resume + FRQ composite score. Like screeningEligibility, this is applied
 * at read time only — stored grades are never rewritten, so editing a cycle's multiplier
 * steps re-ranks candidates immediately without a backfill.
 */
const { normalizeEmail, normalizeUniversityId, normalizePersonName } = require("./candidateLink");

const DEFAULT_MULTIPLIER_STEPS = [1, 1.025, 1.05, 1.075, 1.1];
const MAX_MULTIPLIER_STEP_COUNT = 20;
const MAX_MULTIPLIER_VALUE = 10;

/** @returns {string|null} error message, or null when valid */
function validateMultiplierSteps(steps) {
  if (!Array.isArray(steps) || !steps.length) {
    return "Multiplier steps must be a non-empty list";
  }
  if (steps.length > MAX_MULTIPLIER_STEP_COUNT) {
    return `Multiplier steps can have at most ${MAX_MULTIPLIER_STEP_COUNT} entries`;
  }
  for (let i = 0; i < steps.length; i += 1) {
    const value = steps[i];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > MAX_MULTIPLIER_VALUE) {
      return `Multiplier for ${i} event${i === 1 ? "" : "s"} must be a number between 0 and ${MAX_MULTIPLIER_VALUE}`;
    }
  }
  return null;
}

function resolveMultiplierSteps(steps) {
  return validateMultiplierSteps(steps) ? DEFAULT_MULTIPLIER_STEPS : steps;
}

/**
 * Map a count of distinct attended events to a score multiplier.
 * @param {number} eventCount distinct events with a counted attendance row
 * @param {number[]} steps index n = multiplier for n events (cycles.interest_multiplier_steps)
 * @returns {number}
 */
function computeInterestMultiplier(eventCount, steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return 1
  } else if (eventCount <= -1 || Number.isNaN(eventCount) || eventCount === null || eventCount === undefined) {
    return 1
  } 
  const index = Math.min(eventCount, steps.length - 1)
  return steps.at(index)
}

function maxInterestMultiplier(steps) {
  return Math.max(...resolveMultiplierSteps(steps));
}

/** Treats the @g.ucla.edu Google Workspace alias as the same mailbox as @ucla.edu. */
function normalizeInterestEmail(email) {
  return normalizeEmail(email).replace(/@g\.ucla\.edu$/, "@ucla.edu");
}

/**
 * @param {Record<string, string>} answers plain-text answers keyed by question id
 * @param {Record<string, 'name'|'email'|'university_id'>} fieldMap
 */
function extractMappedFields(answers, fieldMap) {
  const fields = { name: null, email: null, universityId: null };
  Object.entries(fieldMap || {}).forEach(([questionId, target]) => {
    const value = String(answers?.[questionId] ?? "").trim() || null;
    if (target === "name") fields.name = value;
    if (target === "email") fields.email = value;
    if (target === "university_id") fields.universityId = value;
  });
  return fields;
}

/** Mapped question ids that no longer exist on the live form (deleted or re-created). */
function findMissingMappedQuestions(fieldMap, questions) {
  const liveIds = new Set((questions || []).map((q) => q.questionId));
  return Object.entries(fieldMap || {})
    .filter(([questionId]) => !liveIds.has(questionId))
    .map(([questionId, target]) => ({ questionId, target }));
}

function isLateSubmission(submittedAt, closesAt) {
  const submitted = new Date(submittedAt).getTime();
  const closes = new Date(closesAt).getTime();
  if (!Number.isFinite(submitted) || !Number.isFinite(closes)) return false;
  return submitted > closes;
}

function pushToIndex(map, key, candidate) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(candidate);
}

/** @param {Array<{id: string, name?: string, email?: string, university_id?: string}>} candidates */
function buildCandidateMatchIndex(candidates) {
  const byUid = new Map();
  const byEmail = new Map();
  const byName = new Map();
  (candidates || []).forEach((candidate) => {
    if (!candidate?.id) return;
    pushToIndex(byUid, normalizeUniversityId(candidate.university_id), candidate);
    pushToIndex(byEmail, normalizeInterestEmail(candidate.email), candidate);
    pushToIndex(byName, normalizePersonName(candidate.name), candidate);
  });
  return { byUid, byEmail, byName };
}

// A person who submitted the application twice has two candidate rows; that is ambiguous,
// so it goes to the review queue rather than crediting an arbitrary row.
function uniqueMatch(map, key) {
  const matches = key ? map.get(key) || [] : [];
  return matches.length === 1 ? matches[0] : null;
}

/**
 * @param {{ submittedAt: string, fields: ReturnType<typeof extractMappedFields> }} submission
 * @param {{ closes_at: string }} event
 * @param {ReturnType<typeof buildCandidateMatchIndex>} index
 * @returns {{ status: 'counted'|'unmatched'|'late', candidateId: string|null, matchMethod: 'uid'|'email'|null }}
 */
function classifyAttendance(submission, event, index) {
  const { fields, submittedAt } = submission;
  let candidate = uniqueMatch(index.byUid, normalizeUniversityId(fields.universityId));
  let matchMethod = candidate ? "uid" : null;
  if (!candidate) {
    candidate = uniqueMatch(index.byEmail, normalizeInterestEmail(fields.email));
    matchMethod = candidate ? "email" : null;
  }

  // Late rows keep their match so "Approve late" knows who to credit.
  if (isLateSubmission(submittedAt, event.closes_at)) {
    return { status: "late", candidateId: candidate?.id ?? null, matchMethod };
  }
  if (!candidate) return { status: "unmatched", candidateId: null, matchMethod: null };
  return { status: "counted", candidateId: candidate.id, matchMethod };
}

/** Review-queue hint only — never applied automatically. */
function suggestCandidateByName(name, index) {
  return uniqueMatch(index.byName, normalizePersonName(name));
}

/**
 * @param {Array<{ candidate_id: string, event_id: string, event_name?: string }>} countedRows
 * @returns {Map<string, Array<{ id: string, name: string }>>} candidate id -> distinct events
 */
function groupAttendedEventsByCandidate(countedRows) {
  const byCandidate = new Map();
  (countedRows || []).forEach((row) => {
    if (!row?.candidate_id || !row.event_id) return;
    if (!byCandidate.has(row.candidate_id)) byCandidate.set(row.candidate_id, new Map());
    byCandidate.get(row.candidate_id).set(row.event_id, { id: row.event_id, name: row.event_name || "Event" });
  });
  return new Map([...byCandidate].map(([candidateId, events]) => [candidateId, [...events.values()]]));
}

/**
 * Multiply the composite headline score. Runs after applyCompositeScoringToCandidates and before
 * applyScreeningEligibility, so ineligible candidates are still zeroed. Not capped at 100:
 * the base is already capped by the rubric, and DI is meant to lift strong candidates further.
 */
function applyDemonstratedInterest(candidate, attendedEvents = [], steps = DEFAULT_MULTIPLIER_STEPS) {
  const interestEvents = attendedEvents || [];
  const interestMultiplier = computeInterestMultiplier(interestEvents.length, resolveMultiplierSteps(steps));
  const base = candidate?.normalizedScore;
  const hasBase = base != null && Number.isFinite(Number(base));
  if (!hasBase) {
    return { ...candidate, baseNormalizedScore: null, interestMultiplier, interestEvents };
  }
  const normalizedScore = Number((Number(base) * interestMultiplier).toFixed(1));
  return {
    ...candidate,
    baseNormalizedScore: Number(base),
    normalizedScore,
    score: Math.round(normalizedScore),
    interestMultiplier,
    interestEvents,
  };
}

function applyDemonstratedInterestToCandidates(candidates, eventsByCandidate, steps) {
  return (candidates || []).map((candidate) =>
    applyDemonstratedInterest(candidate, eventsByCandidate?.get(candidate.candidateId) || [], steps)
  );
}

module.exports = {
  DEFAULT_MULTIPLIER_STEPS,
  validateMultiplierSteps,
  resolveMultiplierSteps,
  computeInterestMultiplier,
  maxInterestMultiplier,
  normalizeInterestEmail,
  extractMappedFields,
  findMissingMappedQuestions,
  isLateSubmission,
  buildCandidateMatchIndex,
  classifyAttendance,
  suggestCandidateByName,
  groupAttendedEventsByCandidate,
  applyDemonstratedInterest,
  applyDemonstratedInterestToCandidates,
};
