const supabase = require('../config/supabase');

const ASSIGNMENTS_TABLE = 'resume_assignments';
const ASSIGNMENT_CONFLICT_TARGET = 'cycle_id,grader_id,resume_id';
// Supabase/PostgREST chokes on very large single statements; bulk admin actions are chunked.
const WRITE_CHUNK_SIZE = 500;
const FILTER_CHUNK_SIZE = 200;

function chunk(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

function uniqueList(values) {
    return [...new Set((values || []).filter((value) => value !== null && value !== undefined && value !== ''))];
}

function normalizeGraderIds(graderIds) {
    return uniqueList((graderIds || []).map((id) => Number(id))).filter((id) => Number.isInteger(id) && id > 0);
}

function normalizeResumeIds(resumeIds) {
    return uniqueList((resumeIds || []).map((id) => String(id || '').trim()));
}

/** Assignments for one grader in one cycle, oldest first (assignment order is queue order). */
async function fetchAssignmentsForGrader(graderId, cycleId) {
    if (!graderId || !cycleId) return [];

    const { data, error } = await supabase
        .from(ASSIGNMENTS_TABLE)
        .select('id, resume_id, created_at')
        .eq('grader_id', graderId)
        .eq('cycle_id', cycleId)
        .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
}

/**
 * Resume ids still owed by a grader: assigned to them and not yet reviewed by them.
 * Completion is derived from resume_reviews rather than stored, so an assignment
 * disappears the moment its review lands (including reviews made before assignment).
 */
async function fetchPendingAssignedResumeIds({ graderId, cycleId, reviewedResumeIdSet }) {
    const assignments = await fetchAssignmentsForGrader(graderId, cycleId);
    const reviewed = reviewedResumeIdSet || new Set();
    const seen = new Set();
    const pending = [];

    assignments.forEach((row) => {
        const resumeId = row.resume_id;
        if (!resumeId || reviewed.has(resumeId) || seen.has(resumeId)) return;
        seen.add(resumeId);
        pending.push(resumeId);
    });

    return pending;
}

/** Every assignment in a cycle, for the admin assignment board. */
async function fetchAssignmentsForCycle(cycleId) {
    if (!cycleId) return [];

    const { data, error } = await supabase
        .from(ASSIGNMENTS_TABLE)
        .select('id, resume_id, grader_id, assigned_by, created_at')
        .eq('cycle_id', cycleId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

/**
 * Cross-product assign: every selected resume goes to every selected grader.
 * Existing pairs are left untouched (the unique index makes this idempotent).
 */
async function bulkAssign({ cycleId, resumeIds, graderIds, assignedBy }) {
    const resumes = normalizeResumeIds(resumeIds);
    const graders = normalizeGraderIds(graderIds);
    if (!cycleId || !resumes.length || !graders.length) {
        return { requested: 0, created: 0 };
    }

    const rows = [];
    graders.forEach((graderId) => {
        resumes.forEach((resumeId) => {
            rows.push({
                cycle_id: cycleId,
                resume_id: resumeId,
                grader_id: graderId,
                assigned_by: assignedBy || null,
            });
        });
    });

    let created = 0;
    for (const batch of chunk(rows, WRITE_CHUNK_SIZE)) {
        const { data, error } = await supabase
            .from(ASSIGNMENTS_TABLE)
            .upsert(batch, { onConflict: ASSIGNMENT_CONFLICT_TARGET, ignoreDuplicates: true })
            .select('id');

        if (error) throw error;
        created += (data || []).length;
    }

    return { requested: rows.length, created, skipped: rows.length - created };
}

/** Remove the cross-product of the selected resumes and graders. */
async function bulkUnassign({ cycleId, resumeIds, graderIds }) {
    const resumes = normalizeResumeIds(resumeIds);
    const graders = normalizeGraderIds(graderIds);
    if (!cycleId || !resumes.length || !graders.length) {
        return { removed: 0 };
    }

    let removed = 0;
    for (const resumeBatch of chunk(resumes, FILTER_CHUNK_SIZE)) {
        for (const graderBatch of chunk(graders, FILTER_CHUNK_SIZE)) {
            const { data, error } = await supabase
                .from(ASSIGNMENTS_TABLE)
                .delete()
                .eq('cycle_id', cycleId)
                .in('resume_id', resumeBatch)
                .in('grader_id', graderBatch)
                .select('id');

            if (error) throw error;
            removed += (data || []).length;
        }
    }

    return { removed };
}

/** Remove a single assignment row (per-row "x" in the admin table). */
async function deleteAssignment({ assignmentId, cycleId }) {
    if (!assignmentId || !cycleId) return { removed: 0 };

    const { data, error } = await supabase
        .from(ASSIGNMENTS_TABLE)
        .delete()
        .eq('id', assignmentId)
        .eq('cycle_id', cycleId)
        .select('id');

    if (error) throw error;
    return { removed: (data || []).length };
}

module.exports = {
    ASSIGNMENTS_TABLE,
    normalizeGraderIds,
    normalizeResumeIds,
    fetchAssignmentsForGrader,
    fetchPendingAssignedResumeIds,
    fetchAssignmentsForCycle,
    bulkAssign,
    bulkUnassign,
    deleteAssignment,
};
