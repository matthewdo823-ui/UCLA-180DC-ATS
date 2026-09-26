const { screeningAccessError, ELIGIBLE_YEAR_FILTER } = require('../utils/screeningEligibility');
const supabase = require("../config/supabase");
const {
  getActiveCycleRow,
  getOpenInterviewRound,
  getResumeScreenRoundForCycle,
  getRoundsForCycle,
  requireOpenInterviewRound,
  requireInterviewGradingPhase,
  requireRoundByType,
} = require("../utils/cycleContext");
const { hasReviewScoreValues, resolveReviewNormalizedValue } = require("../utils/rubric");
const { respondWithServerError } = require("../utils/httpErrors");
const { isMissingSchemaError } = require("../utils/schemaCompatibility");
const { getUserName } = require("../utils/userDisplay");
const {
  buildDecisionLookup,
  deliberationHasStarted,
  normalizeRoundDecision,
} = require("../utils/roundDecisions");
const {
  ROUND_TYPES,
  getPriorRound,
  isResumeScreenType,
  normalizeRoundType,
} = require("../utils/rounds");
const { TABLE_PHASES } = require("../utils/roundPhases");
const { isNoShowGroup } = require("../utils/interviewGroups");

const VALID_DECISIONS = new Set(["pending", "pass", "fail", "hold"]);
const COFFEE_CHAT_SCORES = Object.freeze({ strong_yes: 2, yes: 1, no: -1, strong_no: -2 });

