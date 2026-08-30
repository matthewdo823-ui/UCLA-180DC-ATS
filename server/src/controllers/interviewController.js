const supabase = require("../config/supabase");
const {
  getActiveCycleRow,
  getActiveInterviewRound,
  getResumeScreenRoundForCycle,
  getRoundsForCycle,
  requireActiveInterviewRound,
} = require("../utils/cycleContext");
const { hasReviewScoreValues, resolveReviewNormalizedValue } = require("../utils/rubric");
const { respondWithServerError } = require("../utils/httpErrors");
const {
  buildDecisionLookup,
  deliberationHasStarted,
  normalizeRoundDecision,
} = require("../utils/roundDecisions");
const {
  getPriorRound,
  isResumeScreenType,
} = require("../utils/rounds");

const VALID_DECISIONS = new Set(["pending", "pass", "fail", "hold"]);

function mapEvaluation(row) {
  if (!row) return null;
  return {
    id: row.id,
    candidateId: row.candidate_id,
    cycleId: row.cycle_id,
    roundId: row.round_id,
    decision: row.decision,
    scheduledAt: row.scheduled_at,
    notes: row.notes || "",
    evaluatedBy: row.evaluated_by,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  };
}

async function loadPriorRoundGate(cycleId, activeRound) {
  const rounds = await getRoundsForCycle(cycleId);
  const priorRound = getPriorRound(rounds, activeRound);
  if (!priorRound) {
    return { priorRound: null, gateStarted: false, eligibleCandidateIds: null };
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

    return { priorRound, gateStarted, eligibleCandidateIds };
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

  return { priorRound, gateStarted, eligibleCandidateIds };
}

function candidatePassesPriorRoundGate(candidateId, { gateStarted, eligibleCandidateIds }) {
  if (!gateStarted) return true;
  if (!eligibleCandidateIds) return true;
  return eligibleCandidateIds.has(candidateId);
}

exports.listInterviewCandidates = async (req, res) => {
  try {
    const ctx = await requireActiveInterviewRound();
    if (ctx.error) {
      return res.status(ctx.status).json({ error: ctx.error });
    }

    const resumeRound = await getResumeScreenRoundForCycle(ctx.cycle.id);
    if (!resumeRound) {
      return res.json({
        context: {
          cycle: { id: ctx.cycle.id, name: ctx.cycle.name },
          round: { id: ctx.round.id, name: ctx.round.name },
        },
        stats: { total: 0, pending: 0, pass: 0, fail: 0, hold: 0 },
        candidates: [],
      });
    }

    const priorGate = await loadPriorRoundGate(ctx.cycle.id, ctx.round);

    const { data: candidates, error: candError } = await supabase
      .from("candidates")
      .select("id, name, email, major, year, gpa, cycle_id")
      .eq("cycle_id", ctx.cycle.id)
      .order("name", { ascending: true });

    if (candError) return respondWithServerError(res, candError, "listInterviewCandidates candidates");

    const candidateIds = (candidates || []).map((c) => c.id);
    if (!candidateIds.length) {
      return res.json({
        context: {
          cycle: { id: ctx.cycle.id, name: ctx.cycle.name },
          round: { id: ctx.round.id, name: ctx.round.name },
        },
        stats: { total: 0, pending: 0, pass: 0, fail: 0, hold: 0 },
        candidates: [],
      });
    }

    const { data: resumes, error: resumeError } = await supabase
      .from("resumes")
      .select("id, candidate_id, name, file_url")
      .eq("cycle_id", ctx.cycle.id)
      .in("candidate_id", candidateIds);

    if (resumeError) return respondWithServerError(res, resumeError, "listInterviewCandidates resumes");

    const resumeIds = (resumes || []).map((r) => r.id);

    const { data: reviews, error: reviewError } = resumeIds.length
      ? await supabase
        .from("resume_reviews")
        .select("id, resume_id, scores, normalized_score, rubric_snapshot, decision, submitted_at")
        .eq("cycle_id", ctx.cycle.id)
        .eq("round_id", resumeRound.id)
        .in("resume_id", resumeIds)
      : { data: [], error: null };

    if (reviewError) return respondWithServerError(res, reviewError, "listInterviewCandidates reviews");

    const { data: evaluations, error: evalError } = await supabase
      .from("interview_evaluations")
      .select("*")
      .eq("round_id", ctx.round.id);

    if (evalError) return respondWithServerError(res, evalError, "listInterviewCandidates evaluations");

    const resumeByCandidate = {};
    (resumes || []).forEach((r) => {
      resumeByCandidate[r.candidate_id] = r;
    });

    const reviewsByResume = {};
    (reviews || []).forEach((review) => {
      if (!reviewsByResume[review.resume_id]) reviewsByResume[review.resume_id] = [];
      reviewsByResume[review.resume_id].push(review);
    });

    const evalByCandidate = {};
    (evaluations || []).forEach((row) => {
      evalByCandidate[row.candidate_id] = row;
    });

    const pool = (candidates || []).filter((candidate) => {
      const resume = resumeByCandidate[candidate.id];
      if (!resume) return false;
      const resumeReviews = reviewsByResume[resume.id] || [];
      if (!resumeReviews.some(hasReviewScoreValues)) return false;
      return candidatePassesPriorRoundGate(candidate.id, priorGate);
    });

    const rubricConfig = resumeRound?.rubric_config || null;

    const mapped = pool.map((candidate) => {
      const resume = resumeByCandidate[candidate.id];
      const resumeReviews = reviewsByResume[resume.id] || [];
      const normalizedScores = resumeReviews
        .map((review) => resolveReviewNormalizedValue(review, {
          rubricConfig,
          candidateYear: candidate.year,
        }))
        .filter((v) => Number.isFinite(v));
      const avgResumeScore = normalizedScores.length
        ? Number((normalizedScores.reduce((a, b) => a + b, 0) / normalizedScores.length).toFixed(1))
        : null;
      const evaluation = mapEvaluation(evalByCandidate[candidate.id]);

      return {
        id: candidate.id,
        name: candidate.name,
        email: candidate.email,
        major: candidate.major,
        year: candidate.year,
        gpa: candidate.gpa,
        resumeId: resume.id,
        resumeName: resume.name,
        resumeFileUrl: resume.file_url,
        resumeReviewCount: resumeReviews.length,
        avgResumeScore,
        evaluation: evaluation || {
          decision: "pending",
          scheduledAt: null,
          notes: "",
        },
      };
    });

    const stats = { total: mapped.length, pending: 0, pass: 0, fail: 0, hold: 0 };
    mapped.forEach((c) => {
      const d = c.evaluation?.decision || "pending";
      if (stats[d] !== undefined) stats[d] += 1;
    });

    return res.json({
      context: {
        cycle: { id: ctx.cycle.id, name: ctx.cycle.name },
        round: { id: ctx.round.id, name: ctx.round.name },
      },
      stats,
      deliberationStarted: priorGate.gateStarted,
      candidates: mapped,
    });
  } catch (err) {
    return respondWithServerError(res, err, "listInterviewCandidates");
  }
};

exports.upsertInterviewEvaluation = async (req, res) => {
  const candidateId = String(req.body?.candidate_id || "").trim();
  const decision = VALID_DECISIONS.has(req.body?.decision) ? req.body.decision : "pending";
  const notes = typeof req.body?.notes === "string" ? req.body.notes.slice(0, 1000) : "";
  const scheduledAt = req.body?.scheduled_at || null;
  const evaluatedBy = req.user?.user_id;

  if (!candidateId) {
    return res.status(400).json({ error: "candidate_id is required" });
  }

  try {
    const ctx = await requireActiveInterviewRound();
    if (ctx.error) {
      return res.status(ctx.status).json({ error: ctx.error });
    }

    const { data: candidate, error: candError } = await supabase
      .from("candidates")
      .select("id, cycle_id")
      .eq("id", candidateId)
      .maybeSingle();

    if (candError) return respondWithServerError(res, candError, "upsertInterviewEvaluation candidate");
    if (!candidate) return res.status(404).json({ error: "Candidate not found" });
    if (candidate.cycle_id !== ctx.cycle.id) {
      return res.status(400).json({ error: "Candidate is not in the active cycle" });
    }

    const priorGate = await loadPriorRoundGate(ctx.cycle.id, ctx.round);
    if (!candidatePassesPriorRoundGate(candidateId, priorGate)) {
      const priorLabel = priorGate.priorRound?.name || "the previous round";
      return res.status(400).json({
        error: `Only candidates who advanced from ${priorLabel} can be evaluated in this round.`,
      });
    }

    const payload = {
      candidate_id: candidateId,
      cycle_id: ctx.cycle.id,
      round_id: ctx.round.id,
      decision,
      notes,
      scheduled_at: scheduledAt,
      evaluated_by: evaluatedBy,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("interview_evaluations")
      .upsert(payload, { onConflict: "candidate_id,round_id" })
      .select("*")
      .single();

    if (error) return respondWithServerError(res, error, "upsertInterviewEvaluation upsert");

    return res.json({ evaluation: mapEvaluation(data) });
  } catch (err) {
    return respondWithServerError(res, err, "upsertInterviewEvaluation");
  }
};

exports.getInterviewStats = async (req, res) => {
  try {
    const activeRound = await getActiveInterviewRound();
    if (!activeRound) {
      return res.json({ evaluated: 0, total: 0, pending: 0 });
    }

    const { data: evaluations, error } = await supabase
      .from("interview_evaluations")
      .select("decision")
      .eq("round_id", activeRound.id);

    if (error) return respondWithServerError(res, error, "getInterviewStats");

    const rows = evaluations || [];
    const evaluated = rows.filter((r) => r.decision && r.decision !== "pending").length;

    return res.json({
      evaluated,
      total: rows.length,
      pending: rows.filter((r) => !r.decision || r.decision === "pending").length,
    });
  } catch (err) {
    return respondWithServerError(res, err, "getInterviewStats");
  }
};
