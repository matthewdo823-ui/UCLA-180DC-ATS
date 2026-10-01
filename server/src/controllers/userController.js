const supabase = require('../config/supabase');
const { USER_FIELDS } = require('../middleware/authMiddleware');
const { VALID_ROLES } = require('../utils/auth');
const { ACCOUNT_STATUSES } = require('../utils/accountStatus');
const { serializeUser } = require('../utils/userDisplay');
const { respondWithServerError } = require('../utils/httpErrors');

const APPROVABLE_ROLES = ['member', 'board', 'admin'];

exports.listUsers = async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select(USER_FIELDS)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return res.json({ users: (users || []).map(serializeUser) });
    } catch (err) {
        return respondWithServerError(res, err, 'listUsers');
    }
};

function parseUserId(req, res) {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
        res.status(400).json({ error: 'Invalid user id' });
        return null;
    }
    return userId;
}

async function findUser(userId) {
    const { data, error } = await supabase
        .from('users')
        .select(USER_FIELDS)
        .eq('user_id', userId)
        .maybeSingle();
    if (error) throw error;
    return data;
}

async function activeAdminCount() {
    const { count, error } = await supabase
        .from('users')
        .select('user_id', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('account_status', ACCOUNT_STATUSES.ACTIVE);
    if (error) throw error;
    return count || 0;
}

exports.updateUserRole = async (req, res) => {
    const userId = parseUserId(req, res);
    if (!userId) return;
    const role = String(req.body.role || '').trim().toLowerCase();

    if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ error: 'Role must be applicant, member, board, or admin' });
    }
    if (!APPROVABLE_ROLES.includes(role)) {
        return res.status(400).json({ error: 'Use deactivation to remove team access' });
    }

    try {
        const targetUser = await findUser(userId);
        if (!targetUser) return res.status(404).json({ error: 'User not found' });
        if (targetUser.account_status !== ACCOUNT_STATUSES.ACTIVE) {
            return res.status(409).json({ error: 'Only active users can have their role changed' });
        }

        if (targetUser.role === 'admin' && role !== 'admin' && await activeAdminCount() <= 1) {
            return res.status(400).json({ error: 'Cannot remove the last active admin' });
        }

        const { data: updatedUser, error } = await supabase
            .from('users')
            .update({ role })
            .eq('user_id', userId)
            .eq('account_status', ACCOUNT_STATUSES.ACTIVE)
            .select(USER_FIELDS)
            .maybeSingle();

        if (error) throw error;
        if (!updatedUser) return res.status(409).json({ error: 'Account status changed; refresh and try again' });
        return res.json({ user: serializeUser(updatedUser) });
    } catch (err) {
        return respondWithServerError(res, err, 'updateUserRole');
    }
};

exports.approveUser = async (req, res) => {
    const userId = parseUserId(req, res);
    if (!userId) return;
    const role = String(req.body.role || '').trim().toLowerCase();

    if (!APPROVABLE_ROLES.includes(role)) {
        return res.status(400).json({ error: 'Choose member, board, or admin before approving this account' });
    }

    try {
        const targetUser = await findUser(userId);
        if (!targetUser) return res.status(404).json({ error: 'User not found' });
        if (targetUser.account_status !== ACCOUNT_STATUSES.PENDING) {
            return res.status(409).json({ error: 'Only pending accounts can be approved' });
        }

        const { data: updatedUser, error } = await supabase
            .from('users')
            .update({
                role,
                account_status: ACCOUNT_STATUSES.ACTIVE,
                approved_at: new Date().toISOString(),
                approved_by: req.user.user_id,
                deactivated_at: null,
                deactivated_by: null,
            })
            .eq('user_id', userId)
            .eq('account_status', ACCOUNT_STATUSES.PENDING)
            .select(USER_FIELDS)
            .maybeSingle();

        if (error) throw error;
        if (!updatedUser) return res.status(409).json({ error: 'Account status changed; refresh and try again' });
        return res.json({ user: serializeUser(updatedUser) });
    } catch (err) {
        return respondWithServerError(res, err, 'approveUser');
    }
};

exports.deactivateUser = async (req, res) => {
    const userId = parseUserId(req, res);
    if (!userId) return;
    if (userId === req.user.user_id) {
        return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }

    try {
        const targetUser = await findUser(userId);
        if (!targetUser) return res.status(404).json({ error: 'User not found' });
        if (targetUser.account_status !== ACCOUNT_STATUSES.ACTIVE) {
            return res.status(409).json({ error: 'Only active accounts can be deactivated' });
        }
        if (targetUser.role === 'admin' && await activeAdminCount() <= 1) {
            return res.status(400).json({ error: 'Cannot deactivate the last active admin' });
        }

        const { data: updatedUser, error } = await supabase
            .from('users')
            .update({
                account_status: ACCOUNT_STATUSES.DEACTIVATED,
                deactivated_at: new Date().toISOString(),
                deactivated_by: req.user.user_id,
            })
            .eq('user_id', userId)
            .eq('account_status', ACCOUNT_STATUSES.ACTIVE)
            .select(USER_FIELDS)
            .maybeSingle();

        if (error) throw error;
        if (!updatedUser) return res.status(409).json({ error: 'Account status changed; refresh and try again' });
        return res.json({ user: serializeUser(updatedUser) });
    } catch (err) {
        return respondWithServerError(res, err, 'deactivateUser');
    }
};

exports.reactivateUser = async (req, res) => {
    const userId = parseUserId(req, res);
    if (!userId) return;

    try {
        const targetUser = await findUser(userId);
        if (!targetUser) return res.status(404).json({ error: 'User not found' });
        if (targetUser.account_status !== ACCOUNT_STATUSES.DEACTIVATED) {
            return res.status(409).json({ error: 'Only deactivated accounts can be reactivated' });
        }

        const { data: updatedUser, error } = await supabase
            .from('users')
            .update({
                account_status: ACCOUNT_STATUSES.ACTIVE,
                deactivated_at: null,
                deactivated_by: null,
            })
            .eq('user_id', userId)
            .eq('account_status', ACCOUNT_STATUSES.DEACTIVATED)
            .select(USER_FIELDS)
            .maybeSingle();

        if (error) throw error;
        if (!updatedUser) return res.status(409).json({ error: 'Account status changed; refresh and try again' });
        return res.json({ user: serializeUser(updatedUser) });
    } catch (err) {
        return respondWithServerError(res, err, 'reactivateUser');
    }
};

exports.deletePendingUser = async (req, res) => {
    const userId = parseUserId(req, res);
    if (!userId) return;

    try {
        const targetUser = await findUser(userId);
        if (!targetUser) return res.status(404).json({ error: 'User not found' });
        if (targetUser.account_status !== ACCOUNT_STATUSES.PENDING) {
            return res.status(409).json({ error: 'Only pending access requests can be rejected and deleted' });
        }

        const { data: deletedUser, error } = await supabase
            .from('users')
            .delete()
            .eq('user_id', userId)
            .eq('account_status', ACCOUNT_STATUSES.PENDING)
            .select('user_id')
            .maybeSingle();

        if (error) throw error;
        if (!deletedUser) return res.status(409).json({ error: 'Account status changed; refresh and try again' });
        return res.json({ deletedUserId: deletedUser.user_id });
    } catch (err) {
        return respondWithServerError(res, err, 'deletePendingUser');
    }
};
