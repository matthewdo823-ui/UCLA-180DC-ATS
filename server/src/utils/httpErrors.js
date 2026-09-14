const GENERIC_SERVER_ERROR = 'Internal server error';

function logServerError(context, err) {
    const message = err?.message || String(err);
    console.error(`${context}:`, message);
}

function respondWithServerError(res, err, context = 'Request failed', clientMessage = GENERIC_SERVER_ERROR) {
    if (err?.code === '23514' && /automatically rejected/i.test(err.message || '')) {
        return res.status(409).json({ error: err.message });
    }
    logServerError(context, err);
    return res.status(500).json({ error: clientMessage });
}

module.exports = {
    GENERIC_SERVER_ERROR,
    logServerError,
    respondWithServerError,
};
