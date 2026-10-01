import ErrorBanner from "../../components/ErrorBanner/ErrorBanner";
import { useEffect } from "react";
import { css } from "../../theme/colors";
import { hasText } from "./applicationUtils";
import EssayBlock from "./components/EssayBlock";
import { getGradableApplicationResponses, UNRENDERABLE_RESPONSES_MESSAGE } from "../../utils/applicationResponses";

export default function ApplicationResponsesModal({ open, onClose, candidate, responses, loading = false, error, onRetry }) {
  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  const answers = responses || candidate;
  const gradableResponses = getGradableApplicationResponses(answers);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="application-responses-modal-title"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(0,0,0,0.45)",
      }}
    >
      <div
        style={{
          width: "min(760px, 100%)",
          maxHeight: "min(82vh, 760px)",
          display: "flex",
          flexDirection: "column",
          background: css.cardWhite,
          border: `1px solid ${css.borderLight}`,
          borderRadius: 12,
          boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px", borderBottom: `1px solid ${css.borderLight}` }}>
          <h2 id="application-responses-modal-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: css.textDark }}>
            Application responses
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close application responses"
            style={{ border: "none", background: "transparent", fontSize: 24, lineHeight: 1, color: css.textGray, cursor: "pointer", padding: 0 }}
          >
            ×
          </button>
        </div>
        <div style={{ overflowY: "auto", padding: "20px 22px" }}>
          {error ? <ErrorBanner error={error} onRetry={onRetry} /> : loading ? <p role="status">Loading free responses…</p> : <>
          {gradableResponses.length === 0 ? (
            <p style={{ margin: "0 0 18px", fontSize: 14, fontStyle: "italic", color: css.textGray }}>
              {UNRENDERABLE_RESPONSES_MESSAGE}
            </p>
          ) : (
            gradableResponses.map(({ questionId, title, answer }) => (
              <EssayBlock key={questionId} label={title} text={answer} />
            ))
          )}
          <div>
            <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: css.textGray }}>Extenuating circumstances</p>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: hasText(answers.extenuatingCircumstances) ? css.textDark : css.textGray, whiteSpace: "pre-wrap" }}>
              {hasText(answers.extenuatingCircumstances) ? answers.extenuatingCircumstances.trim() : "Not provided"}
            </p>
          </div>
          </>}
        </div>
      </div>
    </div>
  );
}
