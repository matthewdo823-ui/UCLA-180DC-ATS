const supabase = require('../config/supabase');
const { USER_FIELDS } = require('../middleware/authMiddleware');
const { VALID_ROLES } = require('../utils/auth');
const { serializeUser } = require('../utils/userDisplay');
const { respondWithServerError } = require('../utils/httpErrors');

exports.listUsers = async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select(USER_FIELDS)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({ users: (users || []).map(serializeUser) });
    } catch (err) {
        return respondWithServerError(res, err, 'listUsers');
    }
};

exports.updateUserRole = async (req, res) => {
    const userId = Number(req.params.userId);
    const role = String(req.body.role || '').trim().toLowerCase();

    if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ error: 'Invalid user id' });
    }

    if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ error: 'Role must be applicant, member, or admin' });
    }

    try {
        const { data: targetUser, error: fetchError } = await supabase
            .from('users')
            .select(USER_FIELDS)
            .eq('user_id', userId)
            .maybeSingle();

        if (fetchError) throw fetchError;
        if (!targetUser) return res.status(404).json({ error: 'User not found' });

        if (targetUser.role === 'admin' && role !== 'admin') {
            const { count, error: countError } = await supabase
                .from('users')
                .select('user_id', { count: 'exact', head: true })
                .eq('role', 'admin');

            if (countError) throw countError;
            if (count <= 1) {
                return res.status(400).json({ error: 'Cannot remove the last admin' });
            }
        }

        const { data: updatedUser, error: updateError } = await supabase
            .from('users')
            .update({ role })
            .eq('user_id', userId)
            .select(USER_FIELDS)
            .single();

        if (updateError) throw updateError;

        res.json({ user: serializeUser(updatedUser) });
    } catch (err) {
        return respondWithServerError(res, err, 'updateUserRole');
    }
};
