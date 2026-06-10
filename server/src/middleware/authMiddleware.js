const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const { normalizeRole, getJwtSecret } = require('../utils/auth');

const USER_FIELDS = 'user_id, email, role, first_name, last_name, created_at, last_login';

async function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'Missing bearer token' });
    }

    try {
        const payload = jwt.verify(token, getJwtSecret());
        const { data: user, error } = await supabase
            .from('users')
            .select(USER_FIELDS)
            .eq('user_id', payload.sub)
            .maybeSingle();

        if (error) return res.status(500).json({ error: error.message });
        if (!user) return res.status(401).json({ error: 'User no longer exists' });

        req.user = user;
        return next();
    } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        console.error('Auth middleware error:', err.message);
        return res.status(500).json({ error: 'Authentication failed' });
    }
}

function requireRoles(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(500).json({ error: 'Authenticated user missing from request' });
        }

        if (!roles.includes(normalizeRole(req.user.role))) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        return next();
    };
}

module.exports = {
    USER_FIELDS,
    authenticateToken,
    requireRoles,
};
