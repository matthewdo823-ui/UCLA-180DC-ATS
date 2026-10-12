const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 60 * 1000;

const REGISTER_MAX_ATTEMPTS = 3;
const REGISTER_WINDOW_MS = 15 * 60 * 1000;

const PASSWORD_RESET_MAX_ATTEMPTS = 3;
const PASSWORD_RESET_WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_IPS = 10_000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

function getClientIp(req) {
    // Express derives req.ip using the configured trust-proxy boundary. Reading
    // X-Forwarded-For directly trusts an attacker-controlled leftmost value and
    // lets callers rotate that header to bypass every limiter.
    return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

function createIpRateLimiter({ maxAttempts, windowMs, errorMessage, maxTrackedIps = MAX_TRACKED_IPS }) {
    const attempts = new Map();
    let nextCleanupAt = 0;

    function cleanupExpiredRecords(now) {
        if (now < nextCleanupAt && attempts.size < maxTrackedIps) return;
        for (const [ip, record] of attempts) {
            if (now >= record.resetAt) {
                attempts.delete(ip);
            }
        }
        nextCleanupAt = now + CLEANUP_INTERVAL_MS;

        // Bound process memory even under a distributed source-IP flood. The
        // oldest insertion is evicted first; established active limits remain
        // effective for the rest of the bounded set.
        while (attempts.size >= maxTrackedIps) {
            attempts.delete(attempts.keys().next().value);
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
    createIpRateLimiter,
    getClientIp,
    loginRateLimit,
    registerRateLimit,
    passwordResetRateLimit,
};
