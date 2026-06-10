const supabase = require('../config/supabase');
const axios = require('axios');
const { extractDriveFileID, toDownloadURL } = require('../utils/drive');
const {
    getActiveCycleId,
    getActiveCycleRow,
    getResumeScreenRoundForCycle,
    requireActiveResumeScreening,
} = require('../utils/cycleContext');
const {
    getRubricForYear,
    normalizeScreeningScoresInput,
    buildRubricSnapshot,
    computeRawScore,
    computeNormalizedScore,
    getMetricsFromRubricConfig,
    getLegacyNormalizedScore,
} = require('../utils/rubric');
const configuredGraderReviewGoal = Number(process.env.GRADER_REVIEW_GOAL);
const GRADER_REVIEW_GOAL = Number.isFinite(configuredGraderReviewGoal) && configuredGraderReviewGoal > 0
    ? configuredGraderReviewGoal
    : 30;
const REVIEWER_NAME_FIELDS = [
    "name",
    "full_name",
    "first_name",
    "last_name",
    "reviewer_name",
    "reviewer",
    "reviewed_by",
    "reviewer_email",
    "user_email",
    "user_name",
    "created_by_name",
    "created_by",
    "user_id"
];
const REVIEWER_EMAIL_FIELDS = ["email", "reviewer_email", "user_email"];
const REVIEWER_JOIN_TABLES = ["reviewers", "resume_reviewers", "review_assignments"];
const REVIEWER_REVIEW_ID_FIELDS = ["review_id", "resume_review_id", "resume_reviews_id"];
const VALID_REVIEW_DECISIONS = new Set(["pass", "flag", "reject"]);

function getReviewerName(review) {
    if (review.first_name || review.last_name) {
        return [review.first_name, review.last_name].filter(Boolean).join(" ");
    }

    for (const field of REVIEWER_NAME_FIELDS) {
        if (review[field]) return review[field];
    }

    return null;
}

function getReviewerEmail(review) {
    for (const field of REVIEWER_EMAIL_FIELDS) {
        if (review[field]) return review[field];
    }

    return null;
}

function getReviewScore(scores = {}, metrics = null) {
    return computeRawScore(scores, metrics);
}

