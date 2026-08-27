import React from "react";
import { css } from "../../theme/colors";
import { normalizeError } from "../../utils/errors";

/**
 * Standardized Error Banner component.
 *
 * Displays a structured, informative error message:
 * - Error Status / Title (e.g., "404 Not Found", "Network Connection Error")
 * - Full Explanatory Sentence
 * - Recommended Next Steps
 * - Optional Retry or Dismiss buttons
 * - Expandable "Developer Diagnostics" drawer in local development mode (`import.meta.env.DEV`)
 */
export default function ErrorBanner({
  error,
  onRetry,
  onDismiss,
  style = {},
  compact = false,
}) {
  if (!error) return null;

  const normalized = normalizeError(error);
  const isDev = import.meta.env.DEV;

  const title = normalized.title || (normalized.status ? `Error ${normalized.status}` : "Error");
  const explanation = normalized.explanation || normalized.message;
  const action = normalized.action;
  const devDetails = normalized.devDetails;

  return (
    <div
      role="alert"
      style={{
        background: "rgba(226, 75, 74, 0.08)",
        border: "1px solid rgba(226, 75, 74, 0.25)",
        borderRadius: 10,
        padding: compact ? "10px 12px" : "14px 16px",
        margin: "10px 0",
        color: css.textDark,
        fontSize: compact ? 12 : 13,
        lineHeight: 1.5,
        ...style,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: css.red, fontSize: compact ? 12 : 13, marginBottom: 2 }}>
            {title}
          </div>
          <div style={{ color: css.textDark, wordBreak: "break-word" }}>
            {explanation}
          </div>
          {action && (
            <div style={{ fontSize: compact ? 11 : 12, color: css.textGray, marginTop: 4 }}>
              {action}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              style={{
                background: "#FFF",
                border: `1px solid ${css.borderLight}`,
                borderRadius: 6,
                padding: "5px 10px",
                fontSize: 12,
                fontWeight: 600,
                color: css.textDark,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Try again
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss error"
              style={{
                background: "transparent",
                border: "none",
                fontSize: 16,
                lineHeight: 1,
                cursor: "pointer",
                color: css.textGray,
                padding: 4,
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {isDev && devDetails && (
        <details
          style={{
            marginTop: 10,
            borderTop: "1px dashed rgba(226, 75, 74, 0.3)",
            paddingTop: 8,
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 700,
              color: "#991B1B",
              userSelect: "none",
            }}
          >
            🛠 Developer Diagnostics (Local Dev Only)
          </summary>
          <pre
            style={{
              marginTop: 6,
              padding: 10,
              background: "#1E293B",
              color: "#F8FAFC",
              borderRadius: 6,
              fontSize: 11,
              fontFamily: "monospace",
              overflowX: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {devDetails}
          </pre>
        </details>
      )}
    </div>
  );
}
