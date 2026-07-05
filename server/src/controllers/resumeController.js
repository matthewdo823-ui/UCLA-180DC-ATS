const supabase = require('../config/supabase');
const { extractDriveFileID, toDownloadURL, isGoogleDriveFileUrl } = require('../utils/drive');
const { streamDriveFileToResponse } = require('../utils/driveStream');
const {
    getActiveCycleId,
    getActiveCycleRow,
    getResumeScreenRoundForCycle,
    getRoundsForCycle,
    getActiveRoundForCycle,
    requireActiveResumeScreening,
} = require('../utils/cycleContext');
const {
    getRubricForYear,
    normalizeScreeningScoresInput,
    buildRubricSnapshot,
    computeRawScore,
    computeNormalizedScore,
    getMetricsFromRubricConfig,
    resolveReviewNormalizedValue,
} = require('../utils/rubric');
const { firstRel } = require('../utils/supabaseHelpers');
const { getUserName } = require('../utils/userDisplay');
const { respondWithServerError } = require('../utils/httpErrors');
const {
    normalizeRoundDecision,
    mapRoundDecision,
    buildDecisionLookup,
    resolveCandidateDecision,
    countDecisions,
    summarizeIncompleteDeliberation,
    buildDecisionsCsv,
} = require('../utils/roundDecisions');
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
const configuredGraderReviewGoal = Number(process.env.GRADER_REVIEW_GOAL);
const GRADER_REVIEW_GOAL = Number.isFinite(configuredGraderReviewGoal) && configuredGraderReviewGoal > 0
    ? configuredGraderReviewGoal
    : 30;
const VALID_REVIEW_DECISIONS = new Set(["pass", "flag", "reject"]);

