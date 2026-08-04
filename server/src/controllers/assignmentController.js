const supabase = require('../config/supabase');
const { getActiveCycleRow, getResumeScreenRoundForCycle } = require('../utils/cycleContext');
const { firstRel } = require('../utils/supabaseHelpers');
const { getUserName } = require('../utils/userDisplay');
const { respondWithServerError } = require('../utils/httpErrors');
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
    const [resumeRes, userRes, reviewRes, assignments] = await Promise.all([
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
        fetchAssignmentsForCycle(cycleId),
    ]);

    if (resumeRes.error) throw resumeRes.error;
    if (userRes.error) throw userRes.error;
    if (reviewRes.error) throw reviewRes.error;

    return {
        resumes: resumeRes.data || [],
        users: userRes.data || [],
        reviews: reviewRes.data || [],
        assignments,
    };
}

/** Admin assignment board: candidates, graders, and every current assignment. */
exports.getAssignmentBoard = async (req, res) => {
    try {
        const cycle = await getActiveCycleRow();
        if (!cycle) {
            return res.status(503).json({ error: 'No active recruiting cycle' });
        }

        const round = await getResumeScreenRoundForCycle(cycle.id);
        const { resumes, users, reviews, assignments } = await loadAssignmentBoardData(cycle.id);

        const completedPairs = new Set();
        const reviewsByResume = {};
        (reviews || []).forEach((row) => {
            if (!row.resume_id || !row.graded_by) return;
            completedPairs.add(reviewKey(row.graded_by, row.resume_id));
            reviewsByResume[row.resume_id] = (reviewsByResume[row.resume_id] || 0) + 1;
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
