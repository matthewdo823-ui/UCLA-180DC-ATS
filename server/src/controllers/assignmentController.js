const supabase = require('../config/supabase');
const {
    getActiveCycleRow,
    getActiveRoundForCycle,
    getResumeScreenRoundForCycle,
    requireActiveInterviewRound,
} = require('../utils/cycleContext');
const { firstRel } = require('../utils/supabaseHelpers');
const { getUserName } = require('../utils/userDisplay');
const { respondWithServerError } = require('../utils/httpErrors');
const { isMissingSchemaError } = require('../utils/schemaCompatibility');
const { ROUND_TYPES, normalizeRoundType } = require('../utils/rounds');
const { NO_SHOW_GROUP_NUMBER } = require('../utils/interviewGroups');
const {
    normalizeGraderIds,
    normalizeResumeIds,
    fetchAssignmentsForCycle,
    bulkAssign,
    bulkUnassign,
    deleteAssignment,
} = require('../services/assignmentService');

function reviewKey(graderId, resumeId) {
    return `${graderId}:${resumeId}`;
}

async function loadAssignmentBoardData(cycleId) {
    const [resumeRes, userRes, reviewRes, frqReviewRes, assignments] = await Promise.all([
        supabase
            .from('resumes')
            .select(`
                id,
                name,
                review_count,
                created_at,
                candidates ( id, name, year, major, gpa )
            `)
            .eq('cycle_id', cycleId)
            .order('review_count', { ascending: true })
            .order('created_at', { ascending: true }),
        supabase
            .from('users')
            .select('user_id, email, role, first_name, last_name')
            .in('role', ['admin', 'member'])
            .order('first_name', { ascending: true }),
        supabase
            .from('resume_reviews')
            .select('resume_id, graded_by')
            .eq('cycle_id', cycleId)
            .not('graded_by', 'is', null),
        supabase
            .from('frq_reviews')
            .select('resume_id')
            .eq('cycle_id', cycleId),
        fetchAssignmentsForCycle(cycleId),
    ]);

    if (resumeRes.error) throw resumeRes.error;
    if (userRes.error) throw userRes.error;
    if (reviewRes.error) throw reviewRes.error;
    if (frqReviewRes.error) throw frqReviewRes.error;

    return {
        resumes: resumeRes.data || [],
        users: userRes.data || [],
        reviews: reviewRes.data || [],
        frqReviews: frqReviewRes.data || [],
        assignments,
    };
}

