const GENERIC_SERVER_ERROR = 'Internal server error';

function logServerError(context, err) {
    const message = err?.message || String(err);
    console.error(`${context}:`, message);
}

function respondWithServerError(res, err, context = 'Request failed') {
    logServerError(context, err);
    return res.status(500).json({ error: GENERIC_SERVER_ERROR });
}

module.exports = {
    GENERIC_SERVER_ERROR,
    logServerError,
    respondWithServerError,
};
