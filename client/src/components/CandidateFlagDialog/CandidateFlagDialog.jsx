import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { API } from "../../constants/config";
import { css } from "../../theme/colors";

export const MIN_FLAG_REASON_LENGTH = 20;
const MAX_FLAG_REASON_LENGTH = 300;

export default function CandidateFlagDialog({
  open,
  candidateId,
  resumeId,
  candidateName,
  authedFetch,
  onClose,
  onFlagged,
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event) {
      if (event.key === "Escape" && !busy) onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [busy, onClose, open]);

  useEffect(() => {
    if (!open) {
      setReason("");
      setError("");
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  const trimmedReason = reason.trim();
  const reasonTooShort = trimmedReason.length < MIN_FLAG_REASON_LENGTH;
  const canSubmit = Boolean((candidateId || resumeId) && authedFetch && !reasonTooShort && !busy);

  async function submit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setError("");
    try {
      const response = await authedFetch(`${API}/candidate-flags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_id: candidateId || undefined,
          resume_id: resumeId || undefined,
          reason: trimmedReason,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Could not flag candidate");

      onFlagged?.(json);
      onClose();
    } catch (err) {
      setError(err.message || "Could not flag candidate");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(17, 24, 39, 0.58)",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "min(460px, 100%)",
          maxHeight: "calc(100dvh - 32px)",
          overflowY: "auto",
          borderRadius: 14,
          border: `1px solid ${css.borderLight}`,
          background: css.cardWhite,
          boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, padding: "20px 20px 14px" }}>
          <div style={{ minWidth: 0 }}>
            <h2 id={titleId} style={{ margin: 0, color: css.greenDark, fontSize: 18, lineHeight: 1.25 }}>
              Flag candidate
            </h2>
            <p id={descriptionId} style={{ margin: "6px 0 0", color: css.textGray, fontSize: 12, lineHeight: 1.5 }}>
              Tell admins what needs attention{candidateName ? ` for ${candidateName}` : ""}. This does not submit or change your grade.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close flag dialog"
            disabled={busy}
            onClick={onClose}
            style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", border: `1px solid ${css.borderLight}`, background: css.cardWhite, color: css.textGray, cursor: busy ? "wait" : "pointer", fontSize: 20, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "0 20px 18px" }}>
          <label htmlFor={`${titleId}-reason`} style={{ display: "block", marginBottom: 7, color: css.textDark, fontSize: 12, fontWeight: 700 }}>
            Reason for flagging
          </label>
          <textarea
            id={`${titleId}-reason`}
            autoFocus
            value={reason}
            onChange={(event) => setReason(event.target.value.slice(0, MAX_FLAG_REASON_LENGTH))}
            placeholder="Describe the concern or context an admin should review…"
            rows={5}
            style={{ width: "100%", minHeight: 110, boxSizing: "border-box", padding: "11px 12px", resize: "vertical", borderRadius: 8, border: `1px solid ${error ? css.red : css.borderLight}`, background: "#F9FAFB", color: css.textDark, font: "inherit", fontSize: 13, lineHeight: 1.5 }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 6, fontSize: 11 }}>
            <span style={{ color: error ? css.red : css.textGray }} role={error ? "alert" : undefined}>{error}</span>
            <span style={{ flexShrink: 0, color: reasonTooShort ? css.amber : css.textGray }}>
              {trimmedReason.length}/{MIN_FLAG_REASON_LENGTH} minimum
            </span>
          </div>
        </div>

        <div style={{ position: "sticky", bottom: 0, display: "flex", justifyContent: "flex-end", gap: 9, padding: "12px 20px", borderTop: `1px solid ${css.borderLight}`, background: css.cardWhite }}>
          <button type="button" disabled={busy} onClick={onClose} style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${css.borderLight}`, background: css.cardWhite, color: css.textGray, fontSize: 12, fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>
            Cancel
          </button>
          <button type="submit" disabled={!canSubmit} aria-busy={busy || undefined} style={{ padding: "9px 14px", borderRadius: 8, border: "none", background: css.amber, color: css.textDark, fontSize: 12, fontWeight: 700, cursor: canSubmit ? "pointer" : "not-allowed", opacity: canSubmit ? 1 : 0.5 }}>
            {busy ? "Flagging…" : "Create flag"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