async function loadCoffeeChatAssignmentBoard(cycle, round) {
    const [candidateRes, resumeRes, userRes, groupRes, memberRes] = await Promise.all([
        supabase
            .from('candidates')
            .select('id, name, year, major, headshot')
            .eq('cycle_id', cycle.id)
            .order('name', { ascending: true }),
        supabase
            .from('resumes')
            .select('id, candidate_id')
            .eq('cycle_id', cycle.id),
        supabase
            .from('users')
            .select('user_id, email, role, first_name, last_name')
            .in('role', ['admin', 'member'])
            .order('first_name', { ascending: true }),
        supabase
            .from('interview_group_assignments')
            .select('id, candidate_id, group_number, assigned_at')
            .eq('round_id', round.id),
        supabase
            .from('interview_group_member_assignments')
            .select('id, user_id, group_number, assigned_at, updated_at')
            .eq('round_id', round.id),
    ]);

    if (candidateRes.error) throw candidateRes.error;
    if (resumeRes.error) throw resumeRes.error;
    if (userRes.error) throw userRes.error;
    if (groupRes.error) throw groupRes.error;
    if (memberRes.error && !isMissingSchemaError(memberRes.error)) throw memberRes.error;

    const candidateById = Object.fromEntries((candidateRes.data || []).map((candidate) => [candidate.id, candidate]));
    const resumeByCandidate = Object.fromEntries((resumeRes.data || []).map((resume) => [resume.candidate_id, resume.id]));
    const memberAssignmentByUser = Object.fromEntries(
        (memberRes.error ? [] : memberRes.data || []).map((assignment) => [assignment.user_id, assignment])
    );

    const candidates = (groupRes.data || [])
        .map((assignment) => {
            const candidate = candidateById[assignment.candidate_id];
            if (!candidate) return null;
            return {
                id: candidate.id,
                resumeId: resumeByCandidate[candidate.id] || null,
                name: candidate.name,
                year: candidate.year || null,
                major: candidate.major || null,
                headshot: candidate.headshot || '',
                groupNumber: Number(assignment.group_number) || 0,
                assignmentId: assignment.id,
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.groupNumber - b.groupNumber || a.name.localeCompare(b.name));

    const graders = (userRes.data || []).map((user) => ({
        id: user.user_id,
        name: getUserName(user),
        email: user.email || '',
        role: user.role,
        startingGroupNumber: Number(memberAssignmentByUser[user.user_id]?.group_number) || null,
    }));

    const groupCount = Number(round.interview_group_count) || 1;
    return {
        mode: 'coffee_chat',
        context: {
            cycle: { id: cycle.id, name: cycle.name },
            round: {
                id: round.id,
                name: round.name,
                status: round.status,
                type: normalizeRoundType(round.type),
                groupCount,
            },
            memberAssignmentsReady: !memberRes.error,
        },
        candidates,
        graders,
        assignments: [],
        stats: {
            candidates: candidates.length,
            graders: graders.length,
            tables: groupCount,
            assignedGraders: graders.filter((grader) => grader.startingGroupNumber).length,
        },
    };
}

/** Admin assignment board: candidates, graders, and every current assignment. */
exports.getAssignmentBoard = async (req, res) => {
    try {
        const cycle = await getActiveCycleRow();
        if (!cycle) {
            return res.status(503).json({ error: 'No active recruiting cycle' });
        }

        const activeRound = await getActiveRoundForCycle(cycle.id);
        if (normalizeRoundType(activeRound?.type) === ROUND_TYPES.COFFEE_CHAT) {
            return res.json(await loadCoffeeChatAssignmentBoard(cycle, activeRound));
        }

        const round = await getResumeScreenRoundForCycle(cycle.id);
        const { resumes, users, reviews, frqReviews, assignments } = await loadAssignmentBoardData(cycle.id);

        const completedPairs = new Set();
        const reviewsByResume = {};
        (reviews || []).forEach((row) => {
            if (!row.resume_id || !row.graded_by) return;
            completedPairs.add(reviewKey(row.graded_by, row.resume_id));
            reviewsByResume[row.resume_id] = (reviewsByResume[row.resume_id] || 0) + 1;
        });
        const frqReviewsByResume = {};
        (frqReviews || []).forEach((row) => {
            if (!row.resume_id) return;
            frqReviewsByResume[row.resume_id] = (frqReviewsByResume[row.resume_id] || 0) + 1;
        });

        const graderLookup = {};
        (users || []).forEach((user) => {
            graderLookup[user.user_id] = {
                id: user.user_id,
                name: getUserName(user),
                email: user.email || '',
                role: user.role,
                assignedCount: 0,
                pendingCount: 0,
            };
        });

        const assignmentsByResume = {};
        const mappedAssignments = [];

        (assignments || []).forEach((row) => {
            const grader = graderLookup[row.grader_id];
            const done = completedPairs.has(reviewKey(row.grader_id, row.resume_id));

            if (grader) {
                grader.assignedCount += 1;
                if (!done) grader.pendingCount += 1;
            }

            if (!assignmentsByResume[row.resume_id]) assignmentsByResume[row.resume_id] = [];
            assignmentsByResume[row.resume_id].push({
                assignmentId: row.id,
                graderId: row.grader_id,
                graderName: grader?.name || 'Unknown grader',
                completed: done,
            });

            mappedAssignments.push({
                id: row.id,
                resumeId: row.resume_id,
                graderId: row.grader_id,
                graderName: grader?.name || 'Unknown grader',
                completed: done,
                assignedBy: row.assigned_by,
                createdAt: row.created_at,
            });
        });

        const candidates = (resumes || []).map((row) => {
            const candidate = firstRel(row.candidates);
            const assigned = assignmentsByResume[row.id] || [];
            return {
                resumeId: row.id,
                candidateId: candidate?.id || null,
                name: candidate?.name || row.name || 'Unknown candidate',
                year: candidate?.year || null,
                major: candidate?.major || null,
                gpa: candidate?.gpa || null,
                reviewCount: reviewsByResume[row.id] ?? row.review_count ?? 0,
                frqReviewCount: frqReviewsByResume[row.id] || 0,
                assignments: assigned,
                assignedCount: assigned.length,
                pendingCount: assigned.filter((item) => !item.completed).length,
            };
        });

        const graders = Object.values(graderLookup).sort((a, b) => a.name.localeCompare(b.name));

        return res.json({
            context: {
                cycle: { id: cycle.id, name: cycle.name },
                round: round ? { id: round.id, name: round.name, status: round.status } : null,
            },
            candidates,
            graders,
            assignments: mappedAssignments,
            stats: {
                candidates: candidates.length,
                graders: graders.length,
                assignments: mappedAssignments.length,
                pendingAssignments: mappedAssignments.filter((row) => !row.completed).length,
            },
        });
    } catch (err) {
        return respondWithServerError(res, err, 'getAssignmentBoard');
    }
};

/** Move one candidate between tables in the active Coffee Chat round. */
exports.updateCoffeeChatCandidateTable = async (req, res) => {
    const candidateId = String(req.params.candidateId || '').trim();
    const groupNumber = Number(req.body?.groupNumber);

    if (!candidateId) return res.status(400).json({ error: 'candidateId is required' });

    try {
        const ctx = await requireActiveInterviewRound();
        if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
        if (normalizeRoundType(ctx.round.type) !== ROUND_TYPES.COFFEE_CHAT) {
            return res.status(400).json({ error: 'Candidate tables can only be changed during Coffee Chats' });
        }

        const groupCount = Number(ctx.round.interview_group_count) || 1;
        if (!Number.isInteger(groupNumber) || (groupNumber !== NO_SHOW_GROUP_NUMBER && (groupNumber < 1 || groupNumber > groupCount))) {
            return res.status(400).json({ error: `groupNumber must be between 1 and ${groupCount}, or the reserved no-show table` });
        }

        const { data, error } = await supabase
            .from('interview_group_assignments')
            .update({ group_number: groupNumber, assigned_by: req.user?.user_id, assigned_at: new Date().toISOString() })
            .eq('candidate_id', candidateId)
            .eq('round_id', ctx.round.id)
            .select('id, candidate_id, group_number')
            .maybeSingle();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Candidate does not have a Coffee Chat table assignment' });
        return res.json({ candidateId: data.candidate_id, groupNumber: data.group_number });
    } catch (err) {
        return respondWithServerError(res, err, 'updateCoffeeChatCandidateTable');
    }
};

/** Assign or unassign a participant's starting table for the active Coffee Chat round. */
exports.updateCoffeeChatMemberTable = async (req, res) => {
    const userId = Number(req.params.userId);
    const rawGroupNumber = req.body?.groupNumber;
    const unassign = rawGroupNumber == null || rawGroupNumber === '';
    const groupNumber = Number(rawGroupNumber);

    if (!Number.isInteger(userId) || userId < 1) {
        return res.status(400).json({ error: 'userId must be a valid participant id' });
    }

    try {
        const ctx = await requireActiveInterviewRound();
        if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
        if (normalizeRoundType(ctx.round.type) !== ROUND_TYPES.COFFEE_CHAT) {
            return res.status(400).json({ error: 'Participant tables can only be changed during Coffee Chats' });
        }

        const { data: member, error: memberError } = await supabase
            .from('users')
            .select('user_id, role')
            .eq('user_id', userId)
            .in('role', ['admin', 'member'])
            .maybeSingle();
        if (memberError) throw memberError;
        if (!member) return res.status(404).json({ error: 'Coffee Chat participant not found' });

        if (unassign) {
            const { error } = await supabase
                .from('interview_group_member_assignments')
                .delete()
                .eq('round_id', ctx.round.id)
                .eq('user_id', userId);
            if (error) {
                if (isMissingSchemaError(error)) {
                    return res.status(503).json({ error: 'Participant table assignments require migration #23.' });
                }
                throw error;
            }
            return res.json({ userId, groupNumber: null });
        }

        const groupCount = Number(ctx.round.interview_group_count) || 1;
        if (!Number.isInteger(groupNumber) || groupNumber < 1 || groupNumber > groupCount) {
            return res.status(400).json({ error: `groupNumber must be between 1 and ${groupCount}` });
        }

        const { data, error } = await supabase
            .from('interview_group_member_assignments')
            .upsert({
                cycle_id: ctx.cycle.id,
                round_id: ctx.round.id,
                user_id: userId,
                group_number: groupNumber,
                assigned_by: req.user?.user_id,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'round_id,user_id' })
            .select('user_id, group_number')
            .single();

        if (error) {
            if (isMissingSchemaError(error)) {
                return res.status(503).json({ error: 'Participant table assignments require migration #23.' });
            }
            throw error;
        }
        return res.json({ userId: data.user_id, groupNumber: data.group_number });
    } catch (err) {
        return respondWithServerError(res, err, 'updateCoffeeChatMemberTable');
    }
};

/** Bulk assign: every selected candidate goes to every selected grader. */
exports.createAssignments = async (req, res) => {
    try {
        const cycle = await getActiveCycleRow();
        if (!cycle) {
            return res.status(503).json({ error: 'No active recruiting cycle' });
        }

        const resumeIds = normalizeResumeIds(req.body?.resumeIds);
        const graderIds = normalizeGraderIds(req.body?.graderIds);

        if (!resumeIds.length) {
            return res.status(400).json({ error: 'Select at least one candidate' });
        }
        if (!graderIds.length) {
            return res.status(400).json({ error: 'Select at least one grader' });
        }

        const { data: validResumes, error: resumeError } = await supabase
            .from('resumes')
            .select('id')
            .eq('cycle_id', cycle.id)
            .in('id', resumeIds);

        if (resumeError) throw resumeError;

        const validResumeIds = (validResumes || []).map((row) => row.id);
        if (validResumeIds.length !== resumeIds.length) {
            return res.status(400).json({ error: 'One or more candidates are not part of the active cycle' });
        }

        const { data: validGraders, error: graderError } = await supabase
            .from('users')
            .select('user_id')
            .in('role', ['admin', 'member'])
            .in('user_id', graderIds);

        if (graderError) throw graderError;

        const validGraderIds = (validGraders || []).map((row) => row.user_id);
        if (validGraderIds.length !== graderIds.length) {
            return res.status(400).json({ error: 'One or more graders are not admins or members' });
        }

        const result = await bulkAssign({
            cycleId: cycle.id,
            resumeIds: validResumeIds,
            graderIds: validGraderIds,
            assignedBy: req.user?.user_id || null,
        });

        return res.status(201).json(result);
    } catch (err) {
        return respondWithServerError(res, err, 'createAssignments');
    }
};

/** Bulk unassign the same cross-product the assign endpoint creates. */
exports.deleteAssignments = async (req, res) => {
    try {
        const cycle = await getActiveCycleRow();
        if (!cycle) {
            return res.status(503).json({ error: 'No active recruiting cycle' });
        }

        const resumeIds = normalizeResumeIds(req.body?.resumeIds);
        const graderIds = normalizeGraderIds(req.body?.graderIds);

        if (!resumeIds.length || !graderIds.length) {
            return res.status(400).json({ error: 'Select at least one candidate and one grader' });
        }

        const result = await bulkUnassign({ cycleId: cycle.id, resumeIds, graderIds });
        return res.json(result);
    } catch (err) {
        return respondWithServerError(res, err, 'deleteAssignments');
    }
};

/** Remove one assignment row. */
exports.deleteAssignmentById = async (req, res) => {
    try {
        const cycle = await getActiveCycleRow();
        if (!cycle) {
            return res.status(503).json({ error: 'No active recruiting cycle' });
        }

        const assignmentId = String(req.params.assignmentId || '').trim();
        if (!assignmentId) {
            return res.status(400).json({ error: 'assignmentId is required' });
        }

        const result = await deleteAssignment({ assignmentId, cycleId: cycle.id });
        if (!result.removed) {
            return res.status(404).json({ error: 'Assignment not found' });
        }

        return res.json(result);
    } catch (err) {
        return respondWithServerError(res, err, 'deleteAssignmentById');
    }
};
