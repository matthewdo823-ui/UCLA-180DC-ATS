const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const { USER_FIELDS } = require('../middleware/authMiddleware');
const { getJwtSecret } = require('../utils/auth');
const { serializeUser } = require('../utils/userDisplay');
const { respondWithServerError } = require('../utils/httpErrors');

const LOGIN_USER_FIELDS = `${USER_FIELDS}, password_hash`;

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

        if (error) return respondWithServerError(res, error, 'login lookup');

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

        if (updateError) return respondWithServerError(res, updateError, 'login last_login update');

        return res.json({
            token: createToken(updatedUser),
            user: serializeUser(updatedUser),
        });
    } catch (err) {
        return respondWithServerError(res, err, 'login', 'Login failed');
    }
};

exports.register = async (req, res) => {
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password;
    const firstName = req.body.first_name?.trim() || null;
    const lastName = req.body.last_name?.trim() || null;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    try {
        const { data: existingUser, error: lookupError } = await supabase
            .from('users')
            .select('user_id')
            .eq('email', email)
            .maybeSingle();

        if (lookupError) return respondWithServerError(res, lookupError, 'register lookup');

        if (existingUser) {
            return res.status(409).json({ error: 'An account already exists for this email' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const now = new Date().toISOString();

        const { data: user, error } = await supabase
            .from('users')
            .insert({
                email,
                password_hash: passwordHash,
                role: 'applicant',
                first_name: firstName,
                last_name: lastName,
                last_login: now,
            })
            .select(USER_FIELDS)
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({ error: 'An account already exists for this email' });
            }

            return respondWithServerError(res, error, 'register insert');
        }

        return res.status(201).json({
            token: createToken(user),
            user: serializeUser(user),
        });
    } catch (err) {
        return respondWithServerError(res, err, 'register', 'Account creation failed');
    }
};

exports.me = (req, res) => {
    return res.json({ user: serializeUser(req.user) });
};
