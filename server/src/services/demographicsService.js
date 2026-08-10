const supabase = require("../config/supabase");
const { getActiveCycleRow, getRoundsForCycle } = require("../utils/cycleContext");
const { normalizeRoundDecision } = require("../utils/roundDecisions");
const {
  isResumeScreenType,
  isInterviewRoundType,
  sortRounds,
} = require("../utils/rounds");

const DEMOGRAPHIC_FIELDS = [
  { id: "year", label: "Class year", type: "categorical" },
  { id: "urm", label: "URM", type: "grouped" },
  { id: "pronouns", label: "Pronouns", type: "pronouns" },
  { id: "major", label: "Major", type: "grouped" },
  { id: "gpa", label: "GPA", type: "gpa" },
];

const MAX_GROUPED_CATEGORIES = 8;

function normalizeText(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed || "Not specified";
}

function normalizePronouns(value) {
  const compact = String(value ?? "").trim().toLowerCase().replace(/[\s/]+/g, "");
  if (!compact) return "Not specified";
  if (compact.includes("they") || compact.includes("them")) return "They/Them";
  if (compact.includes("she")) return "She/Her";
  if (compact.includes("he")) return "He/Him";
  return "Other";
}

function bucketGpa(value) {
  const parsed = Number.parseFloat(String(value ?? "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(parsed)) return "Not specified";
  if (parsed < 3.0) return "Below 3.0";
  if (parsed < 3.5) return "3.0 – 3.49";
  if (parsed < 3.8) return "3.5 – 3.79";
  return "3.8+";
}

function normalizeCategoryValue(field, rawValue) {
  switch (field.type) {
    case "pronouns":
      return normalizePronouns(rawValue);
    case "gpa":
      return bucketGpa(rawValue);
    case "categorical":
    case "grouped":
    default:
      return normalizeText(rawValue);
  }
}

function getCandidateFieldValue(candidate, fieldId) {
  return candidate?.[fieldId] ?? "";
}

function buildGroupedCategoryOrder(appliedCounts) {
  const ranked = Object.entries(appliedCounts)
    .filter(([label]) => label !== "Not specified")
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const keep = new Set(ranked.slice(0, MAX_GROUPED_CATEGORIES).map(([label]) => label));
  keep.add("Not specified");

  const categories = ranked
    .filter(([label]) => keep.has(label))
    .map(([label]) => label);

  if (ranked.length > MAX_GROUPED_CATEGORIES) {
    categories.push("Other");
  } else if (!categories.includes("Not specified") && appliedCounts["Not specified"]) {
    categories.push("Not specified");
  }

  return categories.length ? categories : ["Not specified"];
}

function mapGroupedValue(value, groupedCategoryOrder) {
  const normalized = normalizeText(value);
  if (groupedCategoryOrder.includes(normalized)) return normalized;
  if (groupedCategoryOrder.includes("Other")) return "Other";
  return normalized;
}

function countByField(candidates, field, groupedCategoryOrder = null) {
  const counts = {};
  (candidates || []).forEach((candidate) => {
    let category = normalizeCategoryValue(field, getCandidateFieldValue(candidate, field.id));
    if (field.type === "grouped" && groupedCategoryOrder) {
      category = mapGroupedValue(getCandidateFieldValue(candidate, field.id), groupedCategoryOrder);
    }
    counts[category] = (counts[category] || 0) + 1;
  });
  return counts;
}

function getAdvancedCandidateIds(roundId, decisionsByRound, allIds) {
  return new Set(
    [...(decisionsByRound[roundId]?.entries() || [])]
      .filter(([, decision]) => decision === "advance")
      .map(([candidateId]) => candidateId)
      .filter((candidateId) => allIds.has(candidateId))
  );
}

function getPassedCandidateIds(roundId, interviewByRound, allIds) {
  return new Set(
    [...(interviewByRound[roundId]?.entries() || [])]
      .filter(([, decision]) => decision === "pass")
      .map(([candidateId]) => candidateId)
      .filter((candidateId) => allIds.has(candidateId))
  );
}

function buildStageCandidateSets({
  candidates,
  resumeCandidateIds,
  rounds,
  roundDecisions,
  interviewEvaluations,
}) {
  const allIds = new Set((candidates || []).map((candidate) => candidate.id));
  const resumePoolIds = new Set(
    (candidates || [])
      .filter((candidate) => resumeCandidateIds.has(candidate.id) || String(candidate.resume_file_url || "").trim())
      .map((candidate) => candidate.id)
  );

  const decisionsByRound = {};
  (roundDecisions || []).forEach((row) => {
    if (!row?.round_id || !row?.candidate_id) return;
    if (!decisionsByRound[row.round_id]) decisionsByRound[row.round_id] = new Map();
    decisionsByRound[row.round_id].set(row.candidate_id, normalizeRoundDecision(row.decision));
  });

  const interviewByRound = {};
  (interviewEvaluations || []).forEach((row) => {
    if (!row?.round_id || !row?.candidate_id) return;
    if (!interviewByRound[row.round_id]) interviewByRound[row.round_id] = new Map();
    interviewByRound[row.round_id].set(row.candidate_id, String(row.decision || "pending").trim().toLowerCase());
  });

  const stages = [
    {
      id: "applied",
      label: "Applicants",
      candidateIds: allIds,
    },
  ];

  let priorStageIds = null;

  sortRounds(rounds).forEach((round) => {
    if (isResumeScreenType(round.type)) {
      stages.push({
        id: "resume_pool",
        label: `${round.name} pool`,
        roundId: round.id,
        candidateIds: resumePoolIds,
      });

      priorStageIds = getAdvancedCandidateIds(round.id, decisionsByRound, allIds);
      return;
    }

    if (isInterviewRoundType(round.type)) {
      stages.push({
        id: `pool_${round.id}`,
        label: `Advanced to ${round.name}`,
        roundId: round.id,
        candidateIds: priorStageIds || new Set(),
      });

      priorStageIds = getPassedCandidateIds(round.id, interviewByRound, allIds);
    }
  });

  return stages.map((stage) => ({
    ...stage,
    total: stage.candidateIds.size,
    candidates: (candidates || []).filter((candidate) => stage.candidateIds.has(candidate.id)),
  }));
}

function buildDimensionBreakdown(stages, field) {
  const appliedStage = stages.find((stage) => stage.id === "applied") || stages[0];
  const appliedCounts = countByField(appliedStage?.candidates || [], field);
  const groupedCategoryOrder = field.type === "grouped" ? buildGroupedCategoryOrder(appliedCounts) : null;

  let categories;
  if (field.type === "gpa") {
    categories = ["Below 3.0", "3.0 – 3.49", "3.5 – 3.79", "3.8+", "Not specified"];
  } else if (field.type === "pronouns") {
    categories = ["He/Him", "She/Her", "They/Them", "Other", "Not specified"];
  } else if (field.type === "grouped") {
    categories = groupedCategoryOrder;
  } else {
    categories = Object.keys(appliedCounts).sort((a, b) => {
      if (a === "Not specified") return 1;
      if (b === "Not specified") return -1;
      return appliedCounts[b] - appliedCounts[a] || a.localeCompare(b);
    });
    if (!categories.length) categories = ["Not specified"];
  }

  const stageCounts = {};
  stages.forEach((stage) => {
    stageCounts[stage.id] = countByField(stage.candidates, field, groupedCategoryOrder);
  });

  return {
    id: field.id,
    label: field.label,
    categories,
    stages: stageCounts,
  };
}

function mapRound(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    sortOrder: row.sort_order,
  };
}

async function getDemographicsSnapshot() {
  const cycle = await getActiveCycleRow();
  if (!cycle) {
    return { error: "No active recruiting cycle", status: 503 };
  }

  const rounds = await getRoundsForCycle(cycle.id);

  const [
    { data: candidates, error: candidatesError },
    { data: resumes, error: resumesError },
    { data: roundDecisions, error: decisionsError },
    { data: interviewEvaluations, error: interviewError },
  ] = await Promise.all([
    supabase
      .from("candidates")
      .select("id, major, gpa, year, pronouns, urm, resume_file_url")
      .eq("cycle_id", cycle.id),
    supabase
      .from("resumes")
      .select("candidate_id")
      .eq("cycle_id", cycle.id),
    supabase
      .from("round_decisions")
      .select("candidate_id, round_id, decision")
      .eq("cycle_id", cycle.id),
    supabase
      .from("interview_evaluations")
      .select("candidate_id, round_id, decision")
      .eq("cycle_id", cycle.id),
  ]);

  if (candidatesError) throw candidatesError;
  if (resumesError) throw resumesError;
  if (decisionsError) throw decisionsError;
  if (interviewError) throw interviewError;

  const resumeCandidateIds = new Set(
    (resumes || []).map((row) => row.candidate_id).filter(Boolean)
  );

  const stages = buildStageCandidateSets({
    candidates: candidates || [],
    resumeCandidateIds,
    rounds,
    roundDecisions: roundDecisions || [],
    interviewEvaluations: interviewEvaluations || [],
  });

  const dimensions = DEMOGRAPHIC_FIELDS.map((field) => buildDimensionBreakdown(stages, field));

  return {
    context: {
      cycle: { id: cycle.id, name: cycle.name },
      rounds: rounds.map(mapRound),
    },
    stages: stages.map(({ id, label, total, roundId }) => ({ id, label, total, roundId: roundId || null })),
    dimensions,
  };
}

module.exports = {
  getDemographicsSnapshot,
};
