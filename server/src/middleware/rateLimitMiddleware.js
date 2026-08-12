const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 60 * 1000;

const REGISTER_MAX_ATTEMPTS = 3;
const REGISTER_WINDOW_MS = 15 * 60 * 1000;

const PASSWORD_RESET_MAX_ATTEMPTS = 3;
const PASSWORD_RESET_WINDOW_MS = 15 * 60 * 1000;

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length) {
        return forwarded.split(',')[0].trim();
    }

    return req.ip || req.socket?.remoteAddress || 'unknown';
}

function createIpRateLimiter({ maxAttempts, windowMs, errorMessage }) {
    const attempts = new Map();

    function cleanupExpiredRecords(now) {
        for (const [ip, record] of attempts) {
            if (now >= record.resetAt) {
                attempts.delete(ip);
            }
        }
    }

    return function rateLimit(req, res, next) {
        const ip = getClientIp(req);
        const now = Date.now();

        cleanupExpiredRecords(now);

        let record = attempts.get(ip);
        if (!record || now >= record.resetAt) {
            record = { count: 0, resetAt: now + windowMs };
            attempts.set(ip, record);
        }

        if (record.count >= maxAttempts) {
            const retryAfterSec = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
            res.set('Retry-After', String(retryAfterSec));
            return res.status(429).json({ error: errorMessage });
        }

        record.count += 1;
        next();
    };
}

const loginRateLimit = createIpRateLimiter({
    maxAttempts: LOGIN_MAX_ATTEMPTS,
    windowMs: LOGIN_WINDOW_MS,
    errorMessage: 'Too many login attempts. Please try again in a minute.',
});

const registerRateLimit = createIpRateLimiter({
    maxAttempts: REGISTER_MAX_ATTEMPTS,
    windowMs: REGISTER_WINDOW_MS,
    errorMessage: 'Too many registration attempts. Please try again in 15 minutes.',
});

const passwordResetRateLimit = createIpRateLimiter({
    maxAttempts: PASSWORD_RESET_MAX_ATTEMPTS,
    windowMs: PASSWORD_RESET_WINDOW_MS,
    errorMessage: 'Too many password reset requests. Please try again in 15 minutes.',
});

module.exports = {
    loginRateLimit,
    registerRateLimit,
    passwordResetRateLimit,
};
