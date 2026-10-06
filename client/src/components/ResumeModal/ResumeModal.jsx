import { useEffect } from "react";
import PdfViewer from "../PdfViewer/PdfViewer";
import { css } from "../../theme/colors";

export default function ResumeModal({ open, onClose, title, resumeId, fileUrl, authToken }) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !resumeId) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          zIndex: 200,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-modal-title"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(920px, calc(100vw - 32px))",
          height: "min(88vh, 900px)",
          display: "flex",
          flexDirection: "column",
          background: "var(--color-surface)",
          borderRadius: 12,
          border: `1px solid ${css.borderLight}`,
          boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
          zIndex: 201,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            padding: "14px 18px",
            borderBottom: `1px solid ${css.borderLight}`,
            background: css.cardWhite,
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2
              id="resume-modal-title"
              style={{ margin: 0, fontSize: 16, fontWeight: 700, color: css.textDark, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {title || "Resume"}
            </h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12, fontWeight: 600, color: css.greenDark, textDecoration: "none" }}
            >
              Open in Drive ↗
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close resume"
              style={{
                border: "none",
                background: "transparent",
                fontSize: 24,
                lineHeight: 1,
                color: css.textGray,
                cursor: "pointer",
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-surface-subtle)" }}>
          <PdfViewer
            resumeId={resumeId}
            fileUrl={fileUrl}
            authToken={authToken}
          />
        </div>
      </div>
    </>
  );
}