function mapEvaluation(row) {
  if (!row) return null;
  return {
    id: row.id,
    candidateId: row.candidate_id,
    cycleId: row.cycle_id,
    roundId: row.round_id,
    decision: row.decision,
    rating: row.rating || null,
    weightedScore: row.weighted_score == null ? null : Number(row.weighted_score),
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

  const { data: roundDecisionRows, error: roundDecisionError } = await supabase
    .from("round_decisions")
    .select("candidate_id, decision")
    .eq("cycle_id", cycleId)
    .eq("round_id", priorRound.id);

  if (roundDecisionError) throw roundDecisionError;

  const committeeGateStarted = deliberationHasStarted(roundDecisionRows);
  if (committeeGateStarted || isResumeScreenType(priorRound.type)) {
    const eligibleCandidateIds = committeeGateStarted
      ? new Set(
        (roundDecisionRows || [])
          .filter((row) => normalizeRoundDecision(row.decision) === "advance")
          .map((row) => row.candidate_id)
          .filter(Boolean)
      )
      : null;

    return { priorRound, gateStarted: committeeGateStarted, eligibleCandidateIds };
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
    const ctx = await requireOpenInterviewRound();
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
      .select("id, name, email, major, year, gpa, headshot, cycle_id")
      .or(ELIGIBLE_YEAR_FILTER)
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

    const [evaluationResult, groupResult, memberGroupResult] = await Promise.all([
      supabase.from("interview_evaluations").select("*").eq("round_id", ctx.round.id),
      supabase.from("interview_group_assignments").select("candidate_id, group_number").eq("round_id", ctx.round.id),
      supabase
        .from("interview_group_member_assignments")
        .select("user_id, group_number")
        .eq("round_id", ctx.round.id),
    ]);
    const { data: evaluations, error: evalError } = evaluationResult;
    const { data: groupAssignments, error: groupError } = groupResult;
    const { data: memberGroups, error: memberGroupError } = memberGroupResult;

    if (evalError) return respondWithServerError(res, evalError, "listInterviewCandidates evaluations");
    if (groupError && !isMissingSchemaError(groupError)) return respondWithServerError(res, groupError, "listInterviewCandidates groups");
    if (memberGroupError && !isMissingSchemaError(memberGroupError)) return respondWithServerError(res, memberGroupError, "listInterviewCandidates member group");
    const memberGroup = (memberGroupError ? [] : memberGroups || [])
      .find((assignment) => assignment.user_id === req.user?.user_id) || null;
    const assignedMemberIds = new Set((memberGroupError ? [] : memberGroups || []).map((assignment) => assignment.user_id));

    const resumeByCandidate = {};
    (resumes || []).forEach((r) => {
      resumeByCandidate[r.candidate_id] = r;
    });

    const reviewsByResume = {};
    (reviews || []).forEach((review) => {
      if (!reviewsByResume[review.resume_id]) reviewsByResume[review.resume_id] = [];
      reviewsByResume[review.resume_id].push(review);
    });

    const evalsByCandidate = {};
    (evaluations || []).forEach((row) => {
      if (!evalsByCandidate[row.candidate_id]) evalsByCandidate[row.candidate_id] = [];
      evalsByCandidate[row.candidate_id].push(row);
    });
    const groupByCandidate = Object.fromEntries((groupError ? [] : groupAssignments || []).map((row) => [row.candidate_id, row.group_number]));

    const pool = (candidates || []).filter((candidate) => {
      if (isNoShowGroup(groupByCandidate[candidate.id])) return false;
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
      const candidateEvaluations = evalsByCandidate[candidate.id] || [];
      const myEvaluation = candidateEvaluations.find((row) => row.evaluated_by === req.user?.user_id) || null;
      const scoredEvaluations = candidateEvaluations.filter((row) =>
        Number.isFinite(Number(row.weighted_score))
        && (memberGroupError || assignedMemberIds.has(row.evaluated_by))
      );
      const coffeeChatScore = scoredEvaluations.reduce((sum, row) => sum + Number(row.weighted_score), 0);

      return {
        id: candidate.id,
        name: candidate.name,
        email: candidate.email,
        major: candidate.major,
        year: candidate.year,
        gpa: candidate.gpa,
        headshot: candidate.headshot || "",
        resumeId: resume.id,
        resumeName: resume.name,
        resumeFileUrl: resume.file_url,
        resumeReviewCount: resumeReviews.length,
        avgResumeScore,
        groupNumber: groupByCandidate[candidate.id] || null,
        coffeeChatScore,
        coffeeChatEvaluationCount: scoredEvaluations.length,
        evaluation: mapEvaluation(myEvaluation) || {
          decision: "pending",
          rating: null,
          weightedScore: null,
          scheduledAt: null,
          notes: "",
        },
      };
    });

    [...mapped]
      .sort((a, b) => {
        if (a.avgResumeScore == null && b.avgResumeScore == null) return String(a.name).localeCompare(String(b.name));
        if (a.avgResumeScore == null) return 1;
        if (b.avgResumeScore == null) return -1;
        return b.avgResumeScore - a.avgResumeScore || String(a.name).localeCompare(String(b.name));
      })
      .forEach((candidate, index) => {
        candidate.resumeScreenRank = index + 1;
      });

    const stats = { total: mapped.length, graded: 0, pending: 0, strongYes: 0, yes: 0, no: 0, strongNo: 0 };
    mapped.forEach((c) => {
      const rating = c.evaluation?.rating;
      if (!rating) stats.pending += 1;
      else {
        stats.graded += 1;
        const key = rating === "strong_yes" ? "strongYes" : rating === "strong_no" ? "strongNo" : rating;
        stats[key] += 1;
      }
    });

    const aggregateStats = {
      total: mapped.length,
      graded: 0,
      pending: 0,
      totalRatings: 0,
      strongYes: 0,
      yes: 0,
      no: 0,
      strongNo: 0,
    };
    mapped.forEach((candidate) => {
      const candidateEvaluations = evalsByCandidate[candidate.id] || [];
      const rated = candidateEvaluations.filter((row) =>
        COFFEE_CHAT_SCORES[row.rating] != null
        && (memberGroupError || assignedMemberIds.has(row.evaluated_by))
      );
      if (rated.length) aggregateStats.graded += 1;
      else aggregateStats.pending += 1;
      aggregateStats.totalRatings += rated.length;
      rated.forEach((row) => {
        const key = row.rating === "strong_yes" ? "strongYes" : row.rating === "strong_no" ? "strongNo" : row.rating;
        aggregateStats[key] += 1;
      });
    });

    return res.json({
      context: {
          cycle: { id: ctx.cycle.id, name: ctx.cycle.name },
          round: { id: ctx.round.id, name: ctx.round.name, type: ctx.round.type },
          groupCount: Number(ctx.round.interview_group_count) || 1,
          hasGroupAssignments: !groupError && (groupAssignments || []).length > 0,
          startingGroupNumber: Number(memberGroup?.group_number) || null,
          memberAssignmentsReady: !memberGroupError,
          assignedMemberCount: memberGroupError ? null : (memberGroups || []).length,
      },
      stats,
      aggregateStats,
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
  const rating = String(req.body?.rating || "").trim().toLowerCase();

  if (!candidateId) {
    return res.status(400).json({ error: "candidate_id is required" });
  }

  try {
    const ctx = await requireInterviewGradingPhase();
    if (ctx.error) {
      return res.status(ctx.status).json({ error: ctx.error });
    }

    const { data: candidate, error: candError } = await supabase
      .from("candidates")
      .select("id, cycle_id, year")
      .eq("id", candidateId)
      .maybeSingle();

    if (candError) return respondWithServerError(res, candError, "upsertInterviewEvaluation candidate");
    if (!candidate) return res.status(404).json({ error: "Candidate not found" });
    if (candidate.cycle_id !== ctx.cycle.id) {
      return res.status(400).json({ error: "Candidate is not in the active cycle" });
    }

    const exclusion = screeningAccessError(candidate);
    if (exclusion) return res.status(exclusion.status).json({ error: exclusion.error });
    const priorGate = await loadPriorRoundGate(ctx.cycle.id, ctx.round);
    if (!candidatePassesPriorRoundGate(candidateId, priorGate)) {
      const priorLabel = priorGate.priorRound?.name || "the previous round";
      return res.status(400).json({
        error: `Only candidates who advanced from ${priorLabel} can be evaluated in this round.`,
      });
    }

    const isCoffeeChat = normalizeRoundType(ctx.round.type) === ROUND_TYPES.COFFEE_CHAT;
    if (isCoffeeChat && !rating) {
      const { error: deleteError } = await supabase
        .from("interview_evaluations")
        .delete()
        .eq("candidate_id", candidateId)
        .eq("round_id", ctx.round.id)
        .eq("evaluated_by", evaluatedBy);
      if (deleteError) return respondWithServerError(res, deleteError, "upsertInterviewEvaluation clear");
      return res.json({ evaluation: null });
    }
    if (isCoffeeChat && !Object.prototype.hasOwnProperty.call(COFFEE_CHAT_SCORES, rating)) {
      return res.status(400).json({ error: "rating must be Strong Yes, Yes, No, or Strong No" });
    }

    const payload = {
      candidate_id: candidateId,
      cycle_id: ctx.cycle.id,
      round_id: ctx.round.id,
      decision: isCoffeeChat ? "pending" : decision,
      notes,
      scheduled_at: scheduledAt,
      evaluated_by: evaluatedBy,
      updated_at: new Date().toISOString(),
      ...(isCoffeeChat ? {
        rating,
        weighted_score: COFFEE_CHAT_SCORES[rating],
      } : {}),
    };

    const { data, error } = await supabase
      .from("interview_evaluations")
      .upsert(payload, { onConflict: "candidate_id,round_id,evaluated_by" })
      .select("*")
      .single();

    if (error) {
      if (isMissingSchemaError(error)) {
        return res.status(503).json({ error: "Coffee Chat scoring requires database migration #22." });
      }
      return respondWithServerError(res, error, "upsertInterviewEvaluation upsert");
    }

    return res.json({ evaluation: mapEvaluation(data) });
  } catch (err) {
    return respondWithServerError(res, err, "upsertInterviewEvaluation");
  }
};

exports.assignInterviewGroups = async (req, res) => {
  const groupCount = Number(req.body?.group_count);
  if (!Number.isInteger(groupCount) || groupCount < 1 || groupCount > 100) {
    return res.status(400).json({ error: "group_count must be a whole number between 1 and 100" });
  }

  try {
    // Resolved by type, not by "whichever round is open": tables have to be
    // assigned while the round is still in setup, before grading can open.
    const ctx = await requireRoundByType(ROUND_TYPES.COFFEE_CHAT, TABLE_PHASES);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const requestedRoundId = String(req.body?.round_id || "").trim();
    if (requestedRoundId && requestedRoundId !== ctx.round.id) {
      return res.status(400).json({ error: "Tables can only be assigned for this cycle's Coffee Chat round" });
    }

    const priorGate = await loadPriorRoundGate(ctx.cycle.id, ctx.round);
    const { data: candidates, error: candidateError } = await supabase
      .from("candidates")
      .select("id")
      .or(ELIGIBLE_YEAR_FILTER)
      .eq("cycle_id", ctx.cycle.id);
    if (candidateError) throw candidateError;

    const candidateIds = (candidates || []).map((candidate) => candidate.id);
    const resumeRound = await getResumeScreenRoundForCycle(ctx.cycle.id);
    const { data: resumes, error: resumeError } = candidateIds.length
      ? await supabase
        .from("resumes")
        .select("id, candidate_id")
        .eq("cycle_id", ctx.cycle.id)
        .in("candidate_id", candidateIds)
      : { data: [], error: null };
    if (resumeError) throw resumeError;
    const resumeIds = (resumes || []).map((resume) => resume.id);
    const { data: reviews, error: reviewError } = resumeRound && resumeIds.length
      ? await supabase
        .from("resume_reviews")
        .select("resume_id, scores")
        .eq("cycle_id", ctx.cycle.id)
        .eq("round_id", resumeRound.id)
        .in("resume_id", resumeIds)
      : { data: [], error: null };
    if (reviewError) throw reviewError;
    const resumeByCandidate = Object.fromEntries((resumes || []).map((resume) => [resume.candidate_id, resume.id]));
    const reviewedResumeIds = new Set((reviews || []).filter(hasReviewScoreValues).map((review) => review.resume_id));

    const eligibleIds = (candidates || [])
      .filter((candidate) => {
        const resumeId = resumeByCandidate[candidate.id];
        return resumeId
          && reviewedResumeIds.has(resumeId)
          && candidatePassesPriorRoundGate(candidate.id, priorGate);
      })
      .map((candidate) => candidate.id);

    if (groupCount > eligibleIds.length && eligibleIds.length > 0) {
      return res.status(400).json({ error: `group_count cannot exceed the ${eligibleIds.length} eligible candidates` });
    }

    for (let index = eligibleIds.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [eligibleIds[index], eligibleIds[swapIndex]] = [eligibleIds[swapIndex], eligibleIds[index]];
    }

    if (eligibleIds.length) {
      const { error: insertError } = await supabase.from("interview_group_assignments").upsert(
        eligibleIds.map((candidateId, index) => ({
          candidate_id: candidateId,
          cycle_id: ctx.cycle.id,
          round_id: ctx.round.id,
          group_number: (index % groupCount) + 1,
          assigned_by: req.user?.user_id,
        })),
        { onConflict: "candidate_id,round_id" }
      );
      if (insertError) throw insertError;
    }

    const { data: existingAssignments, error: existingError } = await supabase
      .from("interview_group_assignments")
      .select("candidate_id")
      .eq("round_id", ctx.round.id);
    if (existingError) throw existingError;
    const eligibleSet = new Set(eligibleIds);
    const staleIds = (existingAssignments || [])
      .map((row) => row.candidate_id)
      .filter((candidateId) => !eligibleSet.has(candidateId));
    if (staleIds.length) {
      const { error: deleteError } = await supabase
        .from("interview_group_assignments")
        .delete()
        .eq("round_id", ctx.round.id)
        .in("candidate_id", staleIds);
      if (deleteError) throw deleteError;
    }

    const { error: roundError } = await supabase
      .from("rounds")
      .update({ interview_group_count: groupCount })
      .eq("id", ctx.round.id);
    if (roundError) throw roundError;

    const { error: staleMemberError } = await supabase
      .from("interview_group_member_assignments")
      .delete()
      .eq("round_id", ctx.round.id)
      .gt("group_number", groupCount);
    if (staleMemberError && !isMissingSchemaError(staleMemberError)) throw staleMemberError;

    const sizes = Array.from({ length: groupCount }, (_, index) =>
      eligibleIds.filter((_, candidateIndex) => candidateIndex % groupCount === index).length
    );
    return res.json({ groupCount, candidateCount: eligibleIds.length, groupSizes: sizes });
  } catch (err) {
    if (isMissingSchemaError(err)) {
      return res.status(503).json({ error: "Coffee Chat scoring requires database migration #22." });
    }
    return respondWithServerError(res, err, "assignInterviewGroups");
  }
};

exports.getInterviewStats = async (req, res) => {
  try {
    const activeRound = await getOpenInterviewRound();
    if (!activeRound) {
      return res.json({ evaluated: 0, total: 0, pending: 0 });
    }

    const { data: evaluations, error } = await supabase
      .from("interview_evaluations")
      .select("*")
      .eq("round_id", activeRound.id);

    if (error) return respondWithServerError(res, error, "getInterviewStats");

    const rows = evaluations || [];
    if (normalizeRoundType(activeRound.type) === ROUND_TYPES.COFFEE_CHAT) {
      const evaluatedCandidates = new Set(rows.filter((row) => COFFEE_CHAT_SCORES[row.rating] != null).map((row) => row.candidate_id));
      return res.json({ evaluated: evaluatedCandidates.size, totalRatings: rows.filter((row) => COFFEE_CHAT_SCORES[row.rating] != null).length, pending: 0 });
    }
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

exports.setMyCoffeeChatStartingTable = async (req, res) => {
  const groupNumber = Number(req.body?.groupNumber);
  try {
    const ctx = await requireRoundByType(ROUND_TYPES.COFFEE_CHAT, TABLE_PHASES);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });

    const groupCount = Number(ctx.round.interview_group_count) || 1;
    if (!Number.isInteger(groupNumber) || groupNumber < 1 || groupNumber > groupCount) {
      return res.status(400).json({ error: `groupNumber must be between 1 and ${groupCount}` });
    }

    const { data, error } = await supabase
      .from("interview_group_member_assignments")
      .upsert({
        cycle_id: ctx.cycle.id,
        round_id: ctx.round.id,
        user_id: req.user.user_id,
        group_number: groupNumber,
        assigned_by: req.user.user_id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "round_id,user_id" })
      .select("user_id, group_number")
      .single();

    if (error) {
      if (isMissingSchemaError(error)) {
        return res.status(503).json({ error: "Starting-table selection requires database migration #23." });
      }
      throw error;
    }
    return res.json({ userId: data.user_id, groupNumber: data.group_number });
  } catch (err) {
    return respondWithServerError(res, err, "setMyCoffeeChatStartingTable");
  }
};

exports.getCoffeeChatGraderScoreboard = async (req, res) => {
  try {
    const ctx = await requireOpenInterviewRound();
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    if (normalizeRoundType(ctx.round.type) !== ROUND_TYPES.COFFEE_CHAT) {
      return res.status(400).json({ error: "Coffee Chat grader progress is only available during Coffee Chats" });
    }

    const [memberAssignmentRes, groupRes] = await Promise.all([
      supabase
        .from("interview_group_member_assignments")
        .select("user_id, group_number")
        .eq("round_id", ctx.round.id),
      supabase
        .from("interview_group_assignments")
        .select("candidate_id, group_number")
        .eq("round_id", ctx.round.id),
    ]);

    if (memberAssignmentRes.error) {
      if (isMissingSchemaError(memberAssignmentRes.error)) {
        return res.status(503).json({ error: "Coffee Chat grader progress requires participant assignment migration #23." });
      }
      throw memberAssignmentRes.error;
    }
    if (groupRes.error) throw groupRes.error;

    const memberAssignments = memberAssignmentRes.data || [];
    const memberIds = [...new Set(memberAssignments.map((row) => row.user_id).filter(Boolean))];
    const candidateIds = [...new Set((groupRes.data || [])
      .filter((row) => !isNoShowGroup(row.group_number))
      .map((row) => row.candidate_id)
      .filter(Boolean))];

    const [userRes, candidateRes, evaluationRes] = await Promise.all([
      memberIds.length
        ? supabase
          .from("users")
          .select("user_id, email, role, first_name, last_name, created_at, last_login")
          .in("role", ["admin", "member"])
          .in("user_id", memberIds)
        : { data: [], error: null },
      candidateIds.length
        ? supabase
          .from("candidates")
          .select("id, name")
          .in("id", candidateIds)
        : { data: [], error: null },
      memberIds.length
        ? supabase
          .from("interview_evaluations")
          .select("id, candidate_id, evaluated_by, rating, weighted_score, notes, submitted_at, updated_at")
          .eq("round_id", ctx.round.id)
          .in("evaluated_by", memberIds)
          .not("rating", "is", null)
        : { data: [], error: null },
    ]);

    if (userRes.error) throw userRes.error;
    if (candidateRes.error) throw candidateRes.error;
    if (evaluationRes.error) throw evaluationRes.error;

    const assignmentByUser = Object.fromEntries(memberAssignments.map((row) => [row.user_id, row]));
    const candidateById = Object.fromEntries((candidateRes.data || []).map((candidate) => [candidate.id, candidate]));
    const evaluationsByUser = {};
    (evaluationRes.data || []).forEach((evaluation) => {
      if (!evaluationsByUser[evaluation.evaluated_by]) evaluationsByUser[evaluation.evaluated_by] = [];
      evaluationsByUser[evaluation.evaluated_by].push(evaluation);
    });

    const ratingLabel = (rating) => ({
      strong_yes: "Strong yes",
      yes: "Yes",
      no: "No",
      strong_no: "Strong no",
    }[rating] || rating || "—");

    const expectedReviews = candidateIds.length;
    const graders = (userRes.data || []).map((user) => {
      const reviews = (evaluationsByUser[user.user_id] || [])
        .map((evaluation) => ({
          id: evaluation.id,
          candidateId: evaluation.candidate_id,
          resumeName: candidateById[evaluation.candidate_id]?.name || "Unknown candidate",
          rating: evaluation.rating,
          ratingLabel: ratingLabel(evaluation.rating),
          score: Number(evaluation.weighted_score),
          notes: evaluation.notes || "",
          submittedAt: evaluation.updated_at || evaluation.submitted_at,
        }))
        .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
      const totalScore = reviews.reduce((sum, review) => sum + (Number.isFinite(review.score) ? review.score : 0), 0);
      const reviewCount = reviews.length;
      return {
        id: user.user_id,
        name: getUserName(user),
        email: user.email || "",
        role: user.role,
        createdAt: user.created_at,
        lastLogin: user.last_login,
        startingGroupNumber: Number(assignmentByUser[user.user_id]?.group_number) || null,
        reviewCount,
        expectedReviews,
        progressScore: expectedReviews ? Math.min(100, Math.round((reviewCount / expectedReviews) * 100)) : 0,
        averageScore: reviewCount ? Number((totalScore / reviewCount).toFixed(2)) : null,
        averageNormalizedScore: null,
        latestReviewAt: reviews[0]?.submittedAt || null,
        categoryScores: {},
        reviews,
      };
    });

    graders.sort((a, b) => b.reviewCount - a.reviewCount || a.name.localeCompare(b.name));
    graders.forEach((grader, index) => { grader.rank = index + 1; });
    const totalReviews = graders.reduce((sum, grader) => sum + grader.reviewCount, 0);

    return res.json({
      context: {
        cycle: { id: ctx.cycle.id, name: ctx.cycle.name },
        round: { id: ctx.round.id, name: ctx.round.name, type: ctx.round.type },
        assignedMemberCount: graders.length,
      },
      metrics: [],
      maxPerCategory: 0,
      stats: {
        graders: graders.length,
        activeGraders: graders.filter((grader) => grader.reviewCount > 0).length,
        totalReviews,
        expectedReviews,
        expectedRatingsPerCandidate: graders.length,
      },
      graders,
    });
  } catch (err) {
    return respondWithServerError(res, err, "getCoffeeChatGraderScoreboard");
  }
};
