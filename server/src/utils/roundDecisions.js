const VALID_ROUND_DECISIONS = new Set(["pending", "advance", "hold", "reject"]);

function normalizeRoundDecision(value) {
  const normalized = String(value || "pending").trim().toLowerCase();
  return VALID_ROUND_DECISIONS.has(normalized) ? normalized : "pending";
}

function mapRoundDecision(row, { provisional = true } = {}) {
  if (!row) {
    return {
      status: "pending",
      notes: "",
      decidedBy: null,
      updatedAt: null,
      provisional,
    };
  }

  return {
    status: normalizeRoundDecision(row.decision),
    notes: row.notes || "",
    decidedBy: row.decided_by ?? null,
    updatedAt: row.updated_at || row.submitted_at || null,
    provisional,
  };
}

function buildDecisionLookup(rows) {
  const lookup = {};
  (rows || []).forEach((row) => {
    if (row?.candidate_id) lookup[row.candidate_id] = row;
  });
  return lookup;
}

function resolveCandidateDecision(candidateId, lookup, options = {}) {
  return mapRoundDecision(candidateId ? lookup[candidateId] : null, options);
}

/** True once any committee decision is no longer pending for this round. */
function deliberationHasStarted(decisionRows) {
  return (decisionRows || []).some(
    (row) => normalizeRoundDecision(row.decision) !== "pending"
  );
}

function countDecisions(candidates) {
  const counts = { pending: 0, advance: 0, hold: 0, reject: 0 };
  (candidates || []).forEach((c) => {
    const status = normalizeRoundDecision(c?.decision?.status);
    if (counts[status] !== undefined) counts[status] += 1;
  });
  return counts;
}

/** Committee must mark every candidate Advance or Reject before closing a round. */
function isFinalCommitteeDecision(status) {
  const normalized = normalizeRoundDecision(status);
  return normalized === "advance" || normalized === "reject";
}

function findIncompleteDeliberationCandidates(candidates) {
  return (candidates || []).filter((c) => !isFinalCommitteeDecision(c?.decision?.status));
}

function summarizeIncompleteDeliberation(candidates) {
  const incomplete = findIncompleteDeliberationCandidates(candidates);
  let pending = 0;
  let hold = 0;
  incomplete.forEach((c) => {
    const status = normalizeRoundDecision(c?.decision?.status);
    if (status === "hold") hold += 1;
    else pending += 1;
  });
  return { incompleteCount: incomplete.length, pendingCount: pending, holdCount: hold };
}

function escapeCsvField(value) {
  const str = value == null ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildDecisionsCsv(rows, { decisionFilter = "all" } = {}) {
  const filtered = (rows || []).filter((row) => {
    if (decisionFilter === "all") return true;
    return normalizeRoundDecision(row.decision?.status) === decisionFilter;
  });

  const header = ["name", "email", "phone", "major", "year", "gpa", "score_raw_pts", "num_resume_grades", "num_free_response_grades", "decision", "notes"];
  const lines = [header.join(",")];

  filtered.forEach((row) => {
    lines.push([
      escapeCsvField(row.name),
      escapeCsvField(row.email),
      escapeCsvField(row.phoneNumber),
      escapeCsvField(row.major),
      escapeCsvField(row.year),
      escapeCsvField(row.gpa),
      escapeCsvField(row.score ?? ""),
      escapeCsvField(row.numReviews ?? 0),
      escapeCsvField(row.numFrqReviews ?? 0),
      escapeCsvField(row.decision?.status || "pending"),
      escapeCsvField(row.decision?.notes || ""),
    ].join(","));
  });

  return `\uFEFF${lines.join("\n")}`;
}

module.exports = {
  VALID_ROUND_DECISIONS,
  normalizeRoundDecision,
  mapRoundDecision,
  buildDecisionLookup,
  resolveCandidateDecision,
  deliberationHasStarted,
  countDecisions,
  isFinalCommitteeDecision,
  findIncompleteDeliberationCandidates,
  summarizeIncompleteDeliberation,
  buildDecisionsCsv,
};
