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

export async function downloadDecisionsExport(authedFetch, apiBase, decision = "all") {
  const res = await authedFetch(`${apiBase}/scoreboard/decisions/export?decision=${encodeURIComponent(decision)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Export failed");
  }
  const blob = await res.blob();
  const suffix = decision === "all" ? "all" : decision;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `scoreboard-decisions-${suffix}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
