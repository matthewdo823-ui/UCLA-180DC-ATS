const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 60 * 1000;

const loginAttempts = new Map();

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length) {
        return forwarded.split(',')[0].trim();
    }

    return req.ip || req.socket?.remoteAddress || 'unknown';
}

function cleanupExpiredRecords(now) {
    for (const [ip, record] of loginAttempts) {
        if (now >= record.resetAt) {
            loginAttempts.delete(ip);
        }
    }
}

function loginRateLimit(req, res, next) {
    const ip = getClientIp(req);
    const now = Date.now();

    cleanupExpiredRecords(now);

    let record = loginAttempts.get(ip);
    if (!record || now >= record.resetAt) {
        record = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
        loginAttempts.set(ip, record);
    }

    if (record.count >= LOGIN_MAX_ATTEMPTS) {
        const retryAfterSec = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
        res.set('Retry-After', String(retryAfterSec));
        return res.status(429).json({
            error: 'Too many login attempts. Please try again in a minute.',
        });
    }

    record.count += 1;
    next();
}

module.exports = {
    loginRateLimit,
};
