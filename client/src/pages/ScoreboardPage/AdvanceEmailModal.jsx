import { useCallback, useEffect, useState } from "react";
import { API } from "../../constants/config";
import { css } from "../../theme/colors";
import ErrorBanner from "../../components/ErrorBanner/ErrorBanner";
import { formatResponseError } from "../../utils/errors";

const TEMPLATE_VARIABLES = [
  { key: "candidateName", label: "Candidate name" },
  { key: "cycleName", label: "Cycle name" },
  { key: "roundName", label: "Current round" },
  { key: "nextRoundName", label: "Next round" },
];

function formatSentAt(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AdvanceEmailModal({
  open,
  onClose,
  roundId,
  roundName,
  roundStatus,
  advancedCount,
  notification,
  userEmail,
  authedFetch,
  onSaved,
  onSent,
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!open) return;
    const template = notification?.template;
    setSubject(template?.subject || "");
    setBody(template?.body || "");
    setError("");
    setSuccess("");
    setBusy("");
  }, [open, notification?.template]);

  const saveTemplate = useCallback(async () => {
    if (!roundId) return false;
    setBusy("save");
    setError(null);
    setSuccess("");
    try {
      const res = await authedFetch(`${API}/rounds/${encodeURIComponent(roundId)}/advance-notification`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      if (!res.ok) throw await formatResponseError(res, "saving email template");
      const data = await res.json().catch(() => ({}));
      setSubject(data.template?.subject || subject);
      setBody(data.template?.body || body);
      setSuccess("Template saved.");
      onSaved?.(data.template);
      return true;
    } catch (err) {
      setError(err);
      return false;
    } finally {
      setBusy("");
    }
  }, [authedFetch, body, onSaved, roundId, subject]);

  const sendTest = useCallback(async () => {
    if (!roundId) return;
    setBusy("test");
    setError(null);
    setSuccess("");
    try {
      const saved = await saveTemplate();
      if (!saved) return;

      const res = await authedFetch(
        `${API}/rounds/${encodeURIComponent(roundId)}/advance-notification/test`,
        { method: "POST" }
      );
      if (!res.ok) throw await formatResponseError(res, "sending test email");
      const data = await res.json().catch(() => ({}));
      setSuccess(`Test email sent to ${data.sentTo || userEmail || "your inbox"}.`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy("");
    }
  }, [authedFetch, roundId, saveTemplate, userEmail]);

  const sendBatch = useCallback(async (allowResend = false) => {
    if (!roundId) return;
    const label = allowResend ? "Resend" : "Send";
    const confirmed = window.confirm(
      allowResend
        ? `Resend advance emails to ${advancedCount} candidate(s)? Everyone will receive the message again.`
        : `Send advance emails to ${advancedCount} candidate(s)?`
    );
    if (!confirmed) return;

    setBusy("send");
    setError(null);
    setSuccess("");
    try {
      const saved = await saveTemplate();
      if (!saved) return;

      const res = await authedFetch(
        `${API}/rounds/${encodeURIComponent(roundId)}/advance-notification/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allowResend }),
        }
      );
      if (!res.ok) throw await formatResponseError(res, `${label.toLowerCase()}ing advance emails`);
      const data = await res.json().catch(() => ({}));

      const parts = [`${data.sent} sent`];
      if (data.failed) parts.push(`${data.failed} failed`);
      if (data.skipped) parts.push(`${data.skipped} skipped (no email)`);
      setSuccess(`${label} complete: ${parts.join(", ")}.`);
      onSent?.();
    } catch (err) {
      setError(err);
    } finally {
      setBusy("");
    }
  }, [advancedCount, authedFetch, onSent, roundId, saveTemplate]);

  if (!open) return null;

  const gmailConfigured = notification?.gmailConfigured === true;
  const lastBatch = notification?.lastBatch;
  const isClosed = roundStatus === "closed";
  const canSend = isClosed && advancedCount > 0 && gmailConfigured;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          zIndex: 200,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="advance-email-title"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(560px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 48px)",
          overflow: "auto",
          background: "var(--color-surface)",
          borderRadius: 12,
          border: `1px solid ${css.borderLight}`,
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
          zIndex: 201,
          padding: "20px 22px 18px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
          <div>
            <h2 id="advance-email-title" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: css.textDark }}>
              Advance email
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: css.textGray }}>
              {roundName || "Round"} · plain text · sent from Gmail
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: "none",
              background: "transparent",
              fontSize: 22,
              lineHeight: 1,
              cursor: "pointer",
              color: css.textGray,
            }}
          >
            ×
          </button>
        </div>

        {!gmailConfigured ? (
          <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 8, background: "rgba(239,159,39,0.12)", border: "1px solid rgba(239,159,39,0.35)", fontSize: 12, color: "var(--color-warning-text)" }}>
            Gmail integration is not configured on the server. Contact an administrator to enable email dispatch.
            {import.meta.env.DEV && (
              <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "var(--color-warning-text)" }}>
                🛠 Local dev: see server/docs/gmail-setup.md
              </span>
            )}
          </div>
        ) : null}

        {lastBatch ? (
          <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 8, background: "rgba(29,158,117,0.08)", border: "1px solid rgba(29,158,117,0.22)", fontSize: 12, color: css.greenDark }}>
            Last sent {formatSentAt(lastBatch.sentAt)} · {lastBatch.recipientCount} recipient
            {lastBatch.recipientCount === 1 ? "" : "s"}
            {lastBatch.sentByEmail ? ` · by ${lastBatch.sentByEmail}` : ""}
          </div>
        ) : null}

        <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: css.textDark }}>Subject</p>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            borderRadius: 8,
            border: `1px solid ${css.borderLight}`,
            fontSize: 13,
            marginBottom: 14,
          }}
        />

        <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: css.textDark }}>Body</p>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            borderRadius: 8,
            border: `1px solid ${css.borderLight}`,
            fontSize: 13,
            lineHeight: 1.5,
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />

        <p style={{ margin: "10px 0 0", fontSize: 11, color: css.textGray }}>
          Variables:{" "}
          {TEMPLATE_VARIABLES.map((v, i) => (
            <span key={v.key}>
              {i > 0 ? ", " : ""}
              <code style={{ fontSize: 11 }}>{`{{${v.key}}}`}</code>
            </span>
          ))}
          . Test emails use sample name &ldquo;Alex Chen&rdquo;.
        </p>

        {error ? (
          <ErrorBanner error={error} compact onDismiss={() => setError(null)} style={{ marginTop: 12 }} />
        ) : null}
        {success ? (
          <p style={{ margin: "12px 0 0", fontSize: 12, color: css.greenDark, fontWeight: 600 }}>{success}</p>
        ) : null}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${css.borderLight}`,
              background: "var(--color-surface)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Close
          </button>
          <button
            type="button"
            disabled={!!busy || !gmailConfigured}
            onClick={() => saveTemplate()}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${css.borderLight}`,
              background: "var(--color-surface)",
              fontSize: 12,
              fontWeight: 600,
              cursor: busy || !gmailConfigured ? "not-allowed" : "pointer",
              opacity: busy && busy !== "save" ? 0.6 : 1,
            }}
          >
            {busy === "save" ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            disabled={!!busy || !gmailConfigured}
            onClick={sendTest}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${css.green}`,
              background: "rgba(29,158,117,0.1)",
              color: css.green,
              fontSize: 12,
              fontWeight: 700,
              cursor: busy || !gmailConfigured ? "not-allowed" : "pointer",
              opacity: busy && busy !== "test" ? 0.6 : 1,
            }}
          >
            {busy === "test" ? "Sending test…" : `Send test to me${userEmail ? "" : ""}`}
          </button>
          {canSend && !lastBatch ? (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => sendBatch(false)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px solid ${css.green}`,
                background: css.green,
                color: "#FFF",
                fontSize: 12,
                fontWeight: 700,
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy && busy !== "send" ? 0.6 : 1,
              }}
            >
              {busy === "send" ? "Sending…" : `Email advanced (${advancedCount})`}
            </button>
          ) : null}
          {canSend && lastBatch ? (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => sendBatch(true)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px solid ${css.amber}`,
                background: "rgba(239,159,39,0.15)",
                color: "var(--color-warning-text)",
                fontSize: 12,
                fontWeight: 700,
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy && busy !== "send" ? 0.6 : 1,
              }}
            >
              {busy === "send" ? "Sending…" : `Resend (${advancedCount})`}
            </button>
          ) : null}
        </div>

        {!isClosed ? (
          <p style={{ margin: "12px 0 0", fontSize: 11, color: css.textGray, textAlign: "right" }}>
            Batch send unlocks after this round is closed.
          </p>
        ) : null}
      </div>
    </>
  );
}
