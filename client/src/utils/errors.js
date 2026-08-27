/**
 * Standardized error definitions and parsing utilities.
 *
 * Separates user-facing error explanations (with clear HTTP status titles,
 * explanatory sentences, and actionable advice) from developer-focused diagnostics
 * (endpoints, local troubleshooting commands, and stack traces).
 */

export const STATUS_EXPLANATIONS = {
  400: {
    title: "400 Bad Request",
    explanation: "The server could not process the submitted data.",
    action: "Please verify your input and try again.",
  },
  401: {
    title: "401 Session Expired",
    explanation: "Your sign-in session has expired or is invalid.",
    action: "Please sign in again to continue.",
  },
  403: {
    title: "403 Access Denied",
    explanation: "You do not have the required permissions to perform this action.",
    action: "Contact an administrator if you believe this is an error.",
  },
  404: {
    title: "404 Not Found",
    explanation: "The requested resource could not be found on the server.",
    action: "It may have been removed or the link might be out of date.",
  },
  409: {
    title: "409 Conflict",
    explanation: "This action conflicts with current server state or a duplicate record exists.",
    action: "Please refresh the page and verify the current status.",
  },
  422: {
    title: "422 Unprocessable Entity",
    explanation: "The request was well-formed but contained semantic errors.",
    action: "Please check all required fields and try again.",
  },
  429: {
    title: "429 Too Many Requests",
    explanation: "Too many requests were sent in a short window.",
    action: "Please wait a moment before trying again.",
  },
  500: {
    title: "500 Internal Server Error",
    explanation: "The server encountered an unexpected error while processing your request.",
    action: "Please try again in a few moments.",
  },
  502: {
    title: "502 Bad Gateway",
    explanation: "The server received an invalid response from an upstream service.",
    action: "Please try again shortly.",
  },
  503: {
    title: "503 Service Unavailable",
    explanation: "The backend server is temporarily unavailable or restarting.",
    action: "Please wait a few seconds and try again.",
  },
  504: {
    title: "504 Gateway Timeout",
    explanation: "The server took too long to respond.",
    action: "Please check your connection and try again.",
  },
};

export class UserFriendlyError extends Error {
  constructor({
    status = null,
    title = "Error",
    explanation = "An unexpected error occurred.",
    action = "Please try again.",
    code = "UNKNOWN_ERROR",
    devDetails = "",
    cause = null,
  } = {}) {
    // Setting the base Error message to explanation guarantees that legacy code
    // reading `err.message` receives the clean, informative sentence.
    super(explanation);
    this.name = "UserFriendlyError";
    this.status = status;
    this.title = title;
    this.explanation = explanation;
    this.action = action;
    this.code = code;
    this.devDetails = devDetails;
    this.cause = cause;
  }
}

/**
 * Creates a UserFriendlyError for network/fetch failures (e.g. offline, connection refused).
 */
export function formatNetworkError(err, context = "connecting to the server", devHint = "") {
  return new UserFriendlyError({
    status: null,
    title: "Network Connection Error",
    explanation: `Unable to reach the server while ${context}.`,
    action: "Please check your internet connection or try again once the server is reachable.",
    code: "NETWORK_ERROR",
    devDetails: [
      `Error: ${err?.message || "Failed to fetch"}`,
      devHint || "Check if the backend server is running and accessible.",
      err?.stack ? `Stack:\n${err.stack}` : null,
    ].filter(Boolean).join("\n"),
    cause: err,
  });
}

/**
 * Parses an HTTP Response object into a structured UserFriendlyError.
 */
export async function formatResponseError(res, context = "processing your request", devHint = "") {
  let backendPayload = {};
  let rawBodyText = "";
  try {
    rawBodyText = await res.text();
    backendPayload = rawBodyText ? JSON.parse(rawBodyText) : {};
  } catch {
    // Response was not JSON (e.g., Express raw HTML 404/500)
  }

  const statusMeta = STATUS_EXPLANATIONS[res.status] || {
    title: `Error (${res.status})`,
    explanation: `An unexpected server error (${res.status}) occurred while ${context}.`,
    action: "Please try again in a few moments.",
  };

  const backendMessage = typeof backendPayload.error === "string" ? backendPayload.error.trim() : "";
  const explanation = backendMessage
    ? `${statusMeta.explanation} ${backendMessage}`
    : statusMeta.explanation;

  const devDetails = [
    `Request URL: ${res.url}`,
    `HTTP Status: ${res.status} ${res.statusText}`,
    devHint ? `Dev Hint: ${devHint}` : null,
    backendMessage ? `Backend Error: ${backendMessage}` : null,
    !backendMessage && rawBodyText ? `Raw Response: ${rawBodyText.slice(0, 300)}` : null,
  ].filter(Boolean).join("\n");

  return new UserFriendlyError({
    status: res.status,
    title: statusMeta.title,
    explanation,
    action: statusMeta.action,
    code: `HTTP_${res.status}`,
    devDetails,
  });
}

/**
 * Normalizes any error into a UserFriendlyError.
 */
export function normalizeError(err, fallbackContext = "processing your request", devHint = "") {
  if (err instanceof UserFriendlyError) {
    return err;
  }

  if (err instanceof TypeError && /failed to fetch|networkerror/i.test(err.message)) {
    return formatNetworkError(err, fallbackContext, devHint);
  }

  const message = err?.message || String(err || "An unexpected error occurred.");
  return new UserFriendlyError({
    status: err?.status || null,
    title: err?.title || (err?.status ? `Error ${err.status}` : "Application Error"),
    explanation: message,
    action: err?.action || "Please try again or refresh the page.",
    code: err?.code || "GENERAL_ERROR",
    devDetails: [
      devHint ? `Dev Hint: ${devHint}` : null,
      err?.stack ? `Stack:\n${err.stack}` : null,
    ].filter(Boolean).join("\n"),
    cause: err,
  });
}
