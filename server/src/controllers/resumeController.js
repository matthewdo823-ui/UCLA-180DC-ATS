const { mapApplicationCandidate } = require('../utils/applicationCandidate');
const { applyScreeningEligibility, screeningAccessError, screeningExclusionReason, ELIGIBLE_YEAR_FILTER } = require('../utils/screeningEligibility');
const { canGradeFrq } = require('../utils/auth');
const supabase = require('../config/supabase');
const { extractDriveFileID, toDownloadURL, isGoogleDriveFileUrl } = require('../utils/drive');
const { getSignedUrl, SIGNED_URL_TTL_SECONDS } = require('../utils/documentStorage');
const {
    getActiveCycleId,
    getActiveCycleRow,
    getResumeScreenRoundForCycle,
    getRoundsForCycle,
    getOpenRoundForCycle,
    requireOpenResumeRound,
    requireResumeGradingPhase,
} = require('../utils/cycleContext');
const {
    getRubricForYear,
    normalizeScreeningScoresInput,
    buildRubricSnapshot,
    computeRawScore,
    computeNormalizedScore,
    getMetricsFromRubricConfig,
    getRubricMaxScore,
    resolveReviewNormalizedValue,
    getReviewScoring,
    resolveCandidateResumeMax,
} = require('../utils/rubric');
const {
    getRoundPhase,
    isOpenPhase,
    canRecordDecisions,
} = require('../utils/roundPhases');
const { firstRel } = require('../utils/supabaseHelpers');
const { fetchAllRowsResult } = require('../utils/supabasePagination');
const { getUserName } = require('../utils/userDisplay');
const { respondWithServerError } = require('../utils/httpErrors');
const { isMissingSchemaError } = require('../utils/schemaCompatibility');
const { applyDemonstratedInterestToCandidates, maxInterestMultiplier } = require('../utils/demonstratedInterest');
const { loadAttendedEventsByCandidate } = require('../services/interestSyncService');
const {
    normalizeRoundDecision,
    mapRoundDecision,
    buildDecisionLookup,
    resolveCandidateDecision,
    countDecisions,
    deliberationHasStarted,
    summarizeIncompleteDeliberation,
} = require('../utils/roundDecisions');
const { ROUND_TYPES, getRoundByType, isInterviewRoundType, isResumeScreenType, normalizeRoundType } = require('../utils/rounds');
const {
    getScoreboardCoffeeChatEvaluations,
    shouldIncludeCoffeeChatEvaluationInProfile,
} = require('../utils/coffeeChatScoring');
const {
    buildCandidateLinkLookups,
    resolveCandidateLink,
    applyResumeCandidateLink,
} = require('../utils/candidateLink');
const {
    mapScoreboardRoundContext,
    resolveDeliberationRounds,
    filterCandidatesForDeliberationRound,
    loadPriorRoundDecisionRows,
    assertCandidateEligibleForRoundDecision,
} = require('../services/roundDeliberationService');
const {
    DELIBERATION_VOTE_SCORES,
    isValidDeliberationRating,
    mapDeliberationVote,
    aggregateDeliberationVotes,
} = require('../utils/deliberationVotes');
const {
    resolveAdvanceNotificationForRound,
    fetchLatestAdvanceBatch,
    isGmailConfigured,
} = require('../services/roundNotificationService');
const {
    isAiSummaryConfigured,
    resolveCandidateSummary,
} = require('../services/candidateSummaryService');
const {
    mapReviewOverride,
    fetchReviewOverridesByReviewIds,
    applyReviewOverridesToCandidate,
    applyReviewOverridesToCandidates,
} = require('../services/reviewOverrideService');
const {
    fetchPendingAssignedResumeIds,
} = require('../services/assignmentService');
const {
    FRQ_METRIC,
    FRQ_MAX_SCORE,
    mapFrqReviewRow,
    groupFrqReviewsByResumeId,
    applyCompositeScoringToCandidate,
    applyCompositeScoringToCandidates,
    appendFrqMetric,
} = require('../services/frqScoringService');
const {
    resolveCycleGradingGoals,
} = require('../utils/gradingGoals');
const { normalizeRequiredFrqNotes } = require('../utils/frqReview');
const { claimNextReview, renewReviewClaim, releaseReviewClaim } = require('../services/reviewClaimService');
const VALID_REVIEW_DECISIONS = new Set(["pass", "flag", "reject"]);
const MIN_SIGNAL_NOTE_LENGTH = 20;

function getReviewScore(scores = {}, metrics = null) {
    return computeRawScore(scores, metrics);
}

async function resolveCandidateIdForSignal({ candidate_id, resume_id }) {
    let candidateId = candidate_id;

    if (!candidateId && resume_id) {
        const { data, error } = await supabase
            .from('resumes')
            .select('candidate_id')
            .eq('id', resume_id)
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            return { error: "Resume not found", status: 404 };
        }
        candidateId = data.candidate_id;
    }

    if (!candidateId) {
        return { error: "candidate_id or a linked resume_id is required", status: 400 };
    }

    const { data: candidate, error: candidateError } = await supabase
        .from('candidates')
        .select('id, cycle_id')
        .eq('id', candidateId)
        .maybeSingle();

    if (candidateError) throw candidateError;
    if (!candidate) {
        return { error: "Candidate not found", status: 404 };
    }

    return { candidateId, candidate };
}

async function loadCandidateSignalLookups(candidateIds, userId) {
    const ids = [...new Set((candidateIds || []).filter(Boolean))];
    if (!ids.length) {
        return {
            flagCounts: {},
            referralCounts: {},
            flaggedByMe: new Set(),
            referredByMe: new Set(),
        };
    }

    const [flagRes, referralRes] = await Promise.all([
        supabase
            .from('candidate_flags')
            .select('candidate_id, flagged_by')
            .eq('status', 'open')
            .in('candidate_id', ids),
        supabase
            .from('candidate_referrals')
            .select('candidate_id, referred_by')
            .in('candidate_id', ids),
    ]);

    if (flagRes.error) throw flagRes.error;
    if (referralRes.error) throw referralRes.error;

    const flagCounts = {};
    const referralCounts = {};
    const flaggedByMe = new Set();
    const referredByMe = new Set();

    (flagRes.data || []).forEach((row) => {
        flagCounts[row.candidate_id] = (flagCounts[row.candidate_id] || 0) + 1;
        if (userId != null && row.flagged_by === userId) flaggedByMe.add(row.candidate_id);
    });

    (referralRes.data || []).forEach((row) => {
        referralCounts[row.candidate_id] = (referralCounts[row.candidate_id] || 0) + 1;
        if (userId != null && row.referred_by === userId) referredByMe.add(row.candidate_id);
    });

    return { flagCounts, referralCounts, flaggedByMe, referredByMe };
}

async function fetchCandidateSignalsDetail(candidateId, userId) {
    if (!candidateId) {
        return {
            flags: [],
            referrals: [],
            flagCount: 0,
            referralCount: 0,
            flaggedByMe: false,
            referredByMe: false,
        };
    }

    const [flagRes, referralRes] = await Promise.all([
        supabase
            .from('candidate_flags')
            .select(`
                id,
                reason,
                created_at,
                flagged_by,
                users (
                    user_id,
                    email,
                    first_name,
                    last_name
                )
            `)
            .eq('candidate_id', candidateId)
            .eq('status', 'open')
            .order('created_at', { ascending: false }),
        supabase
            .from('candidate_referrals')
            .select(`
                id,
                note,
                created_at,
                referred_by,
                users (
                    user_id,
                    email,
                    first_name,
                    last_name
                )
            `)
            .eq('candidate_id', candidateId)
            .order('created_at', { ascending: false }),
    ]);

    if (flagRes.error) throw flagRes.error;
    if (referralRes.error) throw referralRes.error;

    const flags = (flagRes.data || []).map((row) => ({
        id: row.id,
        reason: row.reason || '',
        createdAt: row.created_at,
        flaggedBy: row.users ? {
            id: row.users.user_id,
            name: getUserName(row.users),
            email: row.users.email || '',
        } : null,
    }));

    const referrals = (referralRes.data || []).map((row) => ({
        id: row.id,
        note: row.note || '',
        createdAt: row.created_at,
        referredBy: row.users ? {
            id: row.users.user_id,
            name: getUserName(row.users),
            email: row.users.email || '',
        } : null,
    }));

    return {
        flags,
        referrals,
        flagCount: flags.length,
        referralCount: referrals.length,
        flaggedByMe: userId != null && flags.some((flag) => flag.flaggedBy?.id === userId),
        referredByMe: userId != null && referrals.some((referral) => referral.referredBy?.id === userId),
    };
}

function applyCandidateSignals(candidate, lookups) {
    const candidateId = candidate.candidateId;
    return {
        ...candidate,
        flagCount: candidateId ? (lookups.flagCounts[candidateId] || 0) : 0,
        referralCount: candidateId ? (lookups.referralCounts[candidateId] || 0) : 0,
        flaggedByMe: candidateId ? lookups.flaggedByMe.has(candidateId) : false,
        referredByMe: candidateId ? lookups.referredByMe.has(candidateId) : false,
    };
}

function buildCategoryScores(categoryTotals = {}, categoryCounts = {}) {
    const keys = new Set([
        ...Object.keys(categoryTotals),
        ...Object.keys(categoryCounts),
    ]);
    const acc = {};
    keys.forEach((metric) => {
        const count = categoryCounts[metric] || 0;
        const total = categoryTotals[metric] || 0;
        acc[metric] = count > 0 ? Number((total / count).toFixed(1)) : null;
    });
    return acc;
}

function mapMyReviewRow(row, rubricConfig = null) {
    const resume = firstRel(row.resumes);
    const cand = firstRel(resume?.candidates);
    const snapshot = row.rubric_snapshot || null;
    const scoring = getReviewScoring(row, {
        rubricConfig,
        candidateYear: cand?.year,
    });
    return {
        reviewId: row.id,
        id: row.resume_id,
        resumeId: row.resume_id,
        resumeName: resume?.name ?? null,
        candidateName: cand?.name ?? null,
        year: cand?.year ?? null,
        major: cand?.major ?? null,
        gpa: cand?.gpa ?? null,
        scores: row.scores || {},
        rubricSnapshot: snapshot || scoring.snapshot,
        metrics: scoring.metrics,
        total: scoring.score,
        maxScore: scoring.maxScore,
        normalizedScore: scoring.normalizedScore ?? resolveReviewNormalizedValue(row, {
            rubricConfig,
            candidateYear: cand?.year,
        }),
        decision: row.decision || "pass",
        notes: row.notes || "",
        submittedAt: row.submitted_at,
    };
}

/** Map graded_by (users.user_id) → display name/email for scoreboard rows. */
async function getGradedByUserLookup(gradedByIds) {
    const unique = [...new Set((gradedByIds || []).filter(Boolean))];
    const lookup = {};
    if (!unique.length) return lookup;

    const { data, error } = await supabase
        .from("users")
        .select("user_id, email, first_name, last_name")
        .in("user_id", unique);

    if (error) {
        console.warn("getGradedByUserLookup:", error.message);
        return lookup;
    }

    (data || []).forEach(user => {
        lookup[user.user_id] = {
            name: getUserName(user),
            email: user.email || null,
        };
    });

    return lookup;
}

/**
 * Resumes an admin pinned to this grader, in assignment order, skipping anything
 * they already reviewed. Returns [] when nothing is assigned so the caller falls
 * through to the shared priority queue — graders can't tell the two apart.
 */
async function fetchAssignedResumesForGrader({ gradedBy, cycleId, reviewedResumeIdSet }) {
    if (!gradedBy) return [];

    const pendingIds = await fetchPendingAssignedResumeIds({
        graderId: gradedBy,
        cycleId,
        reviewedResumeIdSet,
    });
    if (!pendingIds.length) return [];

    const { data, error } = await supabase
        .from('resumes')
        .select(`*,
            candidates!inner(year, major)
        `)
        .eq('cycle_id', cycleId)
        .or(ELIGIBLE_YEAR_FILTER, { referencedTable: "candidates" })
        .in('id', pendingIds);

    if (error) throw error;

    // Preserve assignment order; the .in() result comes back unordered.
    const byId = new Map((data || []).map((row) => [row.id, row]));
    return pendingIds.map((id) => byId.get(id)).filter(Boolean);
}

// Gets next resume row
exports.getNextResume = async (req, res) => {
    const gradedBy = req.user?.user_id;

    const screening = await requireOpenResumeRound();
    if (screening.error) {
        return res.status(screening.status).json({ error: screening.error });
    }

    let reviewedResumeIds = [];
    if (gradedBy) {
        const { data: reviewedRows, error: reviewedError } = await supabase
            .from('resume_reviews')
            .select('resume_id')
            .eq('graded_by', gradedBy)
            .eq('cycle_id', screening.cycle.id);

        if (reviewedError) return respondWithServerError(res, reviewedError, 'getNextResume reviewed');
        reviewedResumeIds = [...new Set((reviewedRows || []).map((row) => row.resume_id).filter(Boolean))];
    }
    const reviewedResumeIdSet = new Set(reviewedResumeIds);

    let assignedRows = [];
    try {
        assignedRows = await fetchAssignedResumesForGrader({
            gradedBy,
            cycleId: screening.cycle.id,
            reviewedResumeIdSet,
        });
    } catch (assignmentError) {
        return respondWithServerError(res, assignmentError, 'getNextResume assignments');
    }

    for (const row of assignedRows) {
        if (!isGoogleDriveFileUrl(row.file_url)) {
            console.warn(`[getNextResume] Skipping assigned resume ${row.id}: not a valid Google Drive URL`);
            continue;
        }

        const fileID = extractDriveFileID(row.file_url);
        return res.json({
            ...row,
            file_url: toDownloadURL(fileID),
        });
    }

    let query = supabase
        .from('resumes')
        .select(`*,
            candidates!inner(year, major)
        `)
        .eq('cycle_id', screening.cycle.id)
        .or(ELIGIBLE_YEAR_FILTER, { referencedTable: "candidates" })
        .order('review_count', { ascending: true })
        .order('created_at', { ascending: true });

    if (reviewedResumeIds.length) {
        query = query.not('id', 'in', `(${reviewedResumeIds.join(',')})`);
    }

    const { data: resumeCandidates, error } = await query.limit(100);

    if (error) return respondWithServerError(res, error, 'getNextResume');

    const servable = (resumeCandidates || []).filter((row) => {
        if (reviewedResumeIdSet.has(row.id)) return false;
        if (!isGoogleDriveFileUrl(row.file_url)) {
            console.warn(`[getNextResume] Skipping resume ${row.id}: not a valid Google Drive URL`);
            return false;
        }
        return true;
    });

    let claimedId;
    try {
        claimedId = await claimNextReview({
            kind: "resume",
            cycleId: screening.cycle.id,
            graderId: gradedBy,
            candidateIds: servable.map((row) => row.id),
        });
    } catch (claimError) {
        return respondWithServerError(res, claimError, 'getNextResume claim');
    }

    const claimed = servable.find((row) => row.id === claimedId);
    if (claimed) {
        const fileID = extractDriveFileID(claimed.file_url);
        return res.json({
            ...claimed,
            file_url: toDownloadURL(fileID),
        });
    }

    return res.status(404).json({ error: "No resumes available" });
};

function formatResumeForScreener(row) {
    if (!isGoogleDriveFileUrl(row.file_url)) {
        return { error: "Resume file must be a Google Drive link", status: 400 };
    }

    const fileID = extractDriveFileID(row.file_url);
    return {
        data: {
            ...row,
            file_url: toDownloadURL(fileID),
        },
    };
}

async function fetchResumeRowById(resumeId) {
    return supabase
        .from('resumes')
        .select(`*,
            candidates ( year, major, cycle_id )
        `)
        .eq('id', resumeId)
        .maybeSingle();
}

async function userHasReviewForResume(gradedBy, resumeId, cycleId) {
    const { data, error } = await supabase
        .from('resume_reviews')
        .select('id')
        .eq('resume_id', resumeId)
        .eq('graded_by', gradedBy)
        .eq('cycle_id', cycleId)
        .maybeSingle();

    if (error) throw error;
    return Boolean(data);
}

