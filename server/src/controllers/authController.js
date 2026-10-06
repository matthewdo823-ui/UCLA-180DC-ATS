const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const { USER_FIELDS } = require('../middleware/authMiddleware');
const { getJwtSecret } = require('../utils/auth');
const { serializeUser } = require('../utils/userDisplay');
const { respondWithServerError } = require('../utils/httpErrors');
const { isGmailConfigured, sendPlainTextEmail } = require('../services/emailService');
const { resolvePasswordResetUrl } = require('../utils/clientOrigins');

const LOGIN_USER_FIELDS = `${USER_FIELDS}, password_hash`;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const RESET_RESPONSE = 'If that email belongs to an account, a reset link has been sent.';
const RESET_UNAVAILABLE = 'Password reset email is not set up yet. Ask a 180DC admin to reset your password.';

function hashResetToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
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

exports.requestPasswordReset = async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required' });
    // Checked before the account lookup so the answer never reveals whether the
    // email is registered. Answering "a link has been sent" here would be false
    // for everyone, which is how this failed silently in production.
    if (!isGmailConfigured()) {
        console.error('[auth] Password reset requested but Gmail is not configured on the server.');
        return res.status(503).json({ error: RESET_UNAVAILABLE });
    }

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('user_id, email')
            .eq('email', email)
            .maybeSingle();
        if (error) return respondWithServerError(res, error, 'requestPasswordReset lookup');
        if (!user) return res.json({ message: RESET_RESPONSE });

        const token = crypto.randomBytes(32).toString('base64url');
        const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
        const { error: invalidateError } = await supabase
            .from('password_reset_tokens')
            .update({ used_at: new Date().toISOString() })
            .eq('user_id', user.user_id)
            .is('used_at', null);
        if (invalidateError) return respondWithServerError(res, invalidateError, 'requestPasswordReset invalidate');

        const { error: tokenError } = await supabase.from('password_reset_tokens').insert({
            user_id: user.user_id,
            token_hash: hashResetToken(token),
            expires_at: expiresAt,
        });
        if (tokenError) return respondWithServerError(res, tokenError, 'requestPasswordReset token');

        await sendPlainTextEmail({
            to: user.email,
            subject: 'Reset your 180DC ATS password',
            body: `We received a request to reset your password. Use this link within 30 minutes:\n\n${resolvePasswordResetUrl(token, req.get('origin'))}\n\nIf you did not request this, you can ignore this email.`,
        });
        return res.json({ message: RESET_RESPONSE });
    } catch (err) {
        return respondWithServerError(res, err, 'requestPasswordReset', 'Could not request password reset');
    }
};

exports.resetPassword = async (req, res) => {
    const token = String(req.body?.token || '').trim();
    const password = req.body?.password;
    if (!token || typeof password !== 'string') return res.status(400).json({ error: 'A reset token and password are required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    try {
        const passwordHash = await bcrypt.hash(password, 12);
        const { data: reset, error } = await supabase.rpc('reset_password_with_token', {
            token_hash_input: hashResetToken(token),
            password_hash_input: passwordHash,
        });
        if (error) return respondWithServerError(res, error, 'resetPassword');
        if (!reset) return res.status(400).json({ error: 'This reset link is invalid or has expired' });
        return res.json({ message: 'Password reset. You can now sign in.' });
    } catch (err) {
        return respondWithServerError(res, err, 'resetPassword', 'Could not reset password');
    }
};

exports.me = (req, res) => {
    return res.json({ user: serializeUser(req.user) });
};