function getReviewScore(scores = {}, metrics = null) {
    return computeRawScore(scores, metrics);
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
    const metrics = snapshot?.metrics || Object.keys(row.scores || {});
    const rawTotal = getReviewScore(row.scores || {}, metrics);
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
        rubricSnapshot: snapshot,
        metrics,
        total: rawTotal,
        maxScore: snapshot?.maxScore ?? null,
        normalizedScore: resolveReviewNormalizedValue(row, {
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

// Gets next resume row
exports.getNextResume = async (req, res) => {
    const gradedBy = req.user?.user_id;

    const screening = await requireActiveResumeScreening();
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

    let query = supabase
        .from('resumes')
        .select(`*,
            candidates(year)
        `)
        .eq('cycle_id', screening.cycle.id)
        .order('review_count', { ascending: true })
        .order('created_at', { ascending: true });

    if (reviewedResumeIds.length) {
        query = query.not('id', 'in', `(${reviewedResumeIds.join(',')})`);
    }

    const { data: resumeCandidates, error } = await query.limit(100);

    if (error) return respondWithServerError(res, error, 'getNextResume');

    for (const row of resumeCandidates || []) {
        if (reviewedResumeIdSet.has(row.id)) {
            continue;
        }

        if (!isGoogleDriveFileUrl(row.file_url)) {
            console.warn(`[getNextResume] Skipping resume ${row.id}: not a valid Google Drive URL`);
            continue;
        }

        const fileID = extractDriveFileID(row.file_url);
        return res.json({
            ...row,
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
            candidates ( year, cycle_id )
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
    const screening = await requireActiveResumeScreening();
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

    const screening = await requireActiveResumeScreening();
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

    const screening = await requireActiveResumeScreening();
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

    return res.json({ success: true });
};

/** Reviews submitted by the authenticated screener (JWT → req.user.user_id / graded_by). */
exports.listMyReviews = async (req, res) => {
    const gradedBy = req.user?.user_id;
    if (!gradedBy) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const activeCycleId = await getActiveCycleId();
    const resumeRound = activeCycleId
        ? await getResumeScreenRoundForCycle(activeCycleId)
        : null;
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
        .order("submitted_at", { ascending: false });

    if (activeCycleId) {
        reviewQuery = reviewQuery.eq("cycle_id", activeCycleId);
    }

    const { data, error } = await reviewQuery;

    if (error) return respondWithServerError(res, error, 'listMyReviews');

    const reviews = (data || []).map((row) => mapMyReviewRow(row, rubricConfig));

    return res.json({
        reviews,
        count: reviews.length,
        expectedReviews: GRADER_REVIEW_GOAL,
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

    const screening = await requireActiveResumeScreening();
    if (screening.error) {
        return res.status(screening.status).json({ error: screening.error });
    }

    const snapshot = existing.rubric_snapshot;
    const candidate = firstRel(firstRel(existing.resumes)?.candidates);
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

exports.createCandidateFlag = async (req, res) => {
    const { candidate_id, resume_id, reason } = req.body;

    try {
        const activeCycleId = await getActiveCycleId();
        if (!activeCycleId) {
            return res.status(503).json({ error: "No active recruiting cycle" });
        }

        let candidateId = candidate_id;

        if (!candidateId && resume_id) {
            const { data, error } = await supabase
                .from('resumes')
                .select('candidate_id')
                .eq('id', resume_id)
                .maybeSingle();

            if (error) return respondWithServerError(res, error, 'createCandidateFlag resume lookup');
            if (!data) {
                return res.status(404).json({ error: "Resume not found" });
            }
            candidateId = data.candidate_id;
        }

        if (!candidateId) {
            return res.status(400).json({ error: "candidate_id or a linked resume_id is required" });
        }

        const { data: candidate, error: candidateError } = await supabase
            .from('candidates')
            .select('id, cycle_id')
            .eq('id', candidateId)
            .maybeSingle();

        if (candidateError) return respondWithServerError(res, candidateError, 'createCandidateFlag candidate lookup');
        if (!candidate) {
            return res.status(404).json({ error: "Candidate not found" });
        }
        if (candidate.cycle_id !== activeCycleId) {
            return res.status(400).json({ error: "Candidate is not in the active cycle" });
        }

        const { data, error } = await supabase
            .from('candidate_flags')
            .insert({
                candidate_id: candidateId,
                resume_id: resume_id || null,
                flagged_by: req.user?.user_id,
                reason: reason || "Flagged for admin review",
            })
            .select('id')
            .single();

        if (error) return respondWithServerError(res, error, 'createCandidateFlag insert');

        return res.status(201).json({ success: true, flag: data });
    } catch (err) {
        return respondWithServerError(res, err, 'createCandidateFlag');
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

function sendDriveProxyError(res, err, label) {
    console.error(`Proxy error (${label}):`, err.message);
    if (err.code === 'INVALID_URL' || err.code === 'DRIVE_INACCESSIBLE') {
        return res.status(404).send(err.message);
    }
    const upstreamStatus = err.response?.status;
    if (upstreamStatus === 404) {
        return res.status(404).send('Drive file not found');
    }
    return res.status(502).send(`Error fetching ${label} from Drive`);
}

// Reverse proxy for image streaming (streams drive image to frontend)
exports.viewImage = async (req, res) => {
    const fileUrl = req.query.url;
    if (!fileUrl) return res.status(400).send("No URL provided");
    if (!isGoogleDriveFileUrl(fileUrl)) {
        return res.status(400).send("Only Google Drive image URLs are allowed");
    }

    try {
        await streamDriveFileToResponse(fileUrl, res, { fallbackContentType: 'image/jpeg' });
    } catch (err) {
        sendDriveProxyError(res, err, 'image');
    }
};

// Reverse proxy for file streaming (streams drive pdf to frontend)
exports.viewPdf = async (req, res) => {
    const fileUrl = req.query.url;
    if (!fileUrl) return res.status(400).send("No URL provided");
    if (!isGoogleDriveFileUrl(fileUrl)) {
        return res.status(400).send("Only Google Drive PDF URLs are allowed");
    }

    try {
        await streamDriveFileToResponse(fileUrl, res, { fallbackContentType: 'application/pdf' });
    } catch (err) {
        sendDriveProxyError(res, err, 'pdf');
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
        const activeCycle = await getActiveCycleRow();
        const activeCycleId = activeCycle?.id || null;
        const cycleRounds = activeCycleId ? await getRoundsForCycle(activeCycleId) : [];
        const {
            resumeRound,
            deliberationRound: activeDeliberationRound,
            activeRound,
            nextRound: activeNextRound,
        } = resolveDeliberationRounds(cycleRounds);

        let deliberationRound = activeDeliberationRound;
        let viewingHistorical = false;

        if (requestedRoundId) {
            const requestedRound = cycleRounds.find((r) => r.id === requestedRoundId) || null;
            if (!requestedRound) {
                return res.status(404).json({ error: "Round not found in this cycle" });
            }
            deliberationRound = requestedRound;
            viewingHistorical = requestedRound.id !== activeRound?.id;
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
        const canDeliberate = !viewingHistorical && deliberationRound.status === "active";

        const { data: resumes, error: resumeError } = await supabase
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
            .order('created_at', { ascending: true });

        if (resumeError) throw resumeError;

        const { data: cycleCandidates, error: cycleCandError } = await supabase
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
            .eq("cycle_id", activeCycleId);

        if (cycleCandError) throw cycleCandError;

        const candidateLinkLookups = buildCandidateLinkLookups(cycleCandidates);

        const { data: roundDecisionRows, error: decisionError } = await supabase
            .from('round_decisions')
            .select('*')
            .eq('cycle_id', activeCycleId)
            .eq('round_id', deliberationRound.id);

        if (decisionError) throw decisionError;

        const decisionLookup = buildDecisionLookup(roundDecisionRows);

        const priorRoundDecisionRows = await loadPriorRoundDecisionRows(
            activeCycleId,
            deliberationRound,
            cycleRounds
        );

        const { data: reviews, error: reviewError } = await supabase
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
            .eq('round_id', resumeRound.id);
            
        if (reviewError) throw reviewError;

        const gradedByUserLookup = await getGradedByUserLookup((reviews || []).map(review => review.graded_by));

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

            const snapshot = review.rubric_snapshot || null;
            const metrics = snapshot?.metrics || Object.keys(review.scores || {});
            metrics.forEach((metric) => metricSet.add(metric));

            const candidateYear = firstRel(review.resumes?.candidates)?.year;
            const reviewScore = getReviewScore(review.scores, metrics);
            const reviewNormalized = resolveReviewNormalizedValue(review, {
                rubricConfig: resumeRound.rubric_config,
                candidateYear,
            });

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
                maxScore: snapshot?.maxScore ?? null,
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
            const normalizedScore = c.numReviews > 0 ? c.totalNormalized / c.numReviews : null;
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
                pronouns: c.pronouns,
                linkedin: c.linkedin,
                gm: c.gm,
                newbieTraining: c.newbieTraining,
                headshot: c.headshot || '',
                aggregateScore: aggregateScore === null ? null : Number(aggregateScore.toFixed(1)),
                normalizedScore: normalizedScore === null ? null : Number(normalizedScore.toFixed(1)),
                maxScore: null,
                categoryScores,
                numReviews: c.numReviews,
                reviews: c.reviews.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt)),
                score: normalizedScore === null ? null : Math.round(normalizedScore),
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
            reviewOverrideLookup
        );

        candidatesWithOverrides.sort((a, b) => {
            if (a.score === null && b.score === null) {
                return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
            }
            if (a.score === null) return 1;
            if (b.score === null) return -1;
            return b.score - a.score;
        });
        candidatesWithOverrides.forEach((c, index) => { c.rank = index + 1; });

        const totalReviewed = candidatesWithOverrides.filter(c => c.numReviews > 0).length;
        const avgScore = reviewCount > 0 ? (totalNormalizedSum / reviewCount).toFixed(1) : 0;
        const decisionCounts = countDecisions(candidatesWithOverrides);
        const incompleteSummary = summarizeIncompleteDeliberation(candidatesWithOverrides);
        const undecidedCount = decisionCounts.pending + decisionCounts.hold;
        const canCloseRound = canDeliberate && incompleteSummary.incompleteCount === 0 && candidatesWithOverrides.length > 0;

        let notification = null;
        if (req.user?.role === "admin") {
            const template = await resolveAdvanceNotificationForRound(
                deliberationRound,
                activeCycle,
                cycleRounds
            );
            const lastBatch = await fetchLatestAdvanceBatch(deliberationRound.id);
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
            },
            metrics,
            maxPerCategory,
            stats: {
                applicants: candidatesWithOverrides.length,
                reviewed: totalReviewed,
                advanced: decisionCounts.advance,
                hold: decisionCounts.hold,
                rejected: decisionCounts.reject,
                pending: decisionCounts.pending,
                avgScore: avgScore,
            },
            candidates: candidatesWithOverrides
        });

    } catch (err) {
        return respondWithServerError(res, err, 'getScoreboard');
    }
};

exports.upsertRoundDecision = async (req, res) => {
    const candidateIdInput = String(req.body?.candidate_id || "").trim();
    const resumeIdInput = String(req.body?.resume_id || "").trim();
    const decision = normalizeRoundDecision(req.body?.decision);
    const notes = typeof req.body?.notes === "string" ? req.body.notes.slice(0, 1000) : "";
    const decidedBy = req.user?.user_id;

    try {
        const activeCycle = await getActiveCycleRow();
        if (!activeCycle?.id) {
            return res.status(503).json({ error: "No active recruiting cycle" });
        }

        const resumeRound = await getResumeScreenRoundForCycle(activeCycle.id);
        if (!resumeRound) {
            return res.status(503).json({ error: "No resume screening round for this cycle" });
        }

        const activeRound = await getActiveRoundForCycle(activeCycle.id);
        if (!activeRound) {
            return res.status(503).json({
                error: "No active round — activate a round in Cycle Management before saving deliberation decisions.",
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
            decision: mapRoundDecision(data, { provisional: activeRound.status === "active" }),
        });
    } catch (err) {
        return respondWithServerError(res, err, "upsertRoundDecision");
    }
};

exports.exportScoreboardDecisions = async (req, res) => {
    const rawFilter = String(req.query?.decision || "all").trim().toLowerCase();
    const allowed = new Set(["all", "advance", "hold", "reject", "pending"]);
    const exportFilter = allowed.has(rawFilter) ? rawFilter : "all";

    try {
        const activeCycle = await getActiveCycleRow();
        const activeCycleId = activeCycle?.id || null;
        const cycleRounds = activeCycleId ? await getRoundsForCycle(activeCycleId) : [];
        const { resumeRound, deliberationRound } = resolveDeliberationRounds(cycleRounds);

        if (!activeCycleId || !resumeRound || !deliberationRound) {
            return res.status(503).json({ error: "No active resume screening cycle" });
        }

        const { data: resumes, error: resumeError } = await supabase
            .from("resumes")
            .select(`
                id,
                name,
                candidate_id,
                file_url,
                candidates ( id, email, major, year, gpa )
            `)
            .eq("cycle_id", activeCycleId);

        if (resumeError) return respondWithServerError(res, resumeError, "exportScoreboardDecisions resumes");

        const { data: cycleCandidates, error: cycleCandError } = await supabase
            .from("candidates")
            .select("id, name, email, major, year, gpa, resume_file_url")
            .eq("cycle_id", activeCycleId);

        if (cycleCandError) return respondWithServerError(res, cycleCandError, "exportScoreboardDecisions candidates");

        const candidateLinkLookups = buildCandidateLinkLookups(cycleCandidates);

        const { data: roundDecisionRows, error: decisionError } = await supabase
            .from("round_decisions")
            .select("*")
            .eq("cycle_id", activeCycleId)
            .eq("round_id", deliberationRound.id);

        if (decisionError) return respondWithServerError(res, decisionError, "exportScoreboardDecisions decisions");

        const decisionLookup = buildDecisionLookup(roundDecisionRows);

        const priorRoundDecisionRows = await loadPriorRoundDecisionRows(
            activeCycleId,
            deliberationRound,
            cycleRounds
        );

        const { data: reviews, error: reviewError } = await supabase
            .from("resume_reviews")
            .select("resume_id, normalized_score, rubric_snapshot, scores")
            .eq("cycle_id", activeCycleId)
            .eq("round_id", resumeRound.id);

        if (reviewError) return respondWithServerError(res, reviewError, "exportScoreboardDecisions reviews");

        const reviewsByResume = {};
        (reviews || []).forEach((review) => {
            if (!reviewsByResume[review.resume_id]) reviewsByResume[review.resume_id] = [];
            reviewsByResume[review.resume_id].push(review);
        });

        const exportRows = (resumes || []).map((resume) => {
            const embedded = firstRel(resume.candidates) || {};
            const linked = applyResumeCandidateLink(resume, embedded, candidateLinkLookups);
            const resumeReviews = reviewsByResume[resume.id] || [];
            const normalizedScores = resumeReviews
                .map((review) => resolveReviewNormalizedValue(review, {
                    rubricConfig: resumeRound.rubric_config,
                    candidateYear: linked.year,
                }))
                .filter((v) => Number.isFinite(v));
            const avgScore = normalizedScores.length
                ? Math.round(normalizedScores.reduce((a, b) => a + b, 0) / normalizedScores.length)
                : null;

            return {
                candidateId: linked.candidateId,
                name: resume.name || "Unknown",
                email: linked.email,
                phoneNumber: linked.phoneNumber,
                major: linked.major,
                year: linked.year,
                gpa: linked.gpa,
                score: avgScore,
                numReviews: resumeReviews.length,
                decision: resolveCandidateDecision(linked.candidateId, decisionLookup),
            };
        });

        const filteredExportRows = filterCandidatesForDeliberationRound(exportRows, {
            deliberationRound,
            priorDecisionRows: priorRoundDecisionRows,
        });

        const csv = buildDecisionsCsv(filteredExportRows, { decisionFilter: exportFilter });
        const suffix = exportFilter === "all" ? "all" : exportFilter;
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="scoreboard-decisions-${suffix}.csv"`);
        return res.send(csv);
    } catch (err) {
        return respondWithServerError(res, err, "exportScoreboardDecisions");
    }
};

function mapApplicationCandidate(candidate) {
    if (!candidate) return null;
    return {
        id: candidate.id,
        name: candidate.name || '',
        email: candidate.email || '',
        phoneNumber: candidate.phone_number || '',
        major: candidate.major || '',
        gpa: candidate.gpa || '',
        year: candidate.year || '',
        pronouns: candidate.pronouns || '',
        urm: candidate.urm || '',
        linkedin: candidate.linkedin || '',
        gm: candidate.gm || '',
        newbieTraining: candidate.newbie_training || '',
        whyConsulting: candidate.why_consulting || '',
        why180dc: candidate.why_180dc || '',
        whySocialImpact: candidate.why_social_impact || '',
        extenuatingCircumstances: candidate.extenuating_circumstances || '',
        headshot: candidate.headshot || '',
        resumeFileUrl: candidate.resume_file_url || '',
        appliedAt: candidate.created_at || null,
    };
}

async function fetchScoreboardApplicationPayload(resumeId) {
    const activeCycle = await getActiveCycleRow();
    const activeCycleId = activeCycle?.id || null;
    const resumeRound = activeCycleId
        ? await getResumeScreenRoundForCycle(activeCycleId)
        : null;

    if (!activeCycleId || !resumeRound) {
        const err = new Error('No active resume screening cycle');
        err.statusCode = 503;
        throw err;
    }

    const { data: resumeRow, error: resumeError } = await supabase
        .from('resumes')
        .select(`
            id,
            name,
            file_url,
            review_count,
            created_at,
            cycle_id,
            candidates (
                id,
                name,
                email,
                phone_number,
                major,
                gpa,
                year,
                pronouns,
                urm,
                linkedin,
                gm,
                newbie_training,
                why_consulting,
                why_180dc,
                why_social_impact,
                extenuating_circumstances,
                headshot,
                resume_file_url,
                created_at,
                cycle_id
            )
        `)
        .eq('id', resumeId)
        .maybeSingle();

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
        const err = new Error('Candidate is not in the active cycle');
        err.statusCode = 404;
        throw err;
    }

    const candidate = firstRel(resumeRow.candidates);
    if (!candidate || candidate.cycle_id !== activeCycleId) {
        const err = new Error('Candidate is not in the active cycle');
        err.statusCode = 404;
        throw err;
    }

    const { data: reviews, error: reviewError } = await supabase
        .from('resume_reviews')
        .select('id, scores, notes, submitted_at, graded_by, rubric_snapshot, decision')
        .eq('resume_id', resumeId)
        .eq('cycle_id', activeCycleId)
        .eq('round_id', resumeRound.id)
        .order('submitted_at', { ascending: true });

    if (reviewError) {
        const err = new Error(reviewError.message || 'Failed to load reviews');
        err.cause = reviewError;
        throw err;
    }

    const gradedByUserLookup = await getGradedByUserLookup((reviews || []).map(review => review.graded_by));
    const metricSet = new Set(getMetricsFromRubricConfig(resumeRound.rubric_config));
    const categoryTotals = {};
    const categoryCounts = {};
    let totalScore = 0;
    let totalNormalized = 0;

    const mappedReviews = (reviews || []).map(review => {
        const snapshot = review.rubric_snapshot || null;
        const metrics = snapshot?.metrics || Object.keys(review.scores || {});
        metrics.forEach((metric) => metricSet.add(metric));

        const reviewScore = getReviewScore(review.scores, metrics);
        const reviewNormalized = resolveReviewNormalizedValue(review, {
            rubricConfig: resumeRound.rubric_config,
            candidateYear: candidate.year,
        });

        totalScore += reviewScore;
        totalNormalized += reviewNormalized;

        Object.entries(review.scores || {}).forEach(([metric, value]) => {
            const numericValue = Number(value) || 0;
            categoryTotals[metric] = (categoryTotals[metric] || 0) + numericValue;
            categoryCounts[metric] = (categoryCounts[metric] || 0) + 1;
        });

        const graderFromUsers = review.graded_by != null ? gradedByUserLookup[review.graded_by] : null;

        return {
            id: review.id,
            scores: review.scores || {},
            score: reviewScore,
            normalizedScore: reviewNormalized,
            maxScore: snapshot?.maxScore ?? null,
            decision: review.decision || 'pass',
            reviewerName: graderFromUsers?.name || null,
            reviewerEmail: graderFromUsers?.email || null,
            notes: review.notes || '',
            submittedAt: review.submitted_at,
        };
    });

    const numReviews = mappedReviews.length;
    const aggregateScore = numReviews > 0 ? Number((totalScore / numReviews).toFixed(1)) : null;
    const normalizedScore = numReviews > 0 ? Number((totalNormalized / numReviews).toFixed(1)) : null;
    const resumeFileUrl = resumeRow.file_url || candidate.resume_file_url || '';

    const reviewOverrideLookup = await fetchReviewOverridesByReviewIds(mappedReviews.map(r => r.id));
    const candidateWithOverrides = applyReviewOverridesToCandidate(
        {
            reviews: mappedReviews,
            aggregateScore,
            normalizedScore,
            score: normalizedScore === null ? null : Math.round(normalizedScore),
            numReviews,
        },
        reviewOverrideLookup
    );

    return {
        context: {
            cycle: { id: activeCycle.id, name: activeCycle.name },
            round: { id: resumeRound.id, name: resumeRound.name },
        },
        resume: {
            id: resumeRow.id,
            name: resumeRow.name || candidate.name || 'Unknown',
            fileUrl: resumeFileUrl,
            reviewCount: resumeRow.review_count ?? numReviews,
            submittedAt: resumeRow.created_at,
        },
        candidate: mapApplicationCandidate(candidate),
        candidateId: candidate.id,
        resumeRoundId: resumeRound.id,
        activeCycleId,
        scoring: {
            metrics: [...metricSet],
            maxPerCategory: resumeRound.rubric_config?.maxPerCategory || 4,
            numReviews: candidateWithOverrides.numReviews,
            aggregateScore: candidateWithOverrides.aggregateScore,
            normalizedScore: candidateWithOverrides.normalizedScore,
            score: candidateWithOverrides.score,
            categoryScores: buildCategoryScores(categoryTotals, categoryCounts),
            reviews: candidateWithOverrides.reviews,
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

        const payload = await fetchScoreboardApplicationPayload(resumeId);

        // Fetch admin override and apply to scoring
        const adminOverrideRow = await fetchAdminOverride(
            payload.candidateId,
            payload.activeCycleId,
            payload.resumeRoundId
        );
        const adminOverride = mapAdminOverride(adminOverrideRow);
        if (adminOverride) {
            applyAdminOverrideToScoring(payload.scoring, adminOverride);
        }

        const { candidateId, resumeRoundId, activeCycleId, ...responseBody } = payload;
        return res.json({
            ...responseBody,
            adminOverride,
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

        const payload = await fetchScoreboardApplicationPayload(resumeId);

        const { data: roundDecisionRow, error: decisionError } = await supabase
            .from('round_decisions')
            .select('decision, notes, updated_at')
            .eq('cycle_id', payload.activeCycleId)
            .eq('round_id', payload.resumeRoundId)
            .eq('candidate_id', payload.candidateId)
            .maybeSingle();

        if (decisionError) {
            return respondWithServerError(res, decisionError, 'getScoreboardApplicationSummary decision');
        }

        const roundDecision = roundDecisionRow
            ? {
                decision: roundDecisionRow.decision,
                notes: roundDecisionRow.notes || '',
                updatedAt: roundDecisionRow.updated_at || null,
            }
            : null;

        const summaryResult = await resolveCandidateSummary(supabase, {
            resumeId,
            candidateId: payload.candidateId,
            cycleId: payload.activeCycleId,
            roundId: payload.resumeRoundId,
            applicationPayload: {
                candidate: payload.candidate,
                scoring: payload.scoring,
                context: payload.context,
                roundDecision,
            },
            roundDecision,
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
    const overridden = Number(adminOverride.overrideScore);
    scoring.normalizedScore = overridden;
    scoring.score = Math.round(overridden);
    scoring.aggregateScore = null; // clear raw aggregate — not meaningful alongside override
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

        if (overrideScore !== null && (!Number.isFinite(overrideScore) || overrideScore < 0 || overrideScore > 100)) {
            return res.status(400).json({ error: 'overrideScore must be a number between 0 and 100' });
        }

        const payload = await fetchScoreboardApplicationPayload(resumeId);
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
        const overrideScore = rawScore != null && rawScore !== '' ? Number(rawScore) : null;

        if (overrideScore !== null && (!Number.isFinite(overrideScore) || overrideScore < 0 || overrideScore > 100)) {
            return res.status(400).json({ error: 'overrideScore must be a number between 0 and 100' });
        }

        const payload = await fetchScoreboardApplicationPayload(resumeId);
        const review = (payload.scoring?.reviews || []).find(row => row.id === reviewId);
        if (!review) {
            return res.status(404).json({ error: 'Review not found for this candidate' });
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

        const upsertPayload = {
            review_id: reviewId,
            admin_notes: adminNotes || null,
            override_score: overrideScore,
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
        const resumeRound = activeCycleId
            ? await getResumeScreenRoundForCycle(activeCycleId)
            : null;

        const { data: users, error: userError } = await supabase
            .from('users')
            .select('user_id, email, role, first_name, last_name, created_at, last_login')
            .in('role', ['admin', 'member'])
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

            const snapshot = review.rubric_snapshot || null;
            const metrics = snapshot?.metrics || Object.keys(review.scores || {});
            metrics.forEach((metric) => metricSet.add(metric));

            const candidateYear = firstRel(review.resumes?.candidates)?.year;
            const reviewScore = getReviewScore(review.scores, metrics);
            const reviewNormalized = resolveReviewNormalizedValue(review, {
                rubricConfig: resumeRound?.rubric_config,
                candidateYear,
            });
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
                notes: review.notes || '',
                submittedAt: review.submitted_at,
            });
        });

        const metrics = [...metricSet];

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
                expectedReviews: GRADER_REVIEW_GOAL,
                progressScore: Math.min(100, Math.round((grader.reviewCount / GRADER_REVIEW_GOAL) * 100)),
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
                expectedReviews: GRADER_REVIEW_GOAL,
            },
            graders,
        });
    } catch (err) {
        return respondWithServerError(res, err, 'getGraderScoreboard');
    }
};