async function assertResumeAccessibleForScreening(resumeRow, { gradedBy, cycleId }) {
    const candidate = firstRel(resumeRow.candidates);
    const exclusion = screeningAccessError(candidate);
    if (exclusion) return exclusion;
    const resumeCycleId = resumeRow.cycle_id || candidate?.cycle_id || null;

    if (resumeCycleId) {
        if (resumeCycleId !== cycleId) {
            return { error: "Resume is not part of the active cycle", status: 400 };
        }
        return null;
    }

    if (!gradedBy) {
        return { error: "Resume not found", status: 404 };
    }

    const hasReview = await userHasReviewForResume(gradedBy, resumeRow.id, cycleId);
    if (!hasReview) {
        return { error: "Resume not found", status: 404 };
    }

    return null;
}

exports.getResumeById = async (req, res) => {
    const gradedBy = req.user?.user_id;
    const screening = await requireOpenResumeRound();
    if (screening.error) {
        return res.status(screening.status).json({ error: screening.error });
    }

    const resumeId = String(req.params.id || "").trim();
    if (!resumeId) {
        return res.status(400).json({ error: "Resume id is required" });
    }

    const { data: row, error } = await fetchResumeRowById(resumeId);
    if (error) return respondWithServerError(res, error, 'getResumeById');
    if (!row) {
        return res.status(404).json({ error: "Resume not found" });
    }

    try {
        const accessError = await assertResumeAccessibleForScreening(row, {
            gradedBy,
            cycleId: screening.cycle.id,
        });
        if (accessError) {
            return res.status(accessError.status).json({ error: accessError.error });
        }
    } catch (accessErr) {
        return respondWithServerError(res, accessErr, 'getResumeById access');
    }

    const formatted = formatResumeForScreener(row);
    if (formatted.error) {
        return res.status(formatted.status).json({ error: formatted.error });
    }

    return res.json(formatted.data);
};

/** Load the resume PDF for one of the authenticated user's past reviews. */
exports.getReviewResume = async (req, res) => {
    const gradedBy = req.user?.user_id;
    if (!gradedBy) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const screening = await requireOpenResumeRound();
    if (screening.error) {
        return res.status(screening.status).json({ error: screening.error });
    }

    const reviewId = String(req.params.reviewId || "").trim();
    if (!reviewId) {
        return res.status(400).json({ error: "reviewId is required" });
    }

    const { data: review, error: reviewError } = await supabase
        .from('resume_reviews')
        .select('id, resume_id, cycle_id')
        .eq('id', reviewId)
        .eq('graded_by', gradedBy)
        .maybeSingle();

    if (reviewError) return respondWithServerError(res, reviewError, 'getReviewResume review');
    if (!review) {
        return res.status(404).json({ error: "Review not found" });
    }

    if (review.cycle_id && review.cycle_id !== screening.cycle.id) {
        return res.status(400).json({ error: "Review is not part of the active cycle" });
    }

    const { data: row, error } = await fetchResumeRowById(review.resume_id);
    if (error) return respondWithServerError(res, error, 'getReviewResume resume');
    if (!row) {
        return res.status(404).json({ error: "Resume not found" });
    }

    const formatted = formatResumeForScreener(row);
    if (formatted.error) {
        return res.status(formatted.status).json({ error: formatted.error });
    }

    return res.json({
        ...formatted.data,
        reviewId: review.id,
    });
};

// Saves review 
exports.saveReview = async (req, res) => {
    const { resume_id, scores, notes, decision } = req.body;
    const gradedBy = req.user?.user_id;
    const normalizedDecision = VALID_REVIEW_DECISIONS.has(decision) ? decision : "pass";

    if (!gradedBy) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    if (!resume_id) {
        return res.status(400).json({ error: "resume_id is required" });
    }

    const screening = await requireResumeGradingPhase();
    if (screening.error) {
        return res.status(screening.status).json({ error: screening.error });
    }

    const { data: resumeRow, error: resumeError } = await supabase
        .from('resumes')
        .select(`
            id,
            candidate_id,
            cycle_id,
            candidates ( year )
        `)
        .eq('id', resume_id)
        .maybeSingle();

    if (resumeError) return respondWithServerError(res, resumeError, 'saveReview resume');
    if (!resumeRow) return res.status(404).json({ error: "Resume not found" });
    if (resumeRow.cycle_id && resumeRow.cycle_id !== screening.cycle.id) {
        return res.status(400).json({ error: "Resume is not part of the active cycle" });
    }

    const candidate = firstRel(resumeRow.candidates);
    const exclusion = screeningAccessError(candidate);
    if (exclusion) return res.status(exclusion.status).json({ error: exclusion.error });
    const rubricForYear = getRubricForYear(screening.round.rubric_config, candidate?.year);
    const { scores: normalizedScores, error: scoreError } = normalizeScreeningScoresInput(scores, rubricForYear);
    if (scoreError) {
        return res.status(400).json({ error: scoreError });
    }

    const rubricSnapshot = buildRubricSnapshot(screening.round.rubric_config, candidate?.year);
    const normalizedScore = computeNormalizedScore(normalizedScores, rubricSnapshot);

    if (normalizedDecision === "flag" && !resumeRow.candidate_id) {
        return res.status(400).json({ error: "Flagged resume is not linked to a candidate" });
    }

    const { data: existingReview, error: existingError } = await supabase
        .from('resume_reviews')
        .select('id')
        .eq('resume_id', resume_id)
        .eq('graded_by', gradedBy)
        .eq('cycle_id', screening.cycle.id)
        .maybeSingle();

    if (existingError) return respondWithServerError(res, existingError, 'saveReview existing');
    if (existingReview) {
        const { error: updateError } = await supabase
            .from('resume_reviews')
            .update({
                scores: normalizedScores,
                notes: notes ?? "",
                decision: normalizedDecision,
                rubric_snapshot: rubricSnapshot,
                normalized_score: normalizedScore,
            })
            .eq('id', existingReview.id)
            .eq('graded_by', gradedBy);

        if (updateError) return respondWithServerError(res, updateError, 'saveReview update');

        if (normalizedDecision === "flag" && resumeRow.candidate_id) {
            const { error: flagError } = await supabase
                .from('candidate_flags')
                .insert({
                    candidate_id: resumeRow.candidate_id,
                    resume_id: resume_id,
                    flagged_by: gradedBy,
                    reason: notes || "Flagged during resume review",
                });

            if (flagError && flagError.code !== '23505') {
                return respondWithServerError(res, flagError, 'saveReview flag insert');
            }
        }

        return res.json({ success: true, updated: true, reviewId: existingReview.id });
    }

    const { error: saveError } = await supabase.rpc('save_resume_review', {
        resume_id_input: resume_id,
        scores_input: normalizedScores,
        notes_input: notes,
        decision_input: normalizedDecision,
        graded_by_input: gradedBy,
        cycle_id_input: screening.cycle.id,
        round_id_input: screening.round.id,
        rubric_snapshot_input: rubricSnapshot,
        normalized_score_input: normalizedScore,
        candidate_id_input: normalizedDecision === "flag" ? resumeRow.candidate_id : null,
    });

    if (saveError) {
        if (saveError.code === '23505' || /already reviewed/i.test(saveError.message || '')) {
            return res.status(409).json({ error: "You have already reviewed this resume" });
        }
        return respondWithServerError(res, saveError, 'saveReview rpc');
    }

    await releaseReviewClaim({ kind: "resume", cycleId: screening.cycle.id, graderId: gradedBy, resumeId: resume_id });
    return res.json({ success: true });
};

/** Reviews submitted by the authenticated screener (JWT → req.user.user_id / graded_by). */
exports.listMyReviews = async (req, res) => {
    const gradedBy = req.user?.user_id;
    if (!gradedBy) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const activeCycle = await getActiveCycleRow();
    if (!activeCycle) {
        return res.json({
            reviews: [],
            count: 0,
            expectedReviews: req.user.role === 'member' ? resolveCycleGradingGoals(null).resumeGraderGoal : 0,
        });
    }
    const activeCycleId = activeCycle.id;
    const resumeGraderGoal = resolveCycleGradingGoals(activeCycle).resumeGraderGoal;

    const resumeRound = await getResumeScreenRoundForCycle(activeCycleId);
    const rubricConfig = resumeRound?.rubric_config || null;

    let reviewQuery = supabase
        .from("resume_reviews")
        .select(`
            id,
            resume_id,
            scores,
            notes,
            decision,
            submitted_at,
            rubric_snapshot,
            normalized_score,
            resumes (
                id,
                name,
                candidates ( year, major, gpa, name )
            )
        `)
        .eq("graded_by", gradedBy)
        .eq("cycle_id", activeCycleId)
        .order("submitted_at", { ascending: false });

    const { data, error } = await reviewQuery;

    if (error) return respondWithServerError(res, error, 'listMyReviews');

    const reviews = (data || []).map((row) => mapMyReviewRow(row, rubricConfig));

    return res.json({
        reviews,
        count: reviews.length,
        expectedReviews: req.user.role === 'member' ? resumeGraderGoal : 0,
    });
};

/** Update one of the authenticated user's reviews (scores, notes, decision). */
exports.patchMyReview = async (req, res) => {
    const gradedBy = req.user?.user_id;
    const reviewId = String(req.params.reviewId || "").trim();
    if (!gradedBy) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!reviewId) {
        return res.status(400).json({ error: "reviewId is required" });
    }

    const { scores, notes, decision } = req.body;

    const rawDecision = VALID_REVIEW_DECISIONS.has(decision) ? decision : "pass";
    const normalizedDecision = rawDecision === "flag" ? "flag" : "pass";

    const { data: existing, error: fetchError } = await supabase
        .from("resume_reviews")
        .select(`
            id,
            resume_id,
            decision,
            graded_by,
            rubric_snapshot,
            cycle_id,
            resumes (
                candidates ( year )
            )
        `)
        .eq("id", reviewId)
        .eq("graded_by", gradedBy)
        .maybeSingle();

    if (fetchError) return respondWithServerError(res, fetchError, 'patchMyReview fetch');
    if (!existing) {
        return res.status(404).json({ error: "Review not found" });
    }

    const screening = await requireResumeGradingPhase();
    if (screening.error) {
        return res.status(screening.status).json({ error: screening.error });
    }

    const snapshot = existing.rubric_snapshot;
    const candidate = firstRel(firstRel(existing.resumes)?.candidates);
    if (existing.cycle_id === screening.cycle.id) {
        const exclusion = screeningAccessError(candidate);
        if (exclusion) return res.status(exclusion.status).json({ error: exclusion.error });
    }
    const cycleRubricConfig = screening.round.rubric_config;
    const rubricForYear = snapshot
        ? {
            metrics: snapshot.metrics || [],
            maxPerCategory: snapshot.maxPerCategory || 4,
        }
        : getRubricForYear(cycleRubricConfig, candidate?.year);

    const { scores: normalizedScores, error: normErr } = normalizeScreeningScoresInput(scores, rubricForYear);
    if (normErr) {
        return res.status(400).json({ error: normErr });
    }

    const rubricSnapshot = snapshot || buildRubricSnapshot(cycleRubricConfig, candidate?.year);
    const normalizedScore = computeNormalizedScore(normalizedScores, rubricSnapshot);

    let flaggedResume = null;
    if (normalizedDecision === "flag" && existing.decision !== "flag") {
        const { data: resumeRow, error: resumeErr } = await supabase
            .from("resumes")
            .select("id, candidate_id")
            .eq("id", existing.resume_id)
            .maybeSingle();

        if (resumeErr) return respondWithServerError(res, resumeErr, 'patchMyReview resume');
        if (!resumeRow?.candidate_id) {
            return res.status(400).json({ error: "Flagged resume is not linked to a candidate" });
        }
        flaggedResume = resumeRow;
    }

    const { error: updateError } = await supabase
        .from("resume_reviews")
        .update({
            scores: normalizedScores,
            notes: notes ?? "",
            decision: normalizedDecision,
            rubric_snapshot: rubricSnapshot,
            normalized_score: normalizedScore,
        })
        .eq("id", reviewId)
        .eq("graded_by", gradedBy);

    if (updateError) return respondWithServerError(res, updateError, 'patchMyReview update');

    if (flaggedResume) {
        const { error: flagError } = await supabase
            .from("candidate_flags")
            .insert({
                candidate_id: flaggedResume.candidate_id,
                resume_id: flaggedResume.id,
                flagged_by: gradedBy,
                reason: notes || "Flagged during resume review",
            });

        if (flagError) {
            if (flagError.code !== "23505") {
                return respondWithServerError(res, flagError, 'patchMyReview flag insert');
            }
        }
    }

    const { data: row, error: readError } = await supabase
        .from("resume_reviews")
        .select(`
            id,
            resume_id,
            scores,
            notes,
            decision,
            submitted_at,
            rubric_snapshot,
            cycle_id,
            normalized_score,
            resumes (
                id,
                name,
                candidates ( year, major, gpa, name )
            )
        `)
        .eq("id", reviewId)
        .maybeSingle();

    if (readError) return respondWithServerError(res, readError, 'patchMyReview read');
    if (!row) return respondWithServerError(res, new Error('updated review missing'), 'patchMyReview read');

    return res.json({ review: mapMyReviewRow(row, cycleRubricConfig) });
};

function mapMyFrqReviewRow(row) {
    const resume = firstRel(row.resumes);
    const cand = firstRel(resume?.candidates);
    const score = Number(row.score);
    return {
        reviewId: row.id,
        id: row.resume_id,
        resumeId: row.resume_id,
        resumeName: resume?.name ?? null,
        candidateName: cand?.name ?? null,
        year: cand?.year ?? null,
        major: cand?.major ?? null,
        gpa: cand?.gpa ?? null,
        score,
        total: score,
        maxScore: FRQ_MAX_SCORE,
        normalizedScore: Number(((score / FRQ_MAX_SCORE) * 100).toFixed(2)),
        notes: row.notes || "",
        submittedAt: row.submitted_at,
    };
}

function formatFrqCandidateRow(row) {
    const candidate = firstRel(row.candidates);
    return {
        id: row.id,
        name: row.name,
        candidates: candidate ? {
            year: candidate.year,
            name: candidate.name,
            major: candidate.major,
            applicationResponses: Array.isArray(candidate.application_responses) ? candidate.application_responses : [],
        } : null,
    };
}

async function fetchFrqReviewRowById(reviewId, gradedBy) {
    const selectRow = candidateFields => supabase
        .from("frq_reviews").select(`
            id,
            resume_id,
            score,
            notes,
            submitted_at,
            resumes (
                id,
                name,
                candidates (
                    ${candidateFields}
                )
            )
        `)
        .eq("id", reviewId)
        .eq("graded_by", gradedBy)
        .maybeSingle();
    const legacyFields = 'year, major, gpa, name';
    let result = await selectRow(`${legacyFields}, application_responses`);
    if (result.error && isMissingSchemaError(result.error)) result = await selectRow(legacyFields);
    return result;
}

/** Next candidate for admin FRQ grading (skips already-graded-by-me). */
exports.getNextFrq = async (req, res) => {
    if (!canGradeFrq(req.user?.role)) {
        return res.status(403).json({ error: "Admin access required" });
    }

    const gradedBy = req.user?.user_id;
    const screening = await requireOpenResumeRound();
    if (screening.error) {
        return res.status(screening.status).json({ error: screening.error });
    }

    let reviewedResumeIds = [];
    if (gradedBy) {
        const { data: reviewedRows, error: reviewedError } = await supabase
            .from("frq_reviews")
            .select("resume_id")
            .eq("graded_by", gradedBy)
            .eq("cycle_id", screening.cycle.id);

        if (reviewedError) return respondWithServerError(res, reviewedError, "getNextFrq reviewed");
        reviewedResumeIds = [...new Set((reviewedRows || []).map((row) => row.resume_id).filter(Boolean))];
    }
    const reviewedResumeIdSet = new Set(reviewedResumeIds);

    const selectCandidates = candidateFields => {
        let query = supabase.from("resumes").select(`
            id,
            name,
            frq_review_count,
            candidates!inner (
                ${candidateFields}
            )
        `)
        .eq("cycle_id", screening.cycle.id)
        .or(ELIGIBLE_YEAR_FILTER, { referencedTable: "candidates" })
        .order("frq_review_count", { ascending: true })
        .order("created_at", { ascending: true });

        if (reviewedResumeIds.length) {
            query = query.not("id", "in", `(${reviewedResumeIds.join(",")})`);
        }
        return query.limit(100);
    };

    const legacyFields = 'year, name, major';
    let { data: resumeCandidates, error } = await selectCandidates(`${legacyFields}, application_responses`);
    if (error && isMissingSchemaError(error)) {
        ({ data: resumeCandidates, error } = await selectCandidates(legacyFields));
    }
    if (error) return respondWithServerError(res, error, "getNextFrq");

    const servable = (resumeCandidates || []).filter((row) => !reviewedResumeIdSet.has(row.id));

    let claimedId;
    try {
        claimedId = await claimNextReview({
            kind: "frq",
            cycleId: screening.cycle.id,
            graderId: gradedBy,
            candidateIds: servable.map((row) => row.id),
        });
    } catch (claimError) {
        return respondWithServerError(res, claimError, "getNextFrq claim");
    }

    const claimed = servable.find((row) => row.id === claimedId);
    if (claimed) return res.json(formatFrqCandidateRow(claimed));

    return res.status(404).json({ error: "No candidates available for FRQ grading" });
};