function getReviewNormalizedValue(review) {
    if (Number.isFinite(Number(review?.normalized_score))) {
        return Number(review.normalized_score);
    }
    const snapshot = review?.rubric_snapshot;
    if (snapshot) {
        return computeNormalizedScore(review.scores || {}, snapshot);
    }
    return getLegacyNormalizedScore(review?.scores || {});
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

function firstRel(rel) {
    if (rel == null) return null;
    return Array.isArray(rel) ? rel[0] : rel;
}

function mapMyReviewRow(row) {
    const resume = firstRel(row.resumes);
    const cand = firstRel(resume?.candidates);
    const snapshot = row.rubric_snapshot || null;
    const metrics = snapshot?.metrics || Object.keys(row.scores || {});
    const rawTotal = getReviewScore(row.scores || {}, metrics);
    return {
        reviewId: row.id,
        id: row.resume_id,
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
        normalizedScore: getReviewNormalizedValue(row),
        decision: row.decision || "pass",
        notes: row.notes || "",
        submittedAt: row.submitted_at,
    };
}

function getUserName(user = {}) {
    return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email || null;
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

async function getReviewerLookup(reviewIds) {
    const lookup = {};
    if (!reviewIds.length) return lookup;

    for (const table of REVIEWER_JOIN_TABLES) {
        for (const reviewIdField of REVIEWER_REVIEW_ID_FIELDS) {
            const { data, error } = await supabase
                .from(table)
                .select('*')
                .in(reviewIdField, reviewIds);

            if (error) continue;

            (data || []).forEach(row => {
                const reviewId = row[reviewIdField];
                if (!reviewId || lookup[reviewId]) return;

                lookup[reviewId] = {
                    name: getReviewerName(row),
                    email: getReviewerEmail(row)
                };
            });

            if (Object.keys(lookup).length) return lookup;
        }
    }

    return lookup;
}

// Gets next resume row
exports.getNextResume = async (req, res) => {
    console.log("HIT /next-resume");

    const screening = await requireActiveResumeScreening();
    if (screening.error) {
        return res.status(screening.status).json({ error: screening.error });
    }

    const { data, error } = await supabase
        .from('resumes')
        .select(`*,
            candidates(year)
        `)
        .eq('cycle_id', screening.cycle.id)
        .order('review_count', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    console.log("DATA:", data);
    console.log("ERROR:", error);

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "No resumes found for the active cycle" });

    const fileID = extractDriveFileID(data.file_url);

    if (!fileID) {
        return res.status(400).json({ error: "Could not parse Google Drive ID" });
    }

    const accessable_file_url = toDownloadURL(fileID);

    console.log("abouta pass file url: " + accessable_file_url);
    return res.json({
        ...data,
        "file_url": accessable_file_url
    });
};

// Saves review 
exports.saveReview = async (req, res) => {
    const { resume_id, scores, notes, decision } = req.body;
    const gradedBy = req.user?.user_id;
    const normalizedDecision = VALID_REVIEW_DECISIONS.has(decision) ? decision : "pass";

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

    if (resumeError) return res.status(500).json({ error: resumeError.message });
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

    let flaggedResume = null;
    if (normalizedDecision === "flag") {
        if (!resumeRow.candidate_id) {
            return res.status(400).json({ error: "Flagged resume is not linked to a candidate" });
        }
        flaggedResume = { id: resumeRow.id, candidate_id: resumeRow.candidate_id };
    }

    const { error: reviewError } = await supabase
        .from('resume_reviews')
        .insert({
            resume_id,
            scores: normalizedScores,
            notes,
            decision: normalizedDecision,
            graded_by: gradedBy,
            cycle_id: screening.cycle.id,
            round_id: screening.round.id,
            rubric_snapshot: rubricSnapshot,
            normalized_score: normalizedScore,
        });

    if (reviewError) return res.status(500).json({ error: reviewError.message });

    // increment
    const { error: countError } = await supabase.rpc(
        'increment_review_count', { resume_id_input: resume_id }
    );

    if (countError) return res.status(500).json({ error: countError.message });

    if (flaggedResume) {
        const { error: flagError } = await supabase
            .from('candidate_flags')
            .insert({
                candidate_id: flaggedResume.candidate_id,
                resume_id: flaggedResume.id,
                flagged_by: gradedBy,
                reason: notes || "Flagged during resume review",
            });

        if (flagError) return res.status(500).json({ error: flagError.message });
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

    if (error) return res.status(500).json({ error: error.message });

    const reviews = (data || []).map(mapMyReviewRow);

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

    if (fetchError) return res.status(500).json({ error: fetchError.message });
    if (!existing) {
        return res.status(404).json({ error: "Review not found" });
    }

    const snapshot = existing.rubric_snapshot;
    const candidate = firstRel(firstRel(existing.resumes)?.candidates);
    const rubricForYear = snapshot
        ? {
            metrics: snapshot.metrics || [],
            maxPerCategory: snapshot.maxPerCategory || 4,
        }
        : getRubricForYear(null, candidate?.year);

    const { scores: normalizedScores, error: normErr } = normalizeScreeningScoresInput(scores, rubricForYear);
    if (normErr) {
        return res.status(400).json({ error: normErr });
    }

    const rubricSnapshot = snapshot || buildRubricSnapshot(null, candidate?.year);
    const normalizedScore = computeNormalizedScore(normalizedScores, rubricSnapshot);

    let flaggedResume = null;
    if (normalizedDecision === "flag" && existing.decision !== "flag") {
        const { data: resumeRow, error: resumeErr } = await supabase
            .from("resumes")
            .select("id, candidate_id")
            .eq("id", existing.resume_id)
            .maybeSingle();

        if (resumeErr) return res.status(500).json({ error: resumeErr.message });
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

    if (updateError) return res.status(500).json({ error: updateError.message });

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
                return res.status(500).json({ error: flagError.message });
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

    if (readError) return res.status(500).json({ error: readError.message });
    if (!row) return res.status(500).json({ error: "Failed to load updated review" });

    return res.json({ review: mapMyReviewRow(row) });
};

exports.createCandidateFlag = async (req, res) => {
    const { candidate_id, resume_id, reason } = req.body;
    let candidateId = candidate_id;

    if (!candidateId && resume_id) {
        const { data, error } = await supabase
            .from('resumes')
            .select('candidate_id')
            .eq('id', resume_id)
            .maybeSingle();

        if (error) return res.status(500).json({ error: error.message });
        candidateId = data?.candidate_id;
    }

    if (!candidateId) {
        return res.status(400).json({ error: "candidate_id or a linked resume_id is required" });
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

    if (error) return res.status(500).json({ error: error.message });

    return res.status(201).json({ success: true, flag: data });
};

exports.getCandidateFlags = async (req, res) => {
    try {
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
                candidates (
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
                    extenuating_circumstances
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
        console.error("Candidate flags error:", err);
        return res.status(500).json({ error: err.message });
    }
};

exports.resolveCandidateFlag = async (req, res) => {
    const { data, error } = await supabase
        .from('candidate_flags')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .select('id, status, resolved_at')
        .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Flag not found" });

    return res.json({ success: true, flag: data });
};

// Gets file link from resume 
exports.getResumeFile = async (req, res) => {
    const { data, error } = await supabase
        .from('resumes')
        .select('file_url')
        .eq('id', req.params.id)
        .single();

    if (error) return res.status(404).json({ error: error.message });

    const fileID = extractDriveFileID(data.file_url);

    if (!fileID) {
        return res.status(400).json({ error: "Could not parse Google Drive ID" });
    }

    const accessable_file_url = toDownloadURL(fileID);

    return res.json({
        ...data,
        "file_url": accessable_file_url
    });
};

// Reverse proxy for file streaming (streams drive pdf to frontend)
exports.viewPdf = async (req, res) => {
    const fileUrl = req.query.url;
    if (!fileUrl) return res.status(400).send("No URL provided");
    try {
        const response = await axios({
            method: 'get',
            url: fileUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        res.setHeader('Content-Type', 'application/pdf');
        response.data.pipe(res);
    } catch (err) {
        console.error("Proxy error: ", err.message);
        res.status(500).send("Error fetching pdf from drive");
    }
};

// Gets scoreboard data
exports.getScoreboard = async (req, res) => {
    try {
        const activeCycle = await getActiveCycleRow();
        const activeCycleId = activeCycle?.id || null;
        const resumeRound = activeCycleId
            ? await getResumeScreenRoundForCycle(activeCycleId)
            : null;

        if (!activeCycleId || !resumeRound) {
            return res.json({
                context: { cycle: null, round: null },
                metrics: [],
                maxPerCategory: 4,
                stats: { applicants: 0, reviewed: 0, advanced: 0, avgScore: 0 },
                candidates: [],
            });
        }

        const { data: resumes, error: resumeError } = await supabase
            .from('resumes')
            .select(`
                id,
                name,
                created_at,
                candidates (
                    email,
                    phone_number,
                    major,
                    gpa,
                    year,
                    pronouns,
                    linkedin,
                    gm,
                    newbie_training
                )
            `)
            .eq('cycle_id', activeCycleId)
            .order('created_at', { ascending: true });

        if (resumeError) throw resumeError;

        const { data: reviews, error: reviewError } = await supabase
            .from('resume_reviews')
            .select(`
                *,
                resumes (
                    id,
                    name,
                    candidates (
                        email,
                        phone_number,
                        major,
                        gpa,
                        year,
                        pronouns,
                        linkedin,
                        gm,
                        newbie_training
                    )
                )
            `)
            .eq('cycle_id', activeCycleId)
            .eq('round_id', resumeRound.id);
            
        if (reviewError) throw reviewError;

        const reviewerLookup = await getReviewerLookup((reviews || []).map(review => review.id));
        const gradedByUserLookup = await getGradedByUserLookup((reviews || []).map(review => review.graded_by));

        const candidateMap = {};
        let totalNormalizedSum = 0;
        let reviewCount = 0;
        const metricSet = new Set(getMetricsFromRubricConfig(resumeRound.rubric_config));

        (resumes || []).forEach(resume => {
            const candidate = resume.candidates || {};
            candidateMap[resume.id] = {
                id: resume.id,
                name: resume.name || 'Unknown',
                email: candidate.email || '',
                phoneNumber: candidate.phone_number || '',
                major: candidate.major || 'Undeclared',
                gpa: candidate.gpa || '',
                year: candidate.year || '',
                pronouns: candidate.pronouns || '',
                linkedin: candidate.linkedin || '',
                gm: candidate.gm || '',
                newbieTraining: candidate.newbie_training || '',
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

            const reviewScore = getReviewScore(review.scores, metrics);
            const reviewNormalized = getReviewNormalizedValue(review);

            totalNormalizedSum += reviewNormalized;
            reviewCount++;

            if (!candidateMap[resumeId]) {
                const candidate = review.resumes.candidates || {};
                candidateMap[resumeId] = {
                    id: resumeId,
                    name: review.resumes.name || 'Unknown',
                    email: candidate.email || '',
                    phoneNumber: candidate.phone_number || '',
                    major: candidate.major || 'Undeclared',
                    gpa: candidate.gpa || '',
                    year: candidate.year || '',
                    pronouns: candidate.pronouns || '',
                    linkedin: candidate.linkedin || '',
                    gm: candidate.gm || '',
                    newbieTraining: candidate.newbie_training || '',
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
                reviewerName:
                    getReviewerName(review) ||
                    reviewerLookup[review.id]?.name ||
                    graderFromUsers?.name ||
                    null,
                reviewerEmail:
                    getReviewerEmail(review) ||
                    reviewerLookup[review.id]?.email ||
                    graderFromUsers?.email ||
                    null,
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

            return {
                id: c.id,
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
                aggregateScore: aggregateScore === null ? null : Number(aggregateScore.toFixed(1)),
                normalizedScore: normalizedScore === null ? null : Number(normalizedScore.toFixed(1)),
                maxScore: null,
                categoryScores,
                numReviews: c.numReviews,
                reviews: c.reviews.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt)),
                score: normalizedScore === null ? null : Math.round(normalizedScore),
                createdAt: c.createdAt
            };
        });

        candidates.sort((a, b) => {
            if (a.score === null && b.score === null) {
                return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
            }
            if (a.score === null) return 1;
            if (b.score === null) return -1;
            return b.score - a.score;
        });
        candidates.forEach((c, index) => c.rank = index + 1);

        const totalReviewed = candidates.filter(c => c.numReviews > 0).length;
        const avgScore = reviewCount > 0 ? (totalNormalizedSum / reviewCount).toFixed(1) : 0;
        const advancedCount = candidates.filter(c => c.score >= 80).length;

        res.json({
            context: {
                cycle: activeCycle ? { id: activeCycle.id, name: activeCycle.name } : null,
                round: resumeRound ? { id: resumeRound.id, name: resumeRound.name } : null,
            },
            metrics,
            maxPerCategory,
            stats: {
                applicants: candidates.length,
                reviewed: totalReviewed,
                advanced: advancedCount,
                avgScore: avgScore
            },
            candidates: candidates
        });

    } catch (err) {
        console.error("Scoreboard error:", err);
        res.status(500).json({ error: err.message });
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
                    name
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

            const reviewScore = getReviewScore(review.scores, metrics);
            const reviewNormalized = getReviewNormalizedValue(review);
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
        console.error("Grader scoreboard error:", err);
        res.status(500).json({ error: err.message });
    }
};
