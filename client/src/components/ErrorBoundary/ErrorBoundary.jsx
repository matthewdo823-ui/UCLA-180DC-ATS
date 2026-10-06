import React from "react";
import { css } from "../../theme/colors";

/**
 * Top-level React Error Boundary to catch render/lifecycle exceptions.
 * Prevents full-screen whiteout crashes by rendering a recovery UI.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("[ErrorBoundary caught render failure]", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDev = import.meta.env.DEV;
      const error = this.state.error;
      const errorInfo = this.state.errorInfo;

      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: css.bgLight,
            color: css.textDark,
            padding: 24,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: 540,
              width: "100%",
              background: "var(--color-surface)",
              borderRadius: 16,
              border: `1px solid ${css.borderLight}`,
              boxShadow: "0 12px 40px rgba(0, 0, 0, 0.08)",
              padding: 32,
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "rgba(226, 75, 74, 0.1)",
                color: css.red,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                fontWeight: 700,
                marginBottom: 16,
              }}
            >
              !
            </div>
            <h2 style={{ fontSize: 20, margin: "0 0 8px", color: css.textDark, fontWeight: 700 }}>
              Something went wrong
            </h2>
            <p style={{ fontSize: 14, color: css.textGray, margin: "0 0 24px", lineHeight: 1.5 }}>
              The application encountered an unexpected issue while rendering this page.
              Try reloading the page or returning to the dashboard.
            </p>

            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: isDev ? 20 : 0 }}>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  background: css.greenDark,
                  color: "var(--color-on-primary)",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Reload Page
              </button>
              <button
                type="button"
                onClick={() => { window.location.href = "/"; }}
                style={{
                  background: "var(--color-surface)",
                  color: css.textDark,
                  border: `1px solid ${css.borderLight}`,
                  borderRadius: 8,
                  padding: "10px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Go to Dashboard
              </button>
            </div>

            {isDev && error && (
              <details
                open
                style={{
                  marginTop: 20,
                  textAlign: "left",
                  borderTop: "1px dashed rgba(226,75,74,0.3)",
                  paddingTop: 14,
                }}
              >
                <summary style={{ cursor: "pointer", fontSize: 11, fontWeight: 700, color: "var(--color-danger-text)" }}>
                  🛠 Developer Stack Trace (Local Dev Only)
                </summary>
                <pre
                  style={{
                    marginTop: 8,
                    padding: 12,
                    background: "#1E293B",
                    color: "#F8FAFC",
                    borderRadius: 8,
                    fontSize: 11,
                    fontFamily: "monospace",
                    overflowX: "auto",
                    maxHeight: 240,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {error.toString()}
                  {"\n\nComponent Stack:"}
                  {errorInfo?.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