/** FRQ grades submitted by the authenticated admin. */
exports.listMyFrqReviews = async (req, res) => {
    if (!canGradeFrq(req.user?.role)) {
        return res.status(403).json({ error: "Admin access required" });
    }

    const gradedBy = req.user?.user_id;
    if (!gradedBy) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const activeCycleId = await getActiveCycleId();
    if (!activeCycleId) {
        return res.json({ reviews: [], count: 0 });
    }

    const reviewQuery = supabase
        .from("frq_reviews")
        .select(`
            id,
            resume_id,
            score,
            notes,
            submitted_at,
            resumes (
                id,
                name,
                candidates ( year, major, gpa, name )
            )
        `)
        .eq("graded_by", gradedBy)
        .eq("cycle_id", activeCycleId)
        .order("submitted_at", { ascending: false });

    const { data, error } = await reviewQuery;
    if (error) return respondWithServerError(res, error, "listMyFrqReviews");

    const reviews = (data || []).map((row) => mapMyFrqReviewRow(row));
    return res.json({ reviews, count: reviews.length });
};

/** Load candidate FRQ content for one of the admin's past FRQ grades. */
exports.getFrqReviewCandidate = async (req, res) => {
    if (!canGradeFrq(req.user?.role)) {
        return res.status(403).json({ error: "Admin access required" });
    }

    const gradedBy = req.user?.user_id;
    if (!gradedBy) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const reviewId = String(req.params.reviewId || "").trim();
    if (!reviewId) {
        return res.status(400).json({ error: "reviewId is required" });
    }

    const screening = await requireOpenResumeRound();
    if (screening.error) {
        return res.status(screening.status).json({ error: screening.error });
    }

    const { data: review, error: reviewError } = await fetchFrqReviewRowById(reviewId, gradedBy);
    if (reviewError) return respondWithServerError(res, reviewError, "getFrqReviewCandidate review");
    if (!review) {
        return res.status(404).json({ error: "FRQ review not found" });
    }

    const resume = firstRel(review.resumes);
    if (!resume) {
        return res.status(404).json({ error: "Candidate not found" });
    }

    return res.json({
        ...formatFrqCandidateRow(resume),
        reviewId: review.id,
        frqScore: Number(review.score),
        notes: review.notes || "",
    });
};

exports.saveFrqReview = async (req, res) => {
    if (!canGradeFrq(req.user?.role)) {
        return res.status(403).json({ error: "Admin access required" });
    }

    const { resume_id, score, notes } = req.body;
    const gradedBy = req.user?.user_id;

    if (!gradedBy) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!resume_id) {
        return res.status(400).json({ error: "resume_id is required" });
    }

    const numericScore = Number(score);
    if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > FRQ_MAX_SCORE) {
        return res.status(400).json({ error: `score must be a number between 0 and ${FRQ_MAX_SCORE}` });
    }
    const screening = await requireResumeGradingPhase();
    if (screening.error) {
        return res.status(screening.status).json({ error: screening.error });
    }

    const { data: resumeRow, error: resumeError } = await supabase
        .from("resumes")
        .select("id, cycle_id, candidates(year)")
        .eq("id", resume_id)
        .maybeSingle();

    if (resumeError) return respondWithServerError(res, resumeError, "saveFrqReview resume");
    if (!resumeRow) return res.status(404).json({ error: "Resume not found" });
    if (resumeRow.cycle_id && resumeRow.cycle_id !== screening.cycle.id) {
        return res.status(400).json({ error: "Resume is not part of the active cycle" });
    }

    const exclusion = screeningAccessError(firstRel(resumeRow.candidates));
    if (exclusion) return res.status(exclusion.status).json({ error: exclusion.error });

    const normalizedNotes = normalizeRequiredFrqNotes(notes);
    if (!normalizedNotes) {
        return res.status(400).json({ error: "A 1–2 sentence deliberation comment is required" });
    }

    const { data: existingReview, error: existingError } = await supabase
        .from("frq_reviews")
        .select("id")
        .eq("resume_id", resume_id)
        .eq("graded_by", gradedBy)
        .eq("cycle_id", screening.cycle.id)
        .maybeSingle();

    if (existingError) return respondWithServerError(res, existingError, "saveFrqReview existing");
    if (existingReview) {
        const { error: updateError } = await supabase
            .from("frq_reviews")
            .update({
                score: Math.round(numericScore),
                notes: normalizedNotes,
            })
            .eq("id", existingReview.id)
            .eq("graded_by", gradedBy);

        if (updateError) return respondWithServerError(res, updateError, "saveFrqReview update");
        return res.json({ success: true, updated: true, reviewId: existingReview.id });
    }

    const { error: saveError } = await supabase.rpc("save_frq_review", {
        resume_id_input: resume_id,
        score_input: Math.round(numericScore),
        notes_input: normalizedNotes,
        graded_by_input: gradedBy,
        cycle_id_input: screening.cycle.id,
        round_id_input: screening.round.id,
    });

    if (saveError) {
        if (saveError.code === "23505" || /already graded/i.test(saveError.message || "")) {
            return res.status(409).json({ error: "You have already graded this candidate's application responses" });
        }
        return respondWithServerError(res, saveError, "saveFrqReview rpc");
    }

    await releaseReviewClaim({ kind: "frq", cycleId: screening.cycle.id, graderId: gradedBy, resumeId: resume_id });
    return res.json({ success: true });
};

exports.patchMyFrqReview = async (req, res) => {
    if (!canGradeFrq(req.user?.role)) {
        return res.status(403).json({ error: "Admin access required" });
    }

    const gradedBy = req.user?.user_id;
    const reviewId = String(req.params.reviewId || "").trim();
    if (!gradedBy) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!reviewId) {
        return res.status(400).json({ error: "reviewId is required" });
    }

    const { score, notes } = req.body;
    const numericScore = Number(score);
    if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > FRQ_MAX_SCORE) {
        return res.status(400).json({ error: `score must be a number between 0 and ${FRQ_MAX_SCORE}` });
    }
    const { data: existing, error: fetchError } = await supabase
        .from("frq_reviews")
        .select("id, cycle_id, resumes(candidates(year))")
        .eq("id", reviewId)
        .eq("graded_by", gradedBy)
        .maybeSingle();

    if (fetchError) return respondWithServerError(res, fetchError, "patchMyFrqReview fetch");
    if (!existing) {
        return res.status(404).json({ error: "FRQ review not found" });
    }

    if (existing.cycle_id === await getActiveCycleId()) {
        const exclusion = screeningAccessError(firstRel(firstRel(existing.resumes)?.candidates));
        if (exclusion) return res.status(exclusion.status).json({ error: exclusion.error });
    }

    const normalizedNotes = normalizeRequiredFrqNotes(notes);
    if (!normalizedNotes) {
        return res.status(400).json({ error: "A 1–2 sentence deliberation comment is required" });
    }

    const { error: updateError } = await supabase
        .from("frq_reviews")
        .update({
            score: Math.round(numericScore),
            notes: normalizedNotes,
        })
        .eq("id", reviewId)
        .eq("graded_by", gradedBy);

    if (updateError) return respondWithServerError(res, updateError, "patchMyFrqReview update");

    const { data: row, error: readError } = await fetchFrqReviewRowById(reviewId, gradedBy);
    if (readError) return respondWithServerError(res, readError, "patchMyFrqReview read");
    if (!row) return respondWithServerError(res, new Error("updated FRQ review missing"), "patchMyFrqReview read");

    return res.json({ review: mapMyFrqReviewRow(row) });
};

exports.createCandidateFlag = async (req, res) => {
    const { candidate_id, resume_id, reason } = req.body;
    const trimmedReason = String(reason || "").trim();

    if (trimmedReason.length < MIN_SIGNAL_NOTE_LENGTH) {
        return res.status(400).json({ error: `Reason must be at least ${MIN_SIGNAL_NOTE_LENGTH} characters` });
    }

    try {
        const activeCycleId = await getActiveCycleId();
        if (!activeCycleId) {
            return res.status(503).json({ error: "No active recruiting cycle" });
        }

        const resolved = await resolveCandidateIdForSignal({ candidate_id, resume_id });
        if (resolved.error) {
            return res.status(resolved.status).json({ error: resolved.error });
        }

        const { candidateId, candidate } = resolved;
        if (candidate.cycle_id !== activeCycleId) {
            return res.status(400).json({ error: "Candidate is not in the active cycle" });
        }

        const userId = req.user?.user_id ?? null;
        if (userId != null) {
            const { data: existing, error: existingError } = await supabase
                .from('candidate_flags')
                .select('id')
                .eq('candidate_id', candidateId)
                .eq('flagged_by', userId)
                .eq('status', 'open')
                .maybeSingle();

            if (existingError) return respondWithServerError(res, existingError, 'createCandidateFlag existing');
            if (existing) {
                return res.status(409).json({ error: "You have already flagged this candidate" });
            }
        }

        const { data, error } = await supabase
            .from('candidate_flags')
            .insert({
                candidate_id: candidateId,
                resume_id: resume_id || null,
                flagged_by: userId,
                reason: trimmedReason,
            })
            .select('id')
            .single();

        if (error) return respondWithServerError(res, error, 'createCandidateFlag insert');

        const lookups = await loadCandidateSignalLookups([candidateId], userId);

        return res.status(201).json({
            success: true,
            flag: data,
            flagCount: lookups.flagCounts[candidateId] || 0,
            flaggedByMe: true,
        });
    } catch (err) {
        return respondWithServerError(res, err, 'createCandidateFlag');
    }
};

exports.createCandidateReferral = async (req, res) => {
    const { candidate_id, resume_id, note } = req.body;
    const trimmedNote = String(note || "").trim();

    if (trimmedNote.length < MIN_SIGNAL_NOTE_LENGTH) {
        return res.status(400).json({ error: `Note must be at least ${MIN_SIGNAL_NOTE_LENGTH} characters` });
    }

    try {
        const activeCycleId = await getActiveCycleId();
        if (!activeCycleId) {
            return res.status(503).json({ error: "No active recruiting cycle" });
        }

        const resolved = await resolveCandidateIdForSignal({ candidate_id, resume_id });
        if (resolved.error) {
            return res.status(resolved.status).json({ error: resolved.error });
        }

        const { candidateId, candidate } = resolved;
        if (candidate.cycle_id !== activeCycleId) {
            return res.status(400).json({ error: "Candidate is not in the active cycle" });
        }

        const userId = req.user?.user_id ?? null;
        const { data, error } = await supabase
            .from('candidate_referrals')
            .insert({
                candidate_id: candidateId,
                resume_id: resume_id || null,
                referred_by: userId,
                note: trimmedNote,
            })
            .select('id')
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({ error: "You have already referred this candidate" });
            }
            return respondWithServerError(res, error, 'createCandidateReferral insert');
        }

        const lookups = await loadCandidateSignalLookups([candidateId], userId);

        return res.status(201).json({
            success: true,
            referral: data,
            referralCount: lookups.referralCounts[candidateId] || 0,
            referredByMe: true,
        });
    } catch (err) {
        return respondWithServerError(res, err, 'createCandidateReferral');
    }
};

