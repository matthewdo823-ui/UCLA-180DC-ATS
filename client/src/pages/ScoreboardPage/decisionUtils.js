export const ROUND_DECISIONS = ["pending", "advance", "hold", "reject"];

export const DECISION_STYLE = {
  pending: {
    bg: "rgba(107,114,128,0.10)",
    color: "#6B7280",
    bd: "rgba(107,114,128,0.24)",
    row: "transparent",
    label: "Pending",
  },
  advance: {
    bg: "rgba(29,158,117,0.14)",
    color: "#1D9E75",
    bd: "rgba(29,158,117,0.32)",
    row: "rgba(29,158,117,0.07)",
    label: "Advance",
  },
  hold: {
    bg: "rgba(239,159,39,0.14)",
    color: "#C47D12",
    bd: "rgba(239,159,39,0.32)",
    row: "rgba(239,159,39,0.08)",
    label: "Hold",
  },
  reject: {
    bg: "rgba(226,75,74,0.12)",
    color: "#E24B4A",
    bd: "rgba(226,75,74,0.30)",
    row: "rgba(226,75,74,0.06)",
    label: "Reject",
  },
};

export function normalizeDecisionStatus(value) {
  const normalized = String(value || "pending").trim().toLowerCase();
  return ROUND_DECISIONS.includes(normalized) ? normalized : "pending";
}

export function getCandidateDecisionStatus(candidate) {
  return normalizeDecisionStatus(candidate?.decision?.status);
}

export function buildDecisionPayload(status, notes = "") {
  return {
    status: normalizeDecisionStatus(status),
    notes: notes || "",
    updatedAt: new Date().toISOString(),
    provisional: true,
  };
}

export function recomputeDecisionStats(candidates) {
  const stats = { pending: 0, advance: 0, hold: 0, reject: 0 };
  (candidates || []).forEach((c) => {
    const status = getCandidateDecisionStatus(c);
    if (stats[status] !== undefined) stats[status] += 1;
  });
  return stats;
}

export function patchScoreboardWithDecision(scoreboardData, candidateId, decisionPayload) {
  const nextCandidates = (scoreboardData.candidates || []).map((c) =>
    c.id === candidateId ? { ...c, decision: decisionPayload } : c
  );
  const counts = recomputeDecisionStats(nextCandidates);
  return {
    ...scoreboardData,
    candidates: nextCandidates,
    stats: {
      ...scoreboardData.stats,
      advanced: counts.advance,
      hold: counts.hold,
      rejected: counts.reject,
      pending: counts.pending,
    },
  };
}

/** Whether admin can record a committee decision for this row. */
export function canRecordCommitteeDecision(candidate) {
  if (!candidate?.id) return false;
  if (candidate.linkAmbiguous) return false;
  if (candidate.canDecide === true) return true;
  if (candidate.candidateId) return true;
  // Resume id is always present on scoreboard rows; server resolves candidate via resume_id.
  return true;
}

export function getCommitteeLinkWarning(candidate) {
  if (candidate?.linkAmbiguous) {
    return "Ambiguous name match — resolve duplicate in database";
  }
  if (candidate?.canDecide === false && !candidate?.candidateId) {
    return "Could not link to candidate record";
  }
  return null;
}

export function canCloseDeliberationRound(candidates) {
  return (candidates || []).every((c) => {
    const status = getCandidateDecisionStatus(c);
    return status === "advance" || status === "reject";
  });
}

export function passesDecisionFilter(candidate, decisionFilter) {
  const status = getCandidateDecisionStatus(candidate);
  switch (decisionFilter) {
    case "pending":
      return status === "pending";
    case "advance":
      return status === "advance";
    case "hold":
      return status === "hold";
    case "reject":
      return status === "reject";
    case "undecided":
      return status === "pending" || status === "hold";
    default:
      return true;
  }
}

function escapeCsvField(value) {
  const str = value == null ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const EXPORT_HEADERS = ["name", "email", "phone", "major", "year", "gpa", "score_normalized_percent", "num_resume_grades", "num_free_response_grades", "decision", "notes"];

function triggerCsvDownload(csvText, filename) {
  const blob = new Blob(["\uFEFF", csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function candidateToCsvRow(candidate) {
  return [
    escapeCsvField(candidate.name),
    escapeCsvField(candidate.email),
    escapeCsvField(candidate.phoneNumber),
    escapeCsvField(candidate.major),
    escapeCsvField(candidate.year),
    escapeCsvField(candidate.gpa),
    escapeCsvField(candidate.normalizedScore ?? candidate.score ?? ""),
    escapeCsvField(candidate.numReviews ?? candidate.reviews?.length ?? 0),
    escapeCsvField(candidate.numFrqReviews ?? candidate.frqReviews?.length ?? 0),
    escapeCsvField(getCandidateDecisionStatus(candidate)),
    escapeCsvField(candidate.decision?.notes || ""),
  ].join(",");
}

/** Export deliberation decisions from the live scoreboard roster (matches UI). */
export function exportCandidatesDecisionCsv(candidates, decisionType) {
  if (decisionType !== "advance" && decisionType !== "reject") {
    throw new Error("Unsupported export type");
  }

  const label = decisionType === "advance" ? "advanced" : "rejected";
  const rows = (candidates || []).filter((c) => getCandidateDecisionStatus(c) === decisionType);
  if (!rows.length) {
    throw new Error(`No ${label} candidates to export yet. Mark candidates in deliberation first.`);
  }

  const lines = [EXPORT_HEADERS.join(",")];
  rows.forEach((candidate) => {
    lines.push(candidateToCsvRow(candidate));
  });

  triggerCsvDownload(lines.join("\n"), `${label}-candidates.csv`);
}
