const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const { USER_FIELDS } = require('../middleware/authMiddleware');

const LOGIN_USER_FIELDS = `${USER_FIELDS}, password_hash`;

function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET is not configured');
    }
    return secret;
}

function serializeUser(user) {
    if (!user) return null;

    return {
        user_id: user.user_id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
        created_at: user.created_at,
        last_login: user.last_login,
    };
}

function createToken(user) {
    return jwt.sign(
        {
            email: user.email,
            role: user.role,
        },
        getJwtSecret(),
        {
            subject: String(user.user_id),
            expiresIn: process.env.JWT_EXPIRES_IN || '8h',
        }
    );
}

exports.login = async (req, res) => {
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select(LOGIN_USER_FIELDS)
            .eq('email', email)
            .maybeSingle();

        if (error) return res.status(500).json({ error: error.message });

        const passwordMatches = user
            ? await bcrypt.compare(password, user.password_hash)
            : false;

        if (!user || !passwordMatches) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const { data: updatedUser, error: updateError } = await supabase
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('user_id', user.user_id)
            .select(USER_FIELDS)
            .single();

        if (updateError) return res.status(500).json({ error: updateError.message });

        return res.json({
            token: createToken(updatedUser),
            user: serializeUser(updatedUser),
        });
    } catch (err) {
        console.error('Login error:', err.message);
        return res.status(500).json({ error: 'Login failed' });
    }
};

exports.me = (req, res) => {
    return res.json({ user: serializeUser(req.user) });
};