exports.getCandidateFlags = async (req, res) => {
    try {
        const activeCycleId = await getActiveCycleId();
        if (!activeCycleId) {
            return res.json({
                stats: { openFlags: 0, candidates: 0 },
                flags: [],
            });
        }

        const { data, error } = await supabase
            .from('candidate_flags')
            .select(`
                id,
                candidate_id,
                resume_id,
                flagged_by,
                reason,
                status,
                created_at,
                resolved_at,
                candidates!inner (
                    id,
                    name,
                    email,
                    phone_number,
                    major,
                    gpa,
                    year,
                    pronouns,
                    linkedin,
                    gm,
                    newbie_training,
                    extenuating_circumstances,
                    cycle_id
                ),
                resumes (
                    id,
                    name,
                    file_url
                ),
                users (
                    user_id,
                    email,
                    first_name,
                    last_name
                )
            `)
            .eq('status', 'open')
            .eq('candidates.cycle_id', activeCycleId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const flags = (data || []).map(flag => ({
            id: flag.id,
            candidateId: flag.candidate_id,
            resumeId: flag.resume_id,
            reason: flag.reason || '',
            status: flag.status,
            createdAt: flag.created_at,
            resolvedAt: flag.resolved_at,
            candidate: flag.candidates ? {
                id: flag.candidates.id,
                name: flag.candidates.name || 'Unknown',
                email: flag.candidates.email || '',
                phoneNumber: flag.candidates.phone_number || '',
                major: flag.candidates.major || 'Undeclared',
                gpa: flag.candidates.gpa || '',
                year: flag.candidates.year || '',
                pronouns: flag.candidates.pronouns || '',
                linkedin: flag.candidates.linkedin || '',
                gm: flag.candidates.gm || '',
                newbieTraining: flag.candidates.newbie_training || '',
                extenuatingCircumstances: flag.candidates.extenuating_circumstances || '',
            } : null,
            resume: flag.resumes ? {
                id: flag.resumes.id,
                name: flag.resumes.name || '',
                fileUrl: flag.resumes.file_url || '',
            } : null,
            flaggedBy: flag.users ? {
                id: flag.users.user_id,
                name: getUserName(flag.users),
                email: flag.users.email || '',
            } : null,
        }));

        return res.json({
            stats: {
                openFlags: flags.length,
                candidates: new Set(flags.map(flag => flag.candidateId).filter(Boolean)).size,
            },
            flags,
        });
    } catch (err) {
        return respondWithServerError(res, err, 'getCandidateFlags');
    }
};

exports.getCandidateReferrals = async (req, res) => {
    try {
        const activeCycleId = await getActiveCycleId();
        if (!activeCycleId) {
            return res.json({
                stats: { referrals: 0, candidates: 0 },
                referrals: [],
            });
        }

        const referralSelect = (includeResolution) => `
                id,
                candidate_id,
                resume_id,
                referred_by,
                note,
                created_at,
                ${includeResolution ? 'status, resolved_at,' : ''}
                candidates!inner (
                    id,
                    name,
                    email,
                    phone_number,
                    major,
                    gpa,
                    year,
                    pronouns,
                    linkedin,
                    gm,
                    newbie_training,
                    extenuating_circumstances,
                    cycle_id
                ),
                resumes (
                    id,
                    name,
                    file_url
                ),
                users (
                    user_id,
                    email,
                    first_name,
                    last_name
                )
            `;

        let resolutionAvailable = true;
        let referralResult = await supabase
            .from('candidate_referrals')
            .select(referralSelect(true))
            .eq('status', 'open')
            .eq('candidates.cycle_id', activeCycleId)
            .order('created_at', { ascending: false });

        // Existing local databases may not have run migration #21 yet. Keep the
        // queue readable and mark its resolve controls unavailable until they do.
        if (referralResult.error?.code === '42703') {
            resolutionAvailable = false;
            referralResult = await supabase
                .from('candidate_referrals')
                .select(referralSelect(false))
                .eq('candidates.cycle_id', activeCycleId)
                .order('created_at', { ascending: false });
        }

        const { data, error } = referralResult;

        if (error) throw error;

        const referrals = (data || []).map(referral => ({
            id: referral.id,
            candidateId: referral.candidate_id,
            resumeId: referral.resume_id,
            note: referral.note || '',
            status: referral.status || 'open',
            createdAt: referral.created_at,
            resolvedAt: referral.resolved_at || null,
            resolutionAvailable,
            candidate: referral.candidates ? {
                id: referral.candidates.id,
                name: referral.candidates.name || 'Unknown',
                email: referral.candidates.email || '',
                phoneNumber: referral.candidates.phone_number || '',
                major: referral.candidates.major || 'Undeclared',
                gpa: referral.candidates.gpa || '',
                year: referral.candidates.year || '',
                pronouns: referral.candidates.pronouns || '',
                linkedin: referral.candidates.linkedin || '',
                gm: referral.candidates.gm || '',
                newbieTraining: referral.candidates.newbie_training || '',
                extenuatingCircumstances: referral.candidates.extenuating_circumstances || '',
            } : null,
            resume: referral.resumes ? {
                id: referral.resumes.id,
                name: referral.resumes.name || '',
                fileUrl: referral.resumes.file_url || '',
            } : null,
            referredBy: referral.users ? {
                id: referral.users.user_id,
                name: getUserName(referral.users),
                email: referral.users.email || '',
            } : null,
        }));

        return res.json({
            stats: {
                referrals: referrals.length,
                candidates: new Set(referrals.map(referral => referral.candidateId).filter(Boolean)).size,
            },
            referrals,
        });
    } catch (err) {
        return respondWithServerError(res, err, 'getCandidateReferrals');
    }
};

exports.resolveCandidateFlag = async (req, res) => {
    const { data, error } = await supabase
        .from('candidate_flags')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .select('id, status, resolved_at')
        .maybeSingle();

    if (error) return respondWithServerError(res, error, 'resolveCandidateFlag');
    if (!data) return res.status(404).json({ error: "Flag not found" });

    return res.json({ success: true, flag: data });
};

exports.resolveCandidateReferral = async (req, res) => {
    const { data, error } = await supabase
        .from('candidate_referrals')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .select('id, status, resolved_at')
        .maybeSingle();

    if (error) return respondWithServerError(res, error, 'resolveCandidateReferral');
    if (!data) return res.status(404).json({ error: "Referral not found" });

    return res.json({ success: true, referral: data });
};

// Gets file link from resume 
exports.getResumeFile = async (req, res) => {
    try {
        const activeCycleId = await getActiveCycleId();
        if (!activeCycleId) {
            return res.status(503).json({ error: "No active recruiting cycle" });
        }

        const { data, error } = await supabase
            .from('resumes')
            .select('file_url, candidates ( cycle_id )')
            .eq('id', req.params.id)
            .maybeSingle();

        if (error) return respondWithServerError(res, error, 'getResumeFile');
        if (!data) {
            return res.status(404).json({ error: "Resume not found" });
        }

        const candidate = firstRel(data.candidates);
        if (!candidate || candidate.cycle_id !== activeCycleId) {
            return res.status(400).json({ error: "Candidate is not in the active cycle" });
        }

        if (!isGoogleDriveFileUrl(data.file_url)) {
            return res.status(400).json({ error: "Resume file must be a Google Drive link" });
        }

        const fileID = extractDriveFileID(data.file_url);
        const accessable_file_url = toDownloadURL(fileID);

        return res.json({
            file_url: accessable_file_url,
        });
    } catch (err) {
        return respondWithServerError(res, err, 'getResumeFile');
    }
};

async function resolveCandidateIdForDecision({ candidateId, resumeId, cycleId }) {
    const trimmedResumeId = String(resumeId || "").trim();
    const trimmedCandidateId = String(candidateId || "").trim();

    if (trimmedResumeId) {
        const { data: resumeRow, error: resumeError } = await supabase
            .from("resumes")
            .select(`
                id,
                name,
                candidate_id,
                file_url,
                cycle_id,
                candidates (
                    id,
                    name,
                    email,
                    resume_file_url
                )
            `)
            .eq("id", trimmedResumeId)
            .maybeSingle();

        if (resumeError) throw resumeError;
        if (!resumeRow) return { error: "Resume not found", status: 404 };
        if (resumeRow.cycle_id !== cycleId) {
            return { error: "Resume is not in the active cycle", status: 400 };
        }

        if (trimmedCandidateId && resumeRow.candidate_id && resumeRow.candidate_id !== trimmedCandidateId) {
            return { error: "Resume does not match the provided candidate", status: 400 };
        }

        const { data: cycleCandidates, error: cycleCandError } = await supabase
            .from("candidates")
            .select("id, name, email, resume_file_url, cycle_id")
            .eq("cycle_id", cycleId);

        if (cycleCandError) throw cycleCandError;

        const lookups = buildCandidateLinkLookups(cycleCandidates);
        const { candidate: linked, ambiguous } = resolveCandidateLink({
            resume: resumeRow,
            embeddedCandidate: firstRel(resumeRow.candidates),
            lookups,
        });

        if (ambiguous) {
            return { error: "Multiple candidates match this resume name — resolve the duplicate in the database", status: 409 };
        }
        if (!linked?.id) {
            return { error: "Could not link resume to a candidate record", status: 400 };
        }

        return {
            candidateId: linked.id,
            resumeId: resumeRow.id,
            backfillCandidateId: resumeRow.candidate_id ? null : linked.id,
        };
    }

    if (trimmedCandidateId) {
        const { data, error } = await supabase
            .from("candidates")
            .select("id, cycle_id, name")
            .eq("id", trimmedCandidateId)
            .maybeSingle();
        if (error) throw error;
        if (!data) return { error: "Candidate not found", status: 404 };
        if (data.cycle_id !== cycleId) {
            return { error: "Candidate is not in the active cycle", status: 400 };
        }

        const { data: resumeRow, error: resumeError } = await supabase
            .from("resumes")
            .select("id, candidate_id")
            .eq("cycle_id", cycleId)
            .eq("candidate_id", trimmedCandidateId)
            .maybeSingle();

        if (resumeError) throw resumeError;
        if (!resumeRow) {
            return { error: "Candidate has no resume in this cycle", status: 400 };
        }

        return { candidateId: data.id, resumeId: resumeRow.id };
    }

    return { error: "resume_id or candidate_id is required", status: 400 };
}

async function maybeBackfillResumeCandidateId(resumeId, candidateId) {
    if (!resumeId || !candidateId) return;
    await supabase
        .from("resumes")
        .update({ candidate_id: candidateId })
        .eq("id", resumeId)
        .is("candidate_id", null);
}

// Gets scoreboard data
exports.getScoreboard = async (req, res) => {
    try {
        const requestedRoundId = String(req.query?.roundId || "").trim();
        const requestedCycleId = String(req.query?.cycleId || "").trim();
        const siteActiveCycle = await getActiveCycleRow();
        let activeCycle = siteActiveCycle;
        if (requestedCycleId && requestedCycleId !== siteActiveCycle?.id) {
            const { data: requestedCycle, error: requestedCycleError } = await supabase
                .from("cycles")
                .select("*")
                .eq("id", requestedCycleId)
                .maybeSingle();
            if (requestedCycleError) throw requestedCycleError;
            if (!requestedCycle) return res.status(404).json({ error: "Cycle not found" });
            activeCycle = requestedCycle;
        }
        const activeCycleId = activeCycle?.id || null;
        const viewingHistoricalCycle = Boolean(activeCycleId && activeCycleId !== siteActiveCycle?.id);
        const cycleRounds = activeCycleId ? await getRoundsForCycle(activeCycleId) : [];
        const {
            resumeRound,
            deliberationRound: activeDeliberationRound,
            activeRound,
            nextRound: activeNextRound,
        } = resolveDeliberationRounds(cycleRounds);

        let deliberationRound = activeDeliberationRound;
        let viewingHistorical = viewingHistoricalCycle;

        if (requestedRoundId) {
            const requestedRound = cycleRounds.find((r) => r.id === requestedRoundId) || null;
            if (!requestedRound) {
                return res.status(404).json({ error: "Round not found in this cycle" });
            }
            deliberationRound = requestedRound;
            viewingHistorical = viewingHistoricalCycle || requestedRound.id !== activeRound?.id;
        }

        const nextRound = viewingHistorical
            ? (cycleRounds || [])
                .filter((r) => r.sort_order > deliberationRound.sort_order)
                .sort((a, b) => a.sort_order - b.sort_order)[0] || null
            : activeNextRound;

        if (!activeCycleId || !resumeRound || !deliberationRound) {
            return res.json({
                context: {
                    cycle: null,
                    round: null,
                    resumeRound: null,
                    nextRound: null,
                    allRounds: [],
                    viewingHistorical: false,
                    canDeliberate: false,
                    canCloseRound: false,
                    undecidedCount: 0,
                },
                metrics: [],
                maxPerCategory: 4,
                stats: { applicants: 0, reviewed: 0, advanced: 0, hold: 0, rejected: 0, pending: 0, avgScore: 0 },
                candidates: [],
            });
        }

        const decisionsFinalized = deliberationRound.status === "closed" || viewingHistorical;
        const decisionOptions = { provisional: !decisionsFinalized };
        const canDeliberate = !viewingHistorical && canRecordDecisions(getRoundPhase(deliberationRound));

        // These reads all share the same resolved cycle/round context but do not
        // depend on one another. Fetch them together so the scoreboard does not
        // pay one Supabase network round trip after another.
        const [
            resumeResult,
            cycleCandidateResult,
            roundDecisionResult,
            priorRoundDecisionRows,
            reviewResult,
            frqResult,
            interviewEvaluationResult,
            coffeeMemberAssignmentResult,
            attendedEventsByCandidate,
            deliberationVoteResult,
        ] = await Promise.all([
            supabase
                .from('resumes')
                .select(`
                    id,
                    name,
                    candidate_id,
                    file_url,
                    created_at,
                    candidates (
                        id,
                        email,
                        phone_number,
                        major,
                        gpa,
                        year,
                        pronouns,
                        linkedin,
                        gm,
                        newbie_training,
                        headshot
                    )
                `)
                .eq('cycle_id', activeCycleId)
                .order('created_at', { ascending: true }),
            supabase
                .from("candidates")
                .select(`
                    id,
                    name,
                    email,
                    phone_number,
                    major,
                    gpa,
                    year,
                    pronouns,
                    linkedin,
                    gm,
                    newbie_training,
                    headshot,
                    resume_file_url
                `)
                .eq("cycle_id", activeCycleId),
            supabase
                .from('round_decisions')
                .select('*')
                .eq('cycle_id', activeCycleId)
                .eq('round_id', deliberationRound.id),
            loadPriorRoundDecisionRows(activeCycleId, deliberationRound, cycleRounds),
            supabase
                .from('resume_reviews')
                .select(`
                    *,
                    resumes (
                        id,
                        name,
                        candidate_id,
                        file_url,
                        candidates (
                            id,
                            email,
                            phone_number,
                            major,
                            gpa,
                            year,
                            pronouns,
                            linkedin,
                            gm,
                            newbie_training,
                            headshot
                        )
                    )
                `)
                .eq('cycle_id', activeCycleId)
                .eq('round_id', resumeRound.id),
            supabase
                .from("frq_reviews")
                .select("id, resume_id, score, notes, graded_by, submitted_at")
                .eq("cycle_id", activeCycleId)
                .eq("round_id", resumeRound.id),
            normalizeRoundType(deliberationRound.type) === ROUND_TYPES.COFFEE_CHAT
                ? fetchAllRowsResult(() => supabase
                    .from("interview_evaluations")
                    .select("candidate_id, rating, weighted_score, evaluated_by, notes, submitted_at")
                    .eq("cycle_id", activeCycleId)
                    .eq("round_id", deliberationRound.id)
                    .order("id", { ascending: true }))
                : Promise.resolve({ data: [], error: null }),
            normalizeRoundType(deliberationRound.type) === ROUND_TYPES.COFFEE_CHAT
                ? supabase
                    .from("interview_group_member_assignments")
                    .select("user_id")
                    .eq("round_id", deliberationRound.id)
                : Promise.resolve({ data: [], error: null }),
            loadAttendedEventsByCandidate(activeCycleId),
            supabase
                .from("deliberation_votes")
                .select("candidate_id, rating, weighted_score, voted_by")
                .eq("cycle_id", activeCycleId)
                .eq("round_id", deliberationRound.id),
        ]);

        const { data: resumes, error: resumeError } = resumeResult;
        const { data: cycleCandidates, error: cycleCandError } = cycleCandidateResult;
        const { data: roundDecisionRows, error: decisionError } = roundDecisionResult;
        const { data: reviews, error: reviewError } = reviewResult;
        const { data: frqRows, error: frqError } = frqResult;
        const { data: interviewEvaluationRows, error: interviewEvaluationError } = interviewEvaluationResult;
        const { data: coffeeMemberAssignments, error: coffeeMemberAssignmentError } = coffeeMemberAssignmentResult;
        const { data: deliberationVoteRows, error: deliberationVoteError } = deliberationVoteResult;
        if (resumeError) throw resumeError;
        if (cycleCandError) throw cycleCandError;
        if (decisionError) throw decisionError;
        if (reviewError) throw reviewError;
        if (frqError) throw frqError;
        if (interviewEvaluationError && !isMissingSchemaError(interviewEvaluationError)) throw interviewEvaluationError;
        if (coffeeMemberAssignmentError && !isMissingSchemaError(coffeeMemberAssignmentError)) throw coffeeMemberAssignmentError;
        if (deliberationVoteError && !isMissingSchemaError(deliberationVoteError)) throw deliberationVoteError;

        const candidateLinkLookups = buildCandidateLinkLookups(cycleCandidates);
        const decisionLookup = buildDecisionLookup(roundDecisionRows);
        const graderIds = [
            ...(reviews || []).map((review) => review.graded_by),
            ...(frqRows || []).map((review) => review.graded_by),
        ];
        const gradedByUserLookup = await getGradedByUserLookup(graderIds);

        const candidateMap = {};
        let totalNormalizedSum = 0;
        let reviewCount = 0;
        const metricSet = new Set(getMetricsFromRubricConfig(resumeRound.rubric_config));

        (resumes || []).forEach(resume => {
            const embedded = firstRel(resume.candidates) || {};
            const linked = applyResumeCandidateLink(resume, embedded, candidateLinkLookups);
            candidateMap[resume.id] = {
                id: resume.id,
                candidateId: linked.candidateId,
                canDecide: linked.canDecide,
                linkAmbiguous: linked.linkAmbiguous,
                name: resume.name || 'Unknown',
                email: linked.email,
                phoneNumber: linked.phoneNumber,
                major: linked.major,
                gpa: linked.gpa,
                year: linked.year,
                screeningExclusionReason: viewingHistoricalCycle ? null : screeningExclusionReason(linked.year),
                pronouns: linked.pronouns,
                linkedin: linked.linkedin,
                gm: linked.gm,
                newbieTraining: linked.newbieTraining,
                headshot: linked.headshot,
                createdAt: resume.created_at,
                totalScore: 0,
                totalNormalized: 0,
                numReviews: 0,
                categoryTotals: {},
                categoryCounts: {},
                reviews: [],
            };
        });

        (reviews || []).forEach(review => {
            if (!review.resumes) return;
            const resumeId = review.resumes.id;

            const candidateYear = firstRel(review.resumes?.candidates)?.year;
            const scoring = getReviewScoring(review, {
                rubricConfig: resumeRound.rubric_config,
                candidateYear,
            });
            scoring.metrics.forEach((metric) => metricSet.add(metric));

            const reviewScore = scoring.score;
            const reviewNormalized = scoring.normalizedScore ?? resolveReviewNormalizedValue(review, {
                rubricConfig: resumeRound.rubric_config,
                candidateYear,
            });
            if (!Number.isFinite(reviewScore) || !Number.isFinite(reviewNormalized)) return;

            totalNormalizedSum += reviewNormalized;
            reviewCount++;

            if (!candidateMap[resumeId]) {
                const embedded = firstRel(review.resumes.candidates) || {};
                const linked = applyResumeCandidateLink(review.resumes, embedded, candidateLinkLookups);
                candidateMap[resumeId] = {
                    id: resumeId,
                    candidateId: linked.candidateId,
                    canDecide: linked.canDecide,
                    linkAmbiguous: linked.linkAmbiguous,
                    name: review.resumes.name || 'Unknown',
                    email: linked.email,
                    phoneNumber: linked.phoneNumber,
                    major: linked.major,
                    gpa: linked.gpa,
                    year: linked.year,
                    screeningExclusionReason: viewingHistoricalCycle ? null : screeningExclusionReason(linked.year),
                    pronouns: linked.pronouns,
                    linkedin: linked.linkedin,
                    gm: linked.gm,
                    newbieTraining: linked.newbieTraining,
                    headshot: linked.headshot,
                    createdAt: null,
                    totalScore: 0,
                    totalNormalized: 0,
                    numReviews: 0,
                    categoryTotals: {},
                    categoryCounts: {},
                    reviews: [],
                };
            }
            
            candidateMap[resumeId].totalScore += reviewScore;
            candidateMap[resumeId].totalNormalized += reviewNormalized;
            candidateMap[resumeId].numReviews++;

            Object.entries(review.scores || {}).forEach(([metric, value]) => {
                const numericValue = Number(value) || 0;
                candidateMap[resumeId].categoryTotals[metric] =
                    (candidateMap[resumeId].categoryTotals[metric] || 0) + numericValue;
                candidateMap[resumeId].categoryCounts[metric] =
                    (candidateMap[resumeId].categoryCounts[metric] || 0) + 1;
            });

            const graderFromUsers = review.graded_by != null ? gradedByUserLookup[review.graded_by] : null;

            candidateMap[resumeId].reviews.push({
                id: review.id,
                scores: review.scores || {},
                score: reviewScore,
                normalizedScore: reviewNormalized,
                maxScore: scoring.maxScore,
                maxPerCategory: scoring.maxPerCategory,
                legacy: scoring.legacy,
                gradedBy: review.graded_by ?? null,
                reviewerName: graderFromUsers?.name || null,
                reviewerEmail: graderFromUsers?.email || null,
                notes: review.notes || '',
                submittedAt: review.submitted_at
            });
        });

        const metrics = [...metricSet];
        const maxPerCategory = resumeRound.rubric_config?.maxPerCategory || 4;

        const candidates = Object.values(candidateMap).map(c => {
            const aggregateScore = c.numReviews > 0 ? c.totalScore / c.numReviews : null;
            const resumeMax = resolveCandidateResumeMax(c.reviews, {
                rubricConfig: resumeRound.rubric_config,
                candidateYear: c.year,
            });
            const normalizedScore = c.numReviews > 0
                ? Number((c.totalNormalized / c.numReviews).toFixed(1))
                : null;
            const categoryScores = buildCategoryScores(c.categoryTotals, c.categoryCounts);

            const decision = resolveCandidateDecision(c.candidateId, decisionLookup, decisionOptions);

            return {
                id: c.id,
                candidateId: c.candidateId,
                name: c.name,
                email: c.email,
                phoneNumber: c.phoneNumber,
                major: c.major,
                gpa: c.gpa,
                year: c.year,
                screeningExclusionReason: c.screeningExclusionReason,
                pronouns: c.pronouns,
                linkedin: c.linkedin,
                gm: c.gm,
                newbieTraining: c.newbieTraining,
                headshot: c.headshot || '',
                aggregateScore: aggregateScore === null ? null : Number(aggregateScore.toFixed(1)),
                normalizedScore,
                maxScore: resumeMax,
                resumeMax,
                categoryScores,
                // This candidate's own (year-specific) rubric categories for the
                // scorecard breakdown — not the cross-year `metrics` union, which
                // is retained only for override/score math.
                rubricMetrics: appendFrqMetric(getRubricForYear(resumeRound.rubric_config, c.year).metrics),
                numReviews: c.numReviews,
                reviews: c.reviews.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt)),
                score: normalizedScore == null ? null : Math.round(normalizedScore),
                createdAt: c.createdAt,
                decision,
                canDecide: c.canDecide,
                linkAmbiguous: c.linkAmbiguous,
            };
        });

        const filteredCandidates = filterCandidatesForDeliberationRound(candidates, {
            deliberationRound,
            priorDecisionRows: priorRoundDecisionRows,
        });

        const allReviewIds = filteredCandidates.flatMap(c => (c.reviews || []).map(r => r.id));
        const reviewOverrideLookup = await fetchReviewOverridesByReviewIds(allReviewIds);
        const candidatesWithOverrides = applyReviewOverridesToCandidates(
            filteredCandidates,
            reviewOverrideLookup,
            { rubricConfig: resumeRound.rubric_config, metrics }
        );

        const frqByResumeId = groupFrqReviewsByResumeId(frqRows, gradedByUserLookup);
        // Demonstrated Interest multiplies the composite before eligibility zeroing and ranking.
        const candidatesWithComposite = applyDemonstratedInterestToCandidates(
            applyCompositeScoringToCandidates(candidatesWithOverrides, {
                frqByResumeId,
                rubricConfig: resumeRound.rubric_config,
            }),
            attendedEventsByCandidate,
            activeCycle.interest_multiplier_steps
        );
        // Display only the current rubric's categories — the `metrics` union above still
        // carries retired categories from older reviews' snapshots (needed for override/score
        // math), but those should not surface in the scorecard breakdown.
        const currentMetrics = getMetricsFromRubricConfig(resumeRound.rubric_config);
        const metricsWithFrq = appendFrqMetric(currentMetrics.length ? currentMetrics : metrics);

        const signalCandidateIds = [
            ...new Set(candidatesWithComposite.map((c) => c.candidateId).filter(Boolean)),
        ];
        const signalLookups = await loadCandidateSignalLookups(signalCandidateIds, req.user?.user_id);
        const candidatesWithSignals = candidatesWithComposite.map((c) =>
            applyScreeningEligibility(applyCandidateSignals(c, signalLookups), !viewingHistoricalCycle)
        );

        // Resume rank is retained as a tie-breaker after the cycle moves into
        // Coffee Chats; the Coffee Chat total becomes the primary ranking value.
        candidatesWithSignals.sort((a, b) => {
            const eligibilityOrder = Number(Boolean(a.screeningExclusionReason)) - Number(Boolean(b.screeningExclusionReason));
            if (eligibilityOrder) return eligibilityOrder;
            if (a.normalizedScore === null && b.normalizedScore === null) {
                return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
            }
            if (a.normalizedScore === null) return 1;
            if (b.normalizedScore === null) return -1;
            return b.normalizedScore - a.normalizedScore;
        });
        candidatesWithSignals.forEach((c, index) => {
            c.resumeScreenRank = index + 1;
        });

        const assignedCoffeeMemberIds = new Set((coffeeMemberAssignmentError ? [] : coffeeMemberAssignments || []).map((row) => row.user_id));
        // Table assignments control rotation and expected coverage, but a valid
        // saved rating is still part of the candidate's scoreboard total.
        const coffeeChatEvaluationRowsForScoring = getScoreboardCoffeeChatEvaluations(interviewEvaluationRows || []);
        const coffeeChatEvaluationsByCandidate = {};
        (interviewEvaluationError ? [] : coffeeChatEvaluationRowsForScoring).forEach((row) => {
            if (!Number.isFinite(Number(row.weighted_score))) return;
            if (!coffeeChatEvaluationsByCandidate[row.candidate_id]) coffeeChatEvaluationsByCandidate[row.candidate_id] = [];
            coffeeChatEvaluationsByCandidate[row.candidate_id].push(row);
        });
        candidatesWithSignals.forEach((candidate) => {
            const evaluations = coffeeChatEvaluationsByCandidate[candidate.candidateId] || [];
            candidate.coffeeChatScore = evaluations.reduce((sum, row) => sum + Number(row.weighted_score), 0);
            candidate.coffeeChatEvaluationCount = evaluations.length;
            candidate.coffeeChatExpectedEvaluationCount = coffeeMemberAssignmentError ? null : assignedCoffeeMemberIds.size;
        });

        // Deliberation votes are an open, live tally the whole committee sees.
        // Group each candidate's votes, fold them into the breakdown/net, and
        // surface the caller's own pick so the UI can highlight it.
        const deliberationVotesByCandidate = {};
        (deliberationVoteError ? [] : deliberationVoteRows || []).forEach((row) => {
            if (!deliberationVotesByCandidate[row.candidate_id]) deliberationVotesByCandidate[row.candidate_id] = [];
            deliberationVotesByCandidate[row.candidate_id].push({
                rating: row.rating,
                weightedScore: Number(row.weighted_score),
                votedBy: row.voted_by,
            });
        });
        candidatesWithSignals.forEach((candidate) => {
            const votes = deliberationVotesByCandidate[candidate.candidateId] || [];
            const tally = aggregateDeliberationVotes(votes);
            const mine = votes.find((vote) => vote.votedBy === req.user?.user_id) || null;
            candidate.deliberationVote = {
                breakdown: tally.breakdown,
                count: tally.count,
                net: tally.net,
                myRating: mine?.rating || null,
            };
        });
        const deliberationVotingAvailable = !deliberationVoteError;

        const isCoffeeChatScoreboard = normalizeRoundType(deliberationRound.type) === ROUND_TYPES.COFFEE_CHAT;
        if (isCoffeeChatScoreboard) {
            candidatesWithSignals.sort((a, b) =>
                b.coffeeChatScore - a.coffeeChatScore
                || a.resumeScreenRank - b.resumeScreenRank
                || String(a.id).localeCompare(String(b.id))
            );
            candidatesWithSignals.forEach((candidate) => {
                candidate.rankingScore = candidate.coffeeChatScore;
            });
        }
        candidatesWithSignals.forEach((c, index) => { c.rank = index + 1; });

        const totalReviewed = candidatesWithSignals.filter(c => c.numReviews > 0).length;
        const avgScore = reviewCount > 0 ? (totalNormalizedSum / reviewCount).toFixed(1) : 0;
        const decisionCounts = countDecisions(candidatesWithSignals);
        const incompleteSummary = summarizeIncompleteDeliberation(candidatesWithSignals);
        const undecidedCount = decisionCounts.pending + decisionCounts.hold;
        const canCloseRound = canDeliberate && incompleteSummary.incompleteCount === 0 && candidatesWithSignals.length > 0;

        let notification = null;
        if (req.user?.role === "admin") {
            const [template, lastBatch] = await Promise.all([
                resolveAdvanceNotificationForRound(
                    deliberationRound,
                    activeCycle,
                    cycleRounds
                ),
                fetchLatestAdvanceBatch(deliberationRound.id),
            ]);
            notification = {
                template,
                lastBatch,
                gmailConfigured: isGmailConfigured(),
                canSendAdvanceEmails:
                    deliberationRound.status === "closed" && decisionCounts.advance > 0,
            };
        }

        res.json({
            context: {
                cycle: activeCycle ? { id: activeCycle.id, name: activeCycle.name } : null,
                round: mapScoreboardRoundContext(deliberationRound),
                resumeRound: mapScoreboardRoundContext(resumeRound),
                nextRound: mapScoreboardRoundContext(nextRound),
                activeRound: mapScoreboardRoundContext(activeRound),
                allRounds: (cycleRounds || []).map(mapScoreboardRoundContext),
                viewingHistorical,
                canDeliberate,
                canCloseRound,
                undecidedCount,
                incompleteCount: incompleteSummary.incompleteCount,
                notification,
                rankingMode: isCoffeeChatScoreboard ? "coffee_chat" : "resume_screen",
                assignedMemberCount: coffeeMemberAssignmentError ? null : assignedCoffeeMemberIds.size,
                deliberationVotingAvailable,
            },
            metrics: metricsWithFrq,
            maxPerCategory,
            stats: {
                applicants: candidatesWithSignals.length,
                reviewed: totalReviewed,
                advanced: decisionCounts.advance,
                hold: decisionCounts.hold,
                rejected: decisionCounts.reject,
                pending: decisionCounts.pending,
                avgScore: avgScore,
                coffeeChatAverage: isCoffeeChatScoreboard && candidatesWithSignals.length
                    ? Number((candidatesWithSignals.reduce((sum, candidate) => sum + candidate.coffeeChatScore, 0) / candidatesWithSignals.length).toFixed(1))
                    : null,
            },
            candidates: candidatesWithSignals
        });

    } catch (err) {
        return respondWithServerError(res, err, 'getScoreboard');
    }
};

exports.upsertRoundDecision = async (req, res) => {
    const candidateIdInput = String(req.body?.candidate_id || "").trim();
    const resumeIdInput = String(req.body?.resume_id || "").trim();
    const decision = String(req.body?.decision || "").trim().toLowerCase();
    const notes = typeof req.body?.notes === "string" ? req.body.notes.slice(0, 1000) : "";
    const decidedBy = req.user?.user_id;

    if (!["pending", "advance", "hold", "reject"].includes(decision)) {
        return res.status(400).json({ error: "decision must be Pending, Advance, Hold, or Reject" });
    }

    try {
        const activeCycle = await getActiveCycleRow();
        if (!activeCycle?.id) {
            return res.status(503).json({ error: "No active recruiting cycle" });
        }

        const resumeRound = await getResumeScreenRoundForCycle(activeCycle.id);
        if (!resumeRound) {
            return res.status(503).json({ error: "No resume screening round for this cycle" });
        }

        const activeRound = await getOpenRoundForCycle(activeCycle.id);
        if (!activeRound) {
            return res.status(503).json({
                error: "No round is open — open a round in Cycle Management before saving deliberation decisions.",
            });
        }

        const resolved = await resolveCandidateIdForDecision({
            candidateId: candidateIdInput,
            resumeId: resumeIdInput,
            cycleId: activeCycle.id,
        });
        if (resolved.error) {
            return res.status(resolved.status).json({ error: resolved.error });
        }

        const candidateId = resolved.candidateId;
        const linkedResumeId = resolved.resumeId;

        const { data: resumeRow, error: resumeError } = await supabase
            .from("resumes")
            .select("id, candidate_id")
            .eq("id", linkedResumeId)
            .eq("cycle_id", activeCycle.id)
            .maybeSingle();

        if (resumeError) return respondWithServerError(res, resumeError, "upsertRoundDecision resume");
        if (!resumeRow) {
            return res.status(400).json({ error: "Resume not found in this cycle" });
        }

        if (resolved.backfillCandidateId) {
            await maybeBackfillResumeCandidateId(resumeRow.id, resolved.backfillCandidateId);
        }

        const eligibilityError = await assertCandidateEligibleForRoundDecision({
            activeRound,
            resumeRound,
            cycleId: activeCycle.id,
            candidateId,
        });
        if (eligibilityError) {
            return res.status(eligibilityError.status).json({ error: eligibilityError.error });
        }

        const payload = {
            candidate_id: candidateId,
            cycle_id: activeCycle.id,
            round_id: activeRound.id,
            decision,
            notes,
            decided_by: decidedBy,
            updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
            .from("round_decisions")
            .upsert(payload, { onConflict: "candidate_id,round_id" })
            .select("*")
            .single();

        if (error) return respondWithServerError(res, error, "upsertRoundDecision upsert");

        return res.json({
            candidateId,
            resumeId: linkedResumeId,
            cycleId: activeCycle.id,
            roundId: activeRound.id,
            decision: mapRoundDecision(data, { provisional: isOpenPhase(getRoundPhase(activeRound)) }),
        });
    } catch (err) {
        return respondWithServerError(res, err, "upsertRoundDecision");
    }
};

exports.bulkUpsertRoundDecisions = async (req, res) => {
    const rawDecisions = Array.isArray(req.body?.decisions) ? req.body.decisions : [];
    if (!rawDecisions.length || rawDecisions.length > 1000) {
        return res.status(400).json({ error: "decisions must contain between 1 and 1000 candidates" });
    }

    const inputByCandidate = new Map();
    for (const row of rawDecisions) {
        const candidateId = String(row?.candidate_id || "").trim();
        const resumeId = String(row?.resume_id || "").trim();
        const decision = String(row?.decision || "").trim().toLowerCase();
        if (!candidateId || !resumeId || !["advance", "reject"].includes(decision)) {
            return res.status(400).json({
                error: "Every bulk decision requires candidate_id, resume_id, and an Advance or Reject decision",
            });
        }
        inputByCandidate.set(candidateId, { candidateId, resumeId, decision });
    }

    try {
        const activeCycle = await getActiveCycleRow();
        if (!activeCycle?.id) return res.status(503).json({ error: "No active recruiting cycle" });

        const cycleRounds = await getRoundsForCycle(activeCycle.id);
        const resumeRound = cycleRounds.find((round) => isResumeScreenType(round.type)) || null;
        const activeRound = cycleRounds.find((round) => isOpenPhase(getRoundPhase(round))) || null;
        if (!resumeRound || !activeRound) {
            return res.status(503).json({ error: "An active round and resume screening round are required" });
        }

        const candidateIds = [...inputByCandidate.keys()];
        const [candidateResult, existingResult, priorRows] = await Promise.all([
            supabase
                .from("candidates")
                .select("id, year")
                .eq("cycle_id", activeCycle.id)
                .in("id", candidateIds),
            supabase
                .from("round_decisions")
                .select("candidate_id, decision")
                .eq("cycle_id", activeCycle.id)
                .eq("round_id", activeRound.id)
                .in("candidate_id", candidateIds),
            loadPriorRoundDecisionRows(activeCycle.id, activeRound, cycleRounds),
        ]);

        if (candidateResult.error) throw candidateResult.error;
        if (existingResult.error) throw existingResult.error;

        const excludedCandidateIds = new Set((candidateResult.data || []).filter(c => screeningExclusionReason(c.year)).map(c => c.id));
        const validCandidateIds = new Set((candidateResult.data || []).map((row) => row.id));
        const existingLookup = buildDecisionLookup(existingResult.data || []);
        const priorLookup = buildDecisionLookup(priorRows || []);
        const priorDecisionsStarted = deliberationHasStarted(priorRows || []);
        const skipped = [];
        const now = new Date().toISOString();

        const payloads = [...inputByCandidate.values()].flatMap((input) => {
            if (excludedCandidateIds.has(input.candidateId)) {
                skipped.push({ ...input, reason: "Automatically rejected by class standing" });
                return [];
            }
            if (!validCandidateIds.has(input.candidateId)) {
                skipped.push({ ...input, reason: "Candidate is not in the active cycle" });
                return [];
            }

            const existingStatus = normalizeRoundDecision(existingLookup[input.candidateId]?.decision);
            if (existingLookup[input.candidateId] && existingStatus !== "pending") {
                skipped.push({ ...input, reason: "A committee decision already exists" });
                return [];
            }

            if (!isResumeScreenType(activeRound.type) && priorDecisionsStarted) {
                const priorStatus = normalizeRoundDecision(priorLookup[input.candidateId]?.decision);
                if (priorStatus !== "advance") {
                    skipped.push({ ...input, reason: "Candidate did not advance from the prior round" });
                    return [];
                }
            }

            return [{
                candidate_id: input.candidateId,
                cycle_id: activeCycle.id,
                round_id: activeRound.id,
                decision: input.decision,
                notes: "Applied from configured rank cutoffs",
                decided_by: req.user?.user_id,
                updated_at: now,
            }];
        });

        if (!payloads.length) {
            return res.json({ appliedCount: 0, skippedCount: skipped.length, decisions: [], skipped });
        }

        const { data, error } = await supabase
            .from("round_decisions")
            .upsert(payloads, { onConflict: "candidate_id,round_id" })
            .select("*");
        if (error) return respondWithServerError(res, error, "bulkUpsertRoundDecisions upsert");

        return res.json({
            appliedCount: data?.length || 0,
            skippedCount: skipped.length,
            decisions: (data || []).map((row) => ({
                candidateId: row.candidate_id,
                resumeId: inputByCandidate.get(row.candidate_id)?.resumeId || null,
                decision: mapRoundDecision(row, { provisional: true }),
            })),
            skipped,
        });
    } catch (err) {
        return respondWithServerError(res, err, "bulkUpsertRoundDecisions");
    }
};

// Cast (or clear) the caller's own deliberation vote for a candidate. Unlike
// round_decisions, this is open to every staff role — the whole committee votes.
// Votes are only meaningful while the round sits in the Deliberation phase.
exports.upsertDeliberationVote = async (req, res) => {
    const candidateIdInput = String(req.body?.candidate_id || "").trim();
    const resumeIdInput = String(req.body?.resume_id || "").trim();
    const rating = String(req.body?.rating || "").trim().toLowerCase();
    const notes = typeof req.body?.notes === "string" ? req.body.notes.slice(0, 1000) : "";
    const votedBy = req.user?.user_id;

    try {
        const activeCycle = await getActiveCycleRow();
        if (!activeCycle?.id) {
            return res.status(503).json({ error: "No active recruiting cycle" });
        }

        const activeRound = await getOpenRoundForCycle(activeCycle.id);
        if (!activeRound) {
            return res.status(503).json({
                error: "No round is open — open a round in Cycle Management before voting.",
            });
        }
        if (!canRecordDecisions(getRoundPhase(activeRound))) {
            return res.status(400).json({
                error: `${activeRound.name} is not in Deliberation yet — voting opens once grading freezes.`,
            });
        }

        const resolved = await resolveCandidateIdForDecision({
            candidateId: candidateIdInput,
            resumeId: resumeIdInput,
            cycleId: activeCycle.id,
        });
        if (resolved.error) {
            return res.status(resolved.status).json({ error: resolved.error });
        }

        const candidateId = resolved.candidateId;
        if (resolved.backfillCandidateId) {
            await maybeBackfillResumeCandidateId(resolved.resumeId, resolved.backfillCandidateId);
        }

        // An empty rating means the member cleared their vote — remove the row so
        // the tally and count drop, matching Coffee Chat's "unselect clears" feel.
        if (!rating) {
            const { error: deleteError } = await supabase
                .from("deliberation_votes")
                .delete()
                .eq("candidate_id", candidateId)
                .eq("round_id", activeRound.id)
                .eq("voted_by", votedBy);
            if (deleteError && !isMissingSchemaError(deleteError)) {
                return respondWithServerError(res, deleteError, "upsertDeliberationVote clear");
            }
            return res.json({ vote: null });
        }

        if (!isValidDeliberationRating(rating)) {
            return res.status(400).json({ error: "rating must be Strong Yes, Yes, No, or Strong No" });
        }

        const payload = {
            candidate_id: candidateId,
            cycle_id: activeCycle.id,
            round_id: activeRound.id,
            rating,
            weighted_score: DELIBERATION_VOTE_SCORES[rating],
            notes,
            voted_by: votedBy,
            updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
            .from("deliberation_votes")
            .upsert(payload, { onConflict: "candidate_id,round_id,voted_by" })
            .select("*")
            .single();

        if (error) {
            if (isMissingSchemaError(error)) {
                return res.status(503).json({ error: "Deliberation voting requires database migration #41." });
            }
            return respondWithServerError(res, error, "upsertDeliberationVote upsert");
        }

        return res.json({ vote: mapDeliberationVote(data) });
    } catch (err) {
        return respondWithServerError(res, err, "upsertDeliberationVote");
    }
};

async function fetchScoreboardApplicationPayload(resumeId, requestedCycleId = null) {
    let activeCycle = await getActiveCycleRow();
    const applyStandingRule = !requestedCycleId || requestedCycleId === activeCycle?.id;
    if (requestedCycleId && requestedCycleId !== activeCycle?.id) {
        const { data, error } = await supabase
            .from('cycles')
            .select('*')
            .eq('id', requestedCycleId)
            .maybeSingle();
        if (error) {
            const err = new Error(error.message || 'Failed to load recruiting cycle');
            err.cause = error;
            throw err;
        }
        activeCycle = data;
    }
    const activeCycleId = activeCycle?.id || null;
    const resumeRound = activeCycleId
        ? await getResumeScreenRoundForCycle(activeCycleId)
        : null;

    if (!activeCycleId || !resumeRound) {
        const err = new Error('No recruiting cycle available');
        err.statusCode = 503;
        throw err;
    }

    const legacyCandidateFields = `
        id, name, email, phone_number, major, gpa, year, pronouns, urm,
        linkedin, gm, newbie_training, extenuating_circumstances, headshot,
        resume_file_url, created_at, cycle_id`;
    const mappedCandidateFields = `${legacyCandidateFields}, referral_source,
        previously_applied, professional_development,
        consulting_connect_interest, application_responses`;
    const selectResume = candidateFields => supabase.from('resumes').select(`
                id,
                name,
                file_url,
                review_count,
                created_at,
                cycle_id,
                candidates (
                    ${candidateFields}
                )
            `)
            .eq('id', resumeId)
            .maybeSingle();

    // The resume and round metadata share the resolved cycle context but do not
    // depend on one another, so load them together before fetching reviews.
    let [resumeResult, cycleRounds] = await Promise.all([
        selectResume(mappedCandidateFields),
        getRoundsForCycle(activeCycleId),
    ]);
    if (resumeResult.error && isMissingSchemaError(resumeResult.error)) {
        resumeResult = await selectResume(legacyCandidateFields);
    }

    const coffeeChatRound = getRoundByType(cycleRounds, ROUND_TYPES.COFFEE_CHAT);
    const interviewRounds = (cycleRounds || []).filter((round) => isInterviewRoundType(round.type));
    const interviewRoundIds = interviewRounds.map((round) => round.id);
    const { data: resumeRow, error: resumeError } = resumeResult;

    if (resumeError) {
        const err = new Error(resumeError.message || 'Failed to load resume');
        err.cause = resumeError;
        throw err;
    }
    if (!resumeRow) {
        const err = new Error('Candidate not found');
        err.statusCode = 404;
        throw err;
    }

    if (resumeRow.cycle_id !== activeCycleId) {
        const err = new Error('Candidate is not in this cycle');
        err.statusCode = 404;
        throw err;
    }

    const candidate = firstRel(resumeRow.candidates);
    if (!candidate || candidate.cycle_id !== activeCycleId) {
        const err = new Error('Candidate is not in this cycle');
        err.statusCode = 404;
        throw err;
    }

    const [reviewResult, frqResult, interviewEvaluationResult, coffeeMemberAssignmentResult] = await Promise.all([
        supabase
            .from('resume_reviews')
            .select('id, scores, notes, submitted_at, graded_by, rubric_snapshot, decision')
            .eq('resume_id', resumeId)
            .eq('cycle_id', activeCycleId)
            .eq('round_id', resumeRound.id)
            .order('submitted_at', { ascending: true }),
        supabase
            .from('frq_reviews')
            .select('id, resume_id, score, notes, graded_by, submitted_at')
            .eq('resume_id', resumeId)
            .eq('cycle_id', activeCycleId)
            .eq('round_id', resumeRound.id),
        interviewRoundIds.length
            ? supabase
                .from('interview_evaluations')
                .select('id, round_id, decision, rating, weighted_score, notes, evaluated_by, scheduled_at, submitted_at, updated_at')
                .eq('candidate_id', candidate.id)
                .eq('cycle_id', activeCycleId)
                .in('round_id', interviewRoundIds)
                .order('submitted_at', { ascending: true })
            : Promise.resolve({ data: [], error: null }),
        coffeeChatRound
            ? supabase
                .from('interview_group_member_assignments')
                .select('user_id')
                .eq('round_id', coffeeChatRound.id)
            : Promise.resolve({ data: [], error: null }),
    ]);
    const { data: reviews, error: reviewError } = reviewResult;

    if (reviewError) {
        const err = new Error(reviewError.message || 'Failed to load reviews');
        err.cause = reviewError;
        throw err;
    }

    const { data: frqRows, error: frqError } = frqResult;
    const { data: interviewEvaluationRows, error: interviewEvaluationError } = interviewEvaluationResult;
    const { data: coffeeMemberAssignments, error: coffeeMemberAssignmentError } = coffeeMemberAssignmentResult;
    if (frqError) {
        const err = new Error(frqError.message || 'Failed to load FRQ reviews');
        err.cause = frqError;
        throw err;
    }
    if (interviewEvaluationError && !isMissingSchemaError(interviewEvaluationError)) {
        const err = new Error(interviewEvaluationError.message || 'Failed to load interview evaluations');
        err.cause = interviewEvaluationError;
        throw err;
    }
    if (coffeeMemberAssignmentError && !isMissingSchemaError(coffeeMemberAssignmentError)) {
        const err = new Error(coffeeMemberAssignmentError.message || 'Failed to load Coffee Chat member assignments');
        err.cause = coffeeMemberAssignmentError;
        throw err;
    }

    const roundById = new Map(interviewRounds.map((round) => [round.id, round]));
    const assignedCoffeeMemberIds = new Set((coffeeMemberAssignmentError ? [] : coffeeMemberAssignments || []).map((row) => row.user_id));
    const interviewRowsForProfile = (interviewEvaluationError ? [] : interviewEvaluationRows || []).filter((row) => {
        const round = roundById.get(row.round_id);
        if (normalizeRoundType(round?.type) !== ROUND_TYPES.COFFEE_CHAT) return true;
        return shouldIncludeCoffeeChatEvaluationInProfile(row, {
            assignedMemberIds: assignedCoffeeMemberIds,
            assignmentLookupFailed: Boolean(coffeeMemberAssignmentError),
        });
    });

    // Resume and FRQ grader identities come from the same users table, and the
    // review overrides are independent of that lookup. Run both enrichments in
    // parallel and reuse the single user result for both review types.
    const graderIds = [
        ...(reviews || []).map((review) => review.graded_by),
        ...(frqRows || []).map((row) => row.graded_by),
        ...interviewRowsForProfile.map((row) => row.evaluated_by),
    ];
    const [gradedByUserLookup, reviewOverrideLookup] = await Promise.all([
        getGradedByUserLookup(graderIds),
        fetchReviewOverridesByReviewIds((reviews || []).map((review) => review.id)),
    ]);
    const metricSet = new Set(getMetricsFromRubricConfig(resumeRound.rubric_config));
    const categoryTotals = {};
    const categoryCounts = {};
    const categoryMaxTotals = {};
    const categoryMaxCounts = {};
    let totalScore = 0;
    let totalNormalized = 0;

    const mappedReviews = (reviews || []).map(review => {
        const scoring = getReviewScoring(review, {
            rubricConfig: resumeRound.rubric_config,
            candidateYear: candidate.year,
        });
        scoring.metrics.forEach((metric) => metricSet.add(metric));

        const reviewScore = scoring.score;
        const reviewNormalized = scoring.normalizedScore ?? resolveReviewNormalizedValue(review, {
            rubricConfig: resumeRound.rubric_config,
            candidateYear: candidate.year,
        });
        if (!Number.isFinite(reviewScore) || !Number.isFinite(reviewNormalized)) return null;

        totalScore += reviewScore;
        totalNormalized += reviewNormalized;

        Object.entries(review.scores || {}).forEach(([metric, value]) => {
            const numericValue = Number(value) || 0;
            categoryTotals[metric] = (categoryTotals[metric] || 0) + numericValue;
            categoryCounts[metric] = (categoryCounts[metric] || 0) + 1;
            categoryMaxTotals[metric] = (categoryMaxTotals[metric] || 0) + scoring.maxPerCategory;
            categoryMaxCounts[metric] = (categoryMaxCounts[metric] || 0) + 1;
        });

        const graderFromUsers = review.graded_by != null ? gradedByUserLookup[review.graded_by] : null;

        return {
            id: review.id,
            scores: review.scores || {},
            score: reviewScore,
            normalizedScore: reviewNormalized,
            maxScore: scoring.maxScore,
            maxPerCategory: scoring.maxPerCategory,
            legacy: scoring.legacy,
            decision: review.decision || 'pass',
            reviewerName: graderFromUsers?.name || null,
            reviewerEmail: graderFromUsers?.email || null,
            notes: review.notes || '',
            submittedAt: review.submitted_at,
        };
    }).filter(Boolean);

    const numReviews = mappedReviews.length;
    const aggregateScore = numReviews > 0 ? Number((totalScore / numReviews).toFixed(1)) : null;
    const resumeMax = resolveCandidateResumeMax(mappedReviews, {
        rubricConfig: resumeRound.rubric_config,
        candidateYear: candidate.year,
    });
    const normalizedScore = numReviews > 0
        ? Number((totalNormalized / numReviews).toFixed(1))
        : null;
    const resumeFileUrl = resumeRow.file_url || candidate.resume_file_url || '';

    const candidateWithOverrides = applyReviewOverridesToCandidate(
        {
            reviews: mappedReviews,
            aggregateScore,
            normalizedScore,
            score: normalizedScore === null ? null : Math.round(normalizedScore),
            numReviews,
            year: candidate.year,
            resumeMax,
            metrics: [...metricSet],
            categoryScores: buildCategoryScores(categoryTotals, categoryCounts),
        },
        reviewOverrideLookup,
        { rubricConfig: resumeRound.rubric_config, candidateYear: candidate.year, metrics: [...metricSet] }
    );

    const frqReviews = (frqRows || []).map((row) => mapFrqReviewRow(row, gradedByUserLookup));
    const interviewEvaluations = interviewRowsForProfile.map((row) => ({
        id: row.id,
        roundId: row.round_id,
        roundName: roundById.get(row.round_id)?.name || 'Interview round',
        roundType: normalizeRoundType(roundById.get(row.round_id)?.type),
        decision: row.decision || 'pending',
        rating: row.rating,
        weightedScore: row.weighted_score == null ? null : Number(row.weighted_score),
        notes: row.notes || '',
        reviewerName: gradedByUserLookup[row.evaluated_by]?.name || null,
        reviewerEmail: gradedByUserLookup[row.evaluated_by]?.email || null,
        scheduledAt: row.scheduled_at || null,
        submittedAt: row.updated_at || row.submitted_at,
    }));
    const coffeeChatEvaluations = interviewEvaluations.filter(
        (evaluation) => evaluation.roundType === ROUND_TYPES.COFFEE_CHAT
    );
    const attendedEvents = await loadAttendedEventsByCandidate(activeCycleId, { candidateId: candidate.id });
    const interestMultiplierSteps = activeCycle.interest_multiplier_steps;
    const [compositeCandidate] = applyDemonstratedInterestToCandidates(
        [{
            ...applyCompositeScoringToCandidate(candidateWithOverrides, {
                frqReviews,
                rubricConfig: resumeRound.rubric_config,
            }),
            candidateId: candidate.id,
        }],
        attendedEvents,
        interestMultiplierSteps
    );
    const roundGrades = [
        {
            roundId: resumeRound.id,
            roundName: resumeRound.name,
            roundType: normalizeRoundType(resumeRound.type),
            roundStatus: resumeRound.status,
            reviews: compositeCandidate.reviews,
            frqReviews: compositeCandidate.frqReviews,
            evaluations: [],
        },
        ...interviewRounds.map((round) => ({
            roundId: round.id,
            roundName: round.name,
            roundType: normalizeRoundType(round.type),
            roundStatus: round.status,
            reviews: [],
            frqReviews: [],
            evaluations: interviewEvaluations.filter((evaluation) => evaluation.roundId === round.id),
        })),
    ];
    // Display only THIS candidate's rubric categories (year-specific). The metricSet
    // union carries both retired snapshot categories and other years' categories,
    // which are kept for override/score math above but must not surface in the breakdown.
    const currentMetrics = getRubricForYear(resumeRound.rubric_config, candidate.year).metrics;

    return {
        context: {
            cycle: { id: activeCycle.id, name: activeCycle.name },
            round: { id: resumeRound.id, name: resumeRound.name },
        },
        resume: {
            id: resumeRow.id,
            name: resumeRow.name || candidate.name || 'Unknown',
            fileUrl: resumeFileUrl,
            reviewCount: numReviews,
            submittedAt: resumeRow.created_at,
        },
        candidate: { ...mapApplicationCandidate(candidate), screeningExclusionReason: applyStandingRule ? screeningExclusionReason(candidate.year) : null },
        candidateId: candidate.id,
        resumeRoundId: resumeRound.id,
        activeCycleId,
        interestMultiplierSteps,
        scoring: {
            metrics: appendFrqMetric(currentMetrics.length ? currentMetrics : [...metricSet]),
            maxPerCategory: resumeRound.rubric_config?.maxPerCategory || 4,
            numReviews: compositeCandidate.numReviews,
            aggregateScore: compositeCandidate.aggregateScore,
            normalizedScore: compositeCandidate.normalizedScore,
            score: compositeCandidate.score,
            baseNormalizedScore: compositeCandidate.baseNormalizedScore,
            interestMultiplier: compositeCandidate.interestMultiplier,
            interestEvents: compositeCandidate.interestEvents,
            resumeAggregateScore: compositeCandidate.resumeAggregateScore,
            resumeNormalizedScore: compositeCandidate.resumeNormalizedScore,
            resumeMax: compositeCandidate.resumeMax,
            resumeEarnedPoints: compositeCandidate.resumeEarnedPoints,
            resumePossiblePoints: compositeCandidate.resumePossiblePoints,
            frqScore: compositeCandidate.frqScore,
            frqPending: compositeCandidate.frqPending,
            numFrqReviews: compositeCandidate.numFrqReviews,
            compositeMax: compositeCandidate.compositeMax,
            earnedPoints: compositeCandidate.earnedPoints,
            possiblePoints: compositeCandidate.possiblePoints,
            categoryScores: compositeCandidate.categoryScores,
            categoryMaxScores: {
                ...buildCategoryScores(categoryMaxTotals, categoryMaxCounts),
                [FRQ_METRIC]: FRQ_MAX_SCORE,
            },
            reviews: compositeCandidate.reviews,
            frqReviews: compositeCandidate.frqReviews,
            coffeeChatScore: coffeeChatEvaluations.reduce((sum, row) => sum + (Number.isFinite(row.weightedScore) ? row.weightedScore : 0), 0),
            coffeeChatEvaluationCount: coffeeChatEvaluations.length,
            coffeeChatExpectedEvaluationCount: coffeeMemberAssignmentError ? null : assignedCoffeeMemberIds.size,
            coffeeChatEvaluations,
            roundGrades,
        },
    };
}

async function fetchScoreboardApplicationSummarySource(resumeId, requestedCycleId = null) {
    const activeCycleId = requestedCycleId || await getActiveCycleId();
    if (!activeCycleId) {
        const err = new Error('No recruiting cycle available');
        err.statusCode = 503;
        throw err;
    }

    // The AI prompt only needs the candidate's free responses and cycle labels.
    // Avoid rebuilding every review, grader, signal, and override merely to read
    // or generate a cached two-sentence summary.
    const selectResume = includeSnapshots => supabase
        .from('resumes')
        .select(`
            id,
            cycle_id,
            candidates (
                id,
                name,
                ${includeSnapshots ? 'application_responses,' : ''}
                cycle_id
            )
        `)
        .eq('id', resumeId)
        .maybeSingle();
    let [activeCycleResult, resumeRound, resumeResult] = await Promise.all([
        supabase
            .from('cycles')
            .select('id, name')
            .eq('id', activeCycleId)
            .maybeSingle(),
        getResumeScreenRoundForCycle(activeCycleId),
        selectResume(true),
    ]);
    if (resumeResult.error && isMissingSchemaError(resumeResult.error)) {
        resumeResult = await selectResume(false);
    }

    const { data: activeCycle, error: activeCycleError } = activeCycleResult;
    if (activeCycleError) {
        const err = new Error(activeCycleError.message || 'Failed to load active cycle');
        err.cause = activeCycleError;
        throw err;
    }

    const { data: resumeRow, error: resumeError } = resumeResult;
    if (resumeError) {
        const err = new Error(resumeError.message || 'Failed to load resume');
        err.cause = resumeError;
        throw err;
    }

    if (!activeCycle || !resumeRound) {
        const err = new Error('No resume screening round for this cycle');
        err.statusCode = 503;
        throw err;
    }
    if (!resumeRow) {
        const err = new Error('Candidate not found');
        err.statusCode = 404;
        throw err;
    }

    const candidate = firstRel(resumeRow.candidates);
    if (resumeRow.cycle_id !== activeCycleId || !candidate || candidate.cycle_id !== activeCycleId) {
        const err = new Error('Candidate is not in this cycle');
        err.statusCode = 404;
        throw err;
    }

    return {
        candidate: mapApplicationCandidate(candidate),
        candidateId: candidate.id,
        activeCycleId,
        resumeRoundId: resumeRound.id,
        context: {
            cycle: { id: activeCycle.id, name: activeCycle.name },
            round: { id: resumeRound.id, name: resumeRound.name },
        },
    };
}

function respondWithApplicationFetchError(res, err, context) {
    if (err?.statusCode === 404) {
        return res.status(404).json({ error: err.message });
    }
    if (err?.statusCode === 503) {
        return res.status(503).json({ error: err.message });
    }
    return respondWithServerError(res, err?.cause || err, context);
}

// Full application record for one scoreboard candidate (resume id).
exports.getScoreboardApplication = async (req, res) => {
    try {
        const resumeId = String(req.params.resumeId || '').trim();
        if (!resumeId) {
            return res.status(400).json({ error: 'resumeId is required' });
        }

        const requestedCycleId = String(req.query?.cycleId || '').trim() || null;
        const payload = await fetchScoreboardApplicationPayload(resumeId, requestedCycleId);
        const userId = req.user?.user_id ?? null;

        const [adminOverrideRow, signals, roundDecisionResult] = await Promise.all([
            fetchAdminOverride(
                payload.candidateId,
                payload.activeCycleId,
                payload.resumeRoundId
            ),
            fetchCandidateSignalsDetail(payload.candidateId, userId),
            supabase
                .from('round_decisions')
                .select('decision, notes, decided_by, updated_at')
                .eq('cycle_id', payload.activeCycleId)
                .eq('round_id', payload.resumeRoundId)
                .eq('candidate_id', payload.candidateId)
                .maybeSingle(),
        ]);

        if (roundDecisionResult.error) {
            return respondWithServerError(res, roundDecisionResult.error, 'getScoreboardApplication decision');
        }

        const adminOverride = mapAdminOverride(adminOverrideRow);
        if (adminOverride) {
            applyAdminOverrideToScoring(payload.scoring, adminOverride);
        }

        const eligibility = applyScreeningEligibility({ ...payload.scoring, screeningExclusionReason: payload.candidate?.screeningExclusionReason });
        payload.scoring = eligibility;
        const { candidateId, resumeRoundId, activeCycleId, ...responseBody } = payload;
        return res.json({
            ...responseBody,
            adminOverride,
            signals,
            roundDecision: eligibility.screeningExclusionReason ? eligibility.decision : mapRoundDecision(roundDecisionResult.data),
        });
    } catch (err) {
        return respondWithApplicationFetchError(res, err, 'getScoreboardApplication');
    }
};

exports.getScoreboardApplicationSummary = async (req, res) => {
    try {
        const resumeId = String(req.params.resumeId || '').trim();
        if (!resumeId) {
            return res.status(400).json({ error: 'resumeId is required' });
        }

        if (!isAiSummaryConfigured()) {
            return res.status(503).json({ error: 'AI summary is not configured on the server' });
        }

        const forceRefresh = String(req.query.refresh || '').trim() === '1';

        const requestedCycleId = String(req.query?.cycleId || '').trim() || null;
        const payload = await fetchScoreboardApplicationSummarySource(resumeId, requestedCycleId);

        const summaryResult = await resolveCandidateSummary(supabase, {
            resumeId,
            candidateId: payload.candidateId,
            cycleId: payload.activeCycleId,
            roundId: payload.resumeRoundId,
            applicationPayload: {
                candidate: payload.candidate,
                context: payload.context,
            },
            forceRefresh,
        });

        return res.json(summaryResult);
    } catch (err) {
        if (err?.code === 'AI_NOT_CONFIGURED') {
            return res.status(503).json({ error: err.message });
        }
        if (err?.response?.status === 401) {
            return res.status(503).json({ error: 'AI summary API key is invalid' });
        }
        const geminiMessage = err?.response?.data?.error?.message;
        if (geminiMessage) {
            return res.status(503).json({ error: geminiMessage });
        }
        if (err?.message && err?.code !== 'AI_NOT_CONFIGURED') {
            return respondWithServerError(
                res,
                err,
                'getScoreboardApplicationSummary',
                err.message
            );
        }
        return respondWithApplicationFetchError(res, err, 'getScoreboardApplicationSummary');
    }
};

// ── Admin overrides: per-candidate notes + score override for resume screening ──

async function fetchAdminOverride(candidateId, cycleId, roundId) {
    const { data, error } = await supabase
        .from('candidate_admin_overrides')
        .select('*')
        .eq('candidate_id', candidateId)
        .eq('cycle_id', cycleId)
        .eq('round_id', roundId)
        .maybeSingle();

    if (error) {
        console.warn('fetchAdminOverride:', error.message);
        return null;
    }
    return data;
}

function mapAdminOverride(row) {
    if (!row) return null;
    return {
        id: row.id,
        candidateId: row.candidate_id,
        cycleId: row.cycle_id,
        roundId: row.round_id,
        adminNotes: row.admin_notes || '',
        overrideScore: row.override_score != null ? Number(row.override_score) : null,
        adminUserId: row.admin_user_id ?? null,
        updatedAt: row.updated_at || null,
    };
}

/** Apply admin score override to scoring object (mutates in place). */
function applyAdminOverrideToScoring(scoring, adminOverride) {
    if (!adminOverride || adminOverride.overrideScore == null) {
        scoring.adminOverride = adminOverride ? { adminNotes: adminOverride.adminNotes, overrideScore: null, updatedAt: adminOverride.updatedAt } : null;
        return;
    }
    // Cosmetic-only: replaces display % without changing underlying raw rubric data.
    const overridden = Number(adminOverride.overrideScore);
    scoring.normalizedScore = overridden;
    scoring.score = Math.round(overridden);
    scoring.adminOverride = {
        adminNotes: adminOverride.adminNotes || '',
        overrideScore: overridden,
        updatedAt: adminOverride.updatedAt || null,
    };
}

/** GET admin override for a candidate on the application page (admin only). */
exports.getAdminOverride = async (req, res) => {
    try {
        const resumeId = String(req.params.resumeId || '').trim();
        if (!resumeId) {
            return res.status(400).json({ error: 'resumeId is required' });
        }

        const payload = await fetchScoreboardApplicationPayload(resumeId);
        const override = await fetchAdminOverride(
            payload.candidateId,
            payload.activeCycleId,
            payload.resumeRoundId
        );

        return res.json({ override: mapAdminOverride(override) });
    } catch (err) {
        return respondWithApplicationFetchError(res, err, 'getAdminOverride');
    }
};

/** UPSERT admin override for a candidate (admin only). */
exports.upsertAdminOverride = async (req, res) => {
    try {
        const resumeId = String(req.params.resumeId || '').trim();
        if (!resumeId) {
            return res.status(400).json({ error: 'resumeId is required' });
        }

        const adminNotes = typeof req.body?.adminNotes === 'string' ? req.body.adminNotes.slice(0, 5000) : '';
        const rawScore = req.body?.overrideScore;
        const overrideScore = rawScore != null && rawScore !== '' ? Number(rawScore) : null;

        const payload = await fetchScoreboardApplicationPayload(resumeId);
        // Demonstrated Interest can lift scores past 100%, so overrides may match its ceiling.
        const maxOverride = Number((100 * maxInterestMultiplier(payload.interestMultiplierSteps)).toFixed(1));
        if (overrideScore !== null && (!Number.isFinite(overrideScore) || overrideScore < 0 || overrideScore > maxOverride)) {
            return res.status(400).json({ error: `overrideScore must be a number between 0 and ${maxOverride}` });
        }
        const exclusion = screeningAccessError(payload.candidate);
        if (exclusion) return res.status(exclusion.status).json({ error: exclusion.error });
        const adminUserId = req.user?.user_id;

        const upsertPayload = {
            candidate_id: payload.candidateId,
            cycle_id: payload.activeCycleId,
            round_id: payload.resumeRoundId,
            admin_notes: adminNotes || null,
            override_score: overrideScore,
            admin_user_id: adminUserId ?? null,
            updated_at: new Date().toISOString(),
        };

        // If clearing everything, delete the row
        if (!adminNotes && overrideScore === null) {
            const { error: deleteError } = await supabase
                .from('candidate_admin_overrides')
                .delete()
                .eq('candidate_id', payload.candidateId)
                .eq('cycle_id', payload.activeCycleId)
                .eq('round_id', payload.resumeRoundId);

            if (deleteError) return respondWithServerError(res, deleteError, 'upsertAdminOverride delete');

            return res.json({ override: null });
        }

        const { data, error } = await supabase
            .from('candidate_admin_overrides')
            .upsert(upsertPayload, { onConflict: 'candidate_id,cycle_id,round_id' })
            .select('*')
            .single();

        if (error) return respondWithServerError(res, error, 'upsertAdminOverride upsert');

        return res.json({ override: mapAdminOverride(data) });
    } catch (err) {
        return respondWithApplicationFetchError(res, err, 'upsertAdminOverride');
    }
};

/** GET admin review overrides for a candidate's grades (admin only). */
exports.getReviewOverrides = async (req, res) => {
    try {
        const resumeId = String(req.params.resumeId || '').trim();
        if (!resumeId) {
            return res.status(400).json({ error: 'resumeId is required' });
        }

        const payload = await fetchScoreboardApplicationPayload(resumeId);
        const reviewIds = (payload.scoring?.reviews || []).map(review => review.id);
        const overrideLookup = await fetchReviewOverridesByReviewIds(reviewIds);

        const overrides = reviewIds
            .map(reviewId => overrideLookup[reviewId])
            .filter(Boolean);

        return res.json({ overrides });
    } catch (err) {
        return respondWithApplicationFetchError(res, err, 'getReviewOverrides');
    }
};

/** UPSERT or clear admin override for a specific review (admin only). */
exports.upsertReviewOverride = async (req, res) => {
    try {
        const resumeId = String(req.params.resumeId || '').trim();
        const reviewId = String(req.params.reviewId || '').trim();
        if (!resumeId) {
            return res.status(400).json({ error: 'resumeId is required' });
        }
        if (!reviewId) {
            return res.status(400).json({ error: 'reviewId is required' });
        }

        const adminNotes = typeof req.body?.adminNotes === 'string' ? req.body.adminNotes.slice(0, 5000) : '';
        const rawScore = req.body?.overrideScore;
        const hasScore = rawScore !== undefined && rawScore !== null && rawScore !== '';

        const activeCycle = await getActiveCycleRow();
        const activeCycleId = activeCycle?.id || null;
        const resumeRound = activeCycleId
            ? await getResumeScreenRoundForCycle(activeCycleId)
            : null;

        if (!activeCycleId || !resumeRound) {
            return res.status(503).json({ error: 'No active resume screening cycle' });
        }

        const { data: reviewRow, error: reviewError } = await supabase
            .from('resume_reviews')
            .select(`
                id,
                resume_id,
                scores,
                rubric_snapshot,
                cycle_id,
                round_id,
                resumes (
                    cycle_id,
                    candidates ( year )
                )
            `)
            .eq('id', reviewId)
            .eq('resume_id', resumeId)
            .maybeSingle();

        if (reviewError) return respondWithServerError(res, reviewError, 'upsertReviewOverride review');
        if (!reviewRow) {
            return res.status(404).json({ error: 'Review not found for this candidate' });
        }
        if (reviewRow.cycle_id !== activeCycleId || reviewRow.round_id !== resumeRound.id) {
            return res.status(400).json({ error: 'Review is not part of the active resume screening round' });
        }

        const resume = firstRel(reviewRow.resumes);
        if (resume?.cycle_id !== activeCycleId) {
            return res.status(404).json({ error: 'Candidate is not in the active cycle' });
        }

        const candidateYear = firstRel(resume?.candidates)?.year;
        const reviewScoring = getReviewScoring(reviewRow, {
            rubricConfig: resumeRound.rubric_config,
            candidateYear,
        });

        let overrideScore = null;
        const maxAllowed = reviewScoring.maxScore
            || getRubricMaxScore(getRubricForYear(resumeRound.rubric_config, candidateYear));
        if (hasScore) {
            overrideScore = Number(rawScore);
            if (!Number.isFinite(overrideScore) || overrideScore < 0 || overrideScore > maxAllowed) {
                return res.status(400).json({ error: `overrideScore must be a number between 0 and ${maxAllowed}` });
            }
        }

        const adminUserId = req.user?.user_id;

        if (overrideScore === null && !adminNotes) {
            const { error: deleteError } = await supabase
                .from('resume_review_overrides')
                .delete()
                .eq('review_id', reviewId);

            if (deleteError) return respondWithServerError(res, deleteError, 'upsertReviewOverride delete');

            return res.json({ override: null });
        }

        if (overrideScore === null) {
            return res.status(400).json({ error: 'overrideScore is required when saving a grade override' });
        }

        const upsertPayload = {
            review_id: reviewId,
            admin_notes: adminNotes || null,
            override_score: overrideScore,
            override_scores: null,
            admin_user_id: adminUserId ?? null,
            updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
            .from('resume_review_overrides')
            .upsert(upsertPayload, { onConflict: 'review_id' })
            .select('*')
            .single();

        if (error) return respondWithServerError(res, error, 'upsertReviewOverride upsert');

        return res.json({ override: mapReviewOverride(data) });
    } catch (err) {
        return respondWithApplicationFetchError(res, err, 'upsertReviewOverride');
    }
};

// Gets admin-only grader scoreboard data
exports.getGraderScoreboard = async (req, res) => {
    try {
        const activeCycle = await getActiveCycleRow();
        const activeCycleId = activeCycle?.id || null;
        const resumeGraderGoal = resolveCycleGradingGoals(activeCycle).resumeGraderGoal;
        const resumeRound = activeCycleId
            ? await getResumeScreenRoundForCycle(activeCycleId)
            : null;

        const { data: users, error: userError } = await supabase
            .from('users')
            .select('user_id, email, role, first_name, last_name, created_at, last_login')
            .in('role', ['admin', 'member', 'board'])
            .order('first_name', { ascending: true });

        if (userError) throw userError;

        let reviewQuery = supabase
            .from('resume_reviews')
            .select(`
                id,
                graded_by,
                scores,
                notes,
                submitted_at,
                rubric_snapshot,
                normalized_score,
                resumes (
                    id,
                    name,
                    candidates ( year )
                )
            `)
            .not('graded_by', 'is', null);

        if (activeCycleId && resumeRound) {
            reviewQuery = reviewQuery
                .eq('cycle_id', activeCycleId)
                .eq('round_id', resumeRound.id);
        }

        const { data: reviews, error: reviewError } = await reviewQuery;

        if (reviewError) throw reviewError;

        const metricSet = new Set(getMetricsFromRubricConfig(resumeRound?.rubric_config));
        const maxPerCategory = resumeRound?.rubric_config?.maxPerCategory || 4;

        const graderMap = {};
        (users || []).forEach(user => {
            const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
            graderMap[user.user_id] = {
                id: user.user_id,
                name: name || user.email,
                email: user.email,
                role: user.role,
                createdAt: user.created_at,
                lastLogin: user.last_login,
                reviewCount: 0,
                totalScore: 0,
                totalNormalized: 0,
                categoryTotals: {},
                categoryCounts: {},
                reviews: [],
            };
        });

        (reviews || []).forEach(review => {
            const grader = graderMap[review.graded_by];
            if (!grader) return;

            const candidateYear = firstRel(review.resumes?.candidates)?.year;
            const scoring = getReviewScoring(review, {
                rubricConfig: resumeRound?.rubric_config,
                candidateYear,
            });
            scoring.metrics.forEach((metric) => metricSet.add(metric));

            const reviewScore = scoring.score;
            const reviewNormalized = scoring.normalizedScore ?? resolveReviewNormalizedValue(review, {
                rubricConfig: resumeRound?.rubric_config,
                candidateYear,
            });
            if (!Number.isFinite(reviewScore) || !Number.isFinite(reviewNormalized)) return;
            grader.reviewCount++;
            grader.totalScore += reviewScore;
            grader.totalNormalized += reviewNormalized;

            Object.entries(review.scores || {}).forEach(([metric, value]) => {
                const numericValue = Number(value) || 0;
                grader.categoryTotals[metric] = (grader.categoryTotals[metric] || 0) + numericValue;
                grader.categoryCounts[metric] = (grader.categoryCounts[metric] || 0) + 1;
            });

            grader.reviews.push({
                id: review.id,
                resumeId: review.resumes?.id || null,
                resumeName: review.resumes?.name || 'Unknown resume',
                scores: review.scores || {},
                score: reviewScore,
                normalizedScore: reviewNormalized,
                maxScore: scoring.maxScore,
                notes: review.notes || '',
                submittedAt: review.submitted_at,
            });
        });

        // Display only the current rubric's categories; the union carries retired categories
        // from older reviews' snapshots, which should not surface in the grader breakdown.
        const currentMetrics = getMetricsFromRubricConfig(resumeRound?.rubric_config);
        const metrics = currentMetrics.length ? currentMetrics : [...metricSet];

        const graders = Object.values(graderMap).map(grader => {
            const averageScore = grader.reviewCount > 0 ? grader.totalScore / grader.reviewCount : null;
            const averageNormalizedScore = grader.reviewCount > 0
                ? grader.totalNormalized / grader.reviewCount
                : null;
            const categoryScores = buildCategoryScores(grader.categoryTotals, grader.categoryCounts);

            const sortedReviews = grader.reviews.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

            return {
                id: grader.id,
                name: grader.name,
                email: grader.email,
                role: grader.role,
                createdAt: grader.createdAt,
                lastLogin: grader.lastLogin,
                reviewCount: grader.reviewCount,
                expectedReviews: grader.role === 'member' ? resumeGraderGoal : 0,
                progressScore: grader.role === 'member' ? Math.min(100, Math.round((grader.reviewCount / resumeGraderGoal) * 100)) : 0,
                averageScore: averageScore === null ? null : Number(averageScore.toFixed(1)),
                averageNormalizedScore: averageNormalizedScore === null
                    ? null
                    : Number(averageNormalizedScore.toFixed(1)),
                maxScore: 100,
                categoryScores,
                latestReviewAt: sortedReviews[0]?.submittedAt || null,
                reviews: sortedReviews,
            };
        });

        graders.sort((a, b) => {
            if (b.reviewCount !== a.reviewCount) return b.reviewCount - a.reviewCount;
            return a.name.localeCompare(b.name);
        });
        graders.forEach((grader, index) => grader.rank = index + 1);

        const totalReviews = graders.reduce((total, grader) => total + grader.reviewCount, 0);
        const activeGraders = graders.filter(grader => grader.reviewCount > 0).length;

        res.json({
            context: {
                cycle: activeCycle ? { id: activeCycle.id, name: activeCycle.name } : null,
                round: resumeRound ? { id: resumeRound.id, name: resumeRound.name } : null,
            },
            metrics,
            maxPerCategory,
            stats: {
                graders: graders.length,
                activeGraders,
                totalReviews,
                avgReviews: graders.length ? Number((totalReviews / graders.length).toFixed(1)) : 0,
                expectedReviews: resumeGraderGoal,
            },
            graders,
        });
    } catch (err) {
        return respondWithServerError(res, err, 'getGraderScoreboard');
    }
};

// Gets FRQ grader scoreboard data (FRQ grading is limited to admin + board)
exports.getFrqGraderScoreboard = async (req, res) => {
    try {
        const activeCycle = await getActiveCycleRow();
        const activeCycleId = activeCycle?.id || null;
        const frqGraderGoal = resolveCycleGradingGoals(activeCycle).frqGraderGoal;

        const { data: users, error: userError } = await supabase
            .from('users')
            .select('user_id, email, role, first_name, last_name, created_at, last_login')
            .in('role', ['admin', 'board'])
            .order('first_name', { ascending: true });

        if (userError) throw userError;

        let reviews = [];
        if (activeCycleId) {
            const { data, error: reviewError } = await supabase
                .from('frq_reviews')
                .select(`
                    id,
                    graded_by,
                    score,
                    notes,
                    submitted_at,
                    resumes (
                        id,
                        name
                    )
                `)
                .not('graded_by', 'is', null)
                .eq('cycle_id', activeCycleId);

            if (reviewError) throw reviewError;
            reviews = data || [];
        }

        const metrics = [FRQ_METRIC];
        const maxPerCategory = FRQ_MAX_SCORE;

        const graderMap = {};
        (users || []).forEach(user => {
            const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
            graderMap[user.user_id] = {
                id: user.user_id,
                name: name || user.email,
                email: user.email,
                role: user.role,
                createdAt: user.created_at,
                lastLogin: user.last_login,
                reviewCount: 0,
                totalScore: 0,
                totalNormalized: 0,
                categoryTotals: {},
                categoryCounts: {},
                reviews: [],
            };
        });

        (reviews || []).forEach(review => {
            const grader = graderMap[review.graded_by];
            if (!grader) return;

            const reviewScore = Number(review.score) || 0;
            const reviewNormalized = Number(((reviewScore / FRQ_MAX_SCORE) * 100).toFixed(2));

            grader.reviewCount++;
            grader.totalScore += reviewScore;
            grader.totalNormalized += reviewNormalized;
            grader.categoryTotals[FRQ_METRIC] = (grader.categoryTotals[FRQ_METRIC] || 0) + reviewScore;
            grader.categoryCounts[FRQ_METRIC] = (grader.categoryCounts[FRQ_METRIC] || 0) + 1;

            grader.reviews.push({
                id: review.id,
                resumeId: review.resumes?.id || null,
                resumeName: review.resumes?.name || 'Unknown resume',
                scores: { [FRQ_METRIC]: reviewScore },
                score: reviewScore,
                normalizedScore: reviewNormalized,
                maxScore: FRQ_MAX_SCORE,
                notes: review.notes || '',
                submittedAt: review.submitted_at,
            });
        });

        const graders = Object.values(graderMap).map(grader => {
            const averageScore = grader.reviewCount > 0 ? grader.totalScore / grader.reviewCount : null;
            const averageNormalizedScore = grader.reviewCount > 0
                ? grader.totalNormalized / grader.reviewCount
                : null;
            const categoryScores = buildCategoryScores(grader.categoryTotals, grader.categoryCounts);

            const sortedReviews = grader.reviews.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

            return {
                id: grader.id,
                name: grader.name,
                email: grader.email,
                role: grader.role,
                createdAt: grader.createdAt,
                lastLogin: grader.lastLogin,
                reviewCount: grader.reviewCount,
                expectedReviews: frqGraderGoal,
                progressScore: Math.min(100, Math.round((grader.reviewCount / frqGraderGoal) * 100)),
                averageScore: averageScore === null ? null : Number(averageScore.toFixed(1)),
                averageNormalizedScore: averageNormalizedScore === null
                    ? null
                    : Number(averageNormalizedScore.toFixed(1)),
                maxScore: 100,
                categoryScores,
                latestReviewAt: sortedReviews[0]?.submittedAt || null,
                reviews: sortedReviews,
            };
        });

        graders.sort((a, b) => {
            if (b.reviewCount !== a.reviewCount) return b.reviewCount - a.reviewCount;
            return a.name.localeCompare(b.name);
        });
        graders.forEach((grader, index) => grader.rank = index + 1);

        const totalReviews = graders.reduce((total, grader) => total + grader.reviewCount, 0);
        const activeGraders = graders.filter(grader => grader.reviewCount > 0).length;

        res.json({
            context: {
                cycle: activeCycle ? { id: activeCycle.id, name: activeCycle.name } : null,
                round: null,
            },
            metrics,
            maxPerCategory,
            stats: {
                graders: graders.length,
                activeGraders,
                totalReviews,
                avgReviews: graders.length ? Number((totalReviews / graders.length).toFixed(1)) : 0,
                expectedReviews: frqGraderGoal,
            },
            graders,
        });
    } catch (err) {
        return respondWithServerError(res, err, 'getFrqGraderScoreboard');
    }
};

// Signed-URL lookup for a candidate's synced headshot.
//
// This is the read path the whole storage migration exists for: it hands the
// browser a URL it fetches from Supabase's CDN directly, so the bytes never
// traverse this service. Proxying the object through here instead would rebuild
// the original problem against a new origin and save nothing.
exports.getCandidateHeadshotUrl = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('documents')
            .select('storage_path')
            .eq('candidate_id', req.params.candidateId)
            .eq('kind', 'headshot')
            .eq('sync_status', 'ready')
            .maybeSingle();

        if (error) return respondWithServerError(res, error, 'getCandidateHeadshotUrl');

        // Not synced yet (or failed): 404 tells the client to fall back to the
        // Drive proxy, so this ships safely before the queue has drained.
        if (!data?.storage_path) return res.status(404).json({ error: 'Headshot not synced' });

        const url = await getSignedUrl(data.storage_path);
        if (!url) return res.status(502).json({ error: 'Could not sign headshot URL' });

        return res.json({ url, expires_in: SIGNED_URL_TTL_SECONDS });
    } catch (err) {
        return respondWithServerError(res, err, 'getCandidateHeadshotUrl');
    }
};

// Heartbeat from the grading page while the grader is active, so their resume
// stays reserved past the short lease. `held: false` means another grader has
// since been given it.
exports.renewReviewClaim = async (req, res) => {
    const { kind, resume_id } = req.body || {};
    if (kind !== "resume" && kind !== "frq") {
        return res.status(400).json({ error: "kind must be resume or frq" });
    }
    if (!resume_id) return res.status(400).json({ error: "resume_id is required" });
    if (kind === "frq" && !canGradeFrq(req.user?.role)) {
        return res.status(403).json({ error: "Only board members can grade free responses" });
    }

    const screening = await requireOpenResumeRound();
    if (screening.error) return res.status(screening.status).json({ error: screening.error });

    try {
        const held = await renewReviewClaim({
            kind,
            cycleId: screening.cycle.id,
            graderId: req.user?.user_id,
            resumeId: resume_id,
        });
        return res.json({ held });
    } catch (error) {
        return respondWithServerError(res, error, "renewReviewClaim");
    }
};
