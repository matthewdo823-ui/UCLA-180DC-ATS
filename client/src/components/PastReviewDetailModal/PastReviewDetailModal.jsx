import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthedFetch } from "../../auth/AuthContext";
import { BUBBLE_COLORS, API, RUBRIC_MAX_PER_CATEGORY } from "../../constants/config";
import { rubricFromSnapshot } from "../../utils/rubric";
import { css } from "../../theme/colors";
import { serifFont } from "../../theme/typography";
import { formatScore, getInitials, titleCase } from "../../utils/format";
const cardGreen = "#085041";
const cardMint = "#1D9E75";
const cardPale = "#EAF3DE";
const cardLime = "#C0DD97";

function aggregateFromScores(scores, metrics = []) {
  return metrics.reduce((sum, m) => sum + (Number(scores[m]) || 0), 0);
}

async function readErrorBody(res) {
  const text = await res.text();
  if (!text) return res.statusText || `Request failed (${res.status})`;
  try {
    const json = JSON.parse(text);
    if (json && typeof json.error === "string") return json.error;
    return text.slice(0, 280);
  } catch {
    return text.slice(0, 280);
  }
}

function ScoreTiles({ score, maxScore }) {
  const filled = Number.isFinite(Number(score)) ? Math.round(Number(score)) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 2 }}>
      {Array.from({ length: maxScore }).map((_, index) => (
        <div
          key={index}
          style={{
            width: 9,
            height: 9,
            borderRadius: 2,
            background: index < filled ? cardMint : cardLime,
          }}
        />
      ))}
    </div>
  );
}

function CategoryRowEdit({ metric, value, onScore, maxPerCategory = RUBRIC_MAX_PER_CATEGORY }) {
  const num = Number(value);
  const has = Number.isFinite(num);
  const pct = has ? Math.max(0, Math.min(100, (num / maxPerCategory) * 100)) : 0;
  const levels = Array.from({ length: maxPerCategory }, (_, i) => i + 1);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6, alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: css.textDark }}>{titleCase(metric)}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: cardGreen, fontFamily: "'DM Mono', monospace" }}>
          {formatScore(value, { fallback: "—" })} <span style={{ color: css.textGray, fontWeight: 500 }}>/ {maxPerCategory}</span>
        </span>
      </div>
      <div style={{ height: 6, background: "#E8EDE4", borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: cardMint, borderRadius: 3, transition: "width 0.25s ease" }} />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {levels.map((n) => {
          const sel = has && num === n;
          const c = BUBBLE_COLORS[n];
          return (
            <button
              key={n}
              type="button"
              onClick={() => onScore(metric, n)}
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                border: `1px solid ${sel ? c.bd : "#DDE3D8"}`,
                color: sel ? c.color : css.textGray,
                background: sel ? c.bg : "#FFF",
                fontFamily: "'DM Mono', monospace",
                boxShadow: sel ? `0 0 0 1px ${c.bd}22` : "none",
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function buildPayloadScores(scores, metrics = []) {
  const out = {};
  for (const m of metrics) {
    out[m] = Math.round(Number(scores[m]));
  }
  return out;
}

export default function PastReviewDetailModal({ review, onClose, onSaved }) {
  const authedFetch = useAuthedFetch();
  const [scores, setScores] = useState({});
  const [notes, setNotes] = useState("");
  const [decision, setDecision] = useState("pass");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const successTimerRef = useRef(null);
  const prevReviewIdRef = useRef(undefined);

  const displayName = review?.resumeName || review?.candidateName || "Resume";
  const rubric = useMemo(
    () => rubricFromSnapshot(review?.rubricSnapshot) || { metrics: review?.metrics || [], maxPerCategory: RUBRIC_MAX_PER_CATEGORY },
    [review]
  );
  const metrics = rubric.metrics || [];
  const maxPerCategory = rubric.maxPerCategory || RUBRIC_MAX_PER_CATEGORY;
  const maxScore = rubric.maxScore || metrics.length * maxPerCategory;

  useEffect(() => {
    if (!review) return;
    const rid = review.reviewId;
    if (prevReviewIdRef.current !== undefined && prevReviewIdRef.current !== rid) {
      setSaveSuccess(false);
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    }
    prevReviewIdRef.current = rid;

    const reviewMetrics = review.metrics || rubricFromSnapshot(review.rubricSnapshot)?.metrics || [];
    const max = rubricFromSnapshot(review.rubricSnapshot)?.maxPerCategory || RUBRIC_MAX_PER_CATEGORY;
    const next = {};
    for (const m of reviewMetrics) {
      const raw = review.scores?.[m];
      const n = Number(raw);
      next[m] = Number.isFinite(n) && n >= 1 && n <= max ? Math.round(n) : null;
    }
    setScores(next);
    setNotes(review.notes ?? "");
    setDecision(review.decision === "flag" ? "flag" : "pass");
    setError("");
  }, [review]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const scoringComplete = useMemo(
    () =>
      metrics.length > 0 &&
      metrics.every((m) => {
        const v = Number(scores[m]);
        return Number.isFinite(v) && v >= 1 && v <= maxPerCategory;
      }),
    [scores, metrics, maxPerCategory]
  );

  const total = useMemo(() => aggregateFromScores(scores, metrics), [scores, metrics]);

  const handleSave = useCallback(async () => {
    if (!review?.reviewId || !scoringComplete) return;
    setSaving(true);
    setError("");
    try {
      const payloadScores = buildPayloadScores(scores, metrics);
      const res = await authedFetch(`${API}/reviews/${encodeURIComponent(String(review.reviewId).trim())}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scores: payloadScores, notes, decision }),
      });
      if (!res.ok) {
        const msg = await readErrorBody(res);
        throw new Error(msg);
      }
      const text = await res.text();
      let body = {};
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          throw new Error("Invalid response from server");
        }
      }
      if (body.review) {
        onSaved?.(body.review);
        setSaveSuccess(true);
        if (successTimerRef.current) clearTimeout(successTimerRef.current);
        successTimerRef.current = setTimeout(() => {
          setSaveSuccess(false);
          successTimerRef.current = null;
        }, 4000);
      }
    } catch (e) {
      setError(e.message || "Save failed");
      setSaveSuccess(false);
    } finally {
      setSaving(false);
    }
  }, [authedFetch, review?.reviewId, scores, notes, decision, scoringComplete, onSaved]);

  if (!review) return null;

  const submitted = review.submittedAt ? new Date(review.submittedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Review detail"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(17, 24, 39, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(400px, 100%)",
          position: "relative",
          maxHeight: "min(90vh, 680px)",
          overflowY: "auto",
          borderRadius: 20,
          boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
        }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{
            position: "absolute",
            right: 10,
            top: 10,
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: `1px solid ${css.borderLight}`,
            background: "#FFF",
            color: css.textGray,
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ×
        </button>

        <div style={{ borderRadius: 20, overflow: "hidden", border: `1px solid ${cardGreen}`, background: "#FFF" }}>
          <div style={{ background: `linear-gradient(165deg, ${cardGreen} 0%, #0a3d32 100%)`, padding: "20px 20px 18px" }}>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", margin: "0 0 12px", textTransform: "uppercase" }}>
              Your review
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 14, paddingRight: 36 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: cardMint,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  fontWeight: 700,
                  color: cardPale,
                  flexShrink: 0,
                  border: "2px solid rgba(255,255,255,0.35)",
                }}
              >
                {getInitials(displayName)}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ color: "#FFF", fontSize: 17, fontFamily: serifFont, fontWeight: 600, margin: "0 0 4px", lineHeight: 1.2 }}>{displayName}</p>
                <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, margin: 0, lineHeight: 1.35 }}>
                  {[review.major, review.year ? titleCase(String(review.year)) : null, review.gpa ? `GPA ${review.gpa}` : null].filter(Boolean).join(" · ") || "Round 1 resume screen"}
                </p>
                {submitted ? (
                  <p style={{ color: "rgba(159,225,203,0.9)", fontSize: 11, margin: "6px 0 0", fontWeight: 600 }}>Submitted {submitted}</p>
                ) : null}
              </div>
            </div>
          </div>

          <div style={{ background: cardPale, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, borderBottom: "1px solid #D4DECC" }}>
            <div>
              <p style={{ fontSize: 10, color: "#3B6D11", margin: "0 0 4px", fontWeight: 800, letterSpacing: "0.06em" }}>TOTAL</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: cardGreen, margin: 0, lineHeight: 1, fontFamily: "'DM Mono', monospace" }}>
                {formatScore(total, { fallback: "—" })} <span style={{ fontSize: 14, color: "#3B6D11", fontWeight: 600 }}>/ {maxScore}</span>
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 10, color: "#3B6D11", margin: "0 0 6px", fontWeight: 800, letterSpacing: "0.06em" }}>{metrics.length} categories</p>
              <ScoreTiles score={total} maxScore={maxScore} />
            </div>
          </div>

          <div style={{ padding: "18px 20px 8px" }}>
            <p style={{ fontSize: 10, color: css.textGray, letterSpacing: "0.08em", margin: "0 0 14px", fontWeight: 800 }}>SCORES</p>
            {metrics.map((metric) => (
              <CategoryRowEdit key={metric} metric={metric} value={scores[metric]} maxPerCategory={maxPerCategory} onScore={(m, v) => setScores((s) => ({ ...s, [m]: v }))} />
            ))}
          </div>

          <div style={{ padding: "0 20px 16px" }}>
            <p style={{ fontSize: 10, color: css.textGray, letterSpacing: "0.08em", margin: "0 0 10px", fontWeight: 800 }}>DECISION</p>
            <div style={{ display: "flex", borderRadius: 12, overflow: "hidden", border: `1px solid ${css.borderLight}`, background: "#F3F4F2" }}>
              {[
                { key: "pass", label: "Complete" },
                { key: "flag", label: "Flag" },
              ].map(({ key, label }) => {
                const sel = decision === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDecision(key)}
                    style={{
                      flex: 1,
                      padding: "11px 12px",
                      border: "none",
                      background: sel ? (key === "pass" ? css.greenDark : css.amber) : "transparent",
                      color: sel ? "#FFF" : css.textGray,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "background 0.15s, color 0.15s",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ margin: "0 20px 16px", padding: "14px 14px", background: "#FAFBF9", border: `1px solid ${css.borderLight}`, borderRadius: 12 }}>
            <p style={{ fontSize: 10, color: css.textGray, letterSpacing: "0.08em", margin: "0 0 8px", fontWeight: 800 }}>NOTES</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 300))}
              rows={4}
              style={{
                width: "100%",
                boxSizing: "border-box",
                resize: "vertical",
                minHeight: 88,
                padding: "10px 12px",
                borderRadius: 8,
                border: `1px solid ${css.borderLight}`,
                fontSize: 13,
                fontFamily: "'DM Sans', sans-serif",
                color: css.textDark,
                background: "#FFF",
              }}
            />
            <div style={{ fontSize: 10, color: css.textGray, marginTop: 6, textAlign: "right" }}>{notes.length} / 300</div>
          </div>

          {error ? (
            <div style={{ margin: "0 20px 14px", padding: "10px 12px", background: "rgba(226,75,74,0.08)", border: "1px solid rgba(226,75,74,0.3)", borderRadius: 10, color: css.red, fontSize: 12, fontWeight: 600 }}>
              {error}
            </div>
          ) : null}

          {saveSuccess ? (
            <div
              role="status"
              aria-live="polite"
              style={{
                margin: "0 20px 14px",
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid rgba(29,158,117,0.35)",
                background: "linear-gradient(135deg, rgba(232,248,240,0.95) 0%, rgba(239,252,246,0.75) 100%)",
                display: "flex",
                alignItems: "center",
                gap: 12,
                boxShadow: "0 2px 10px rgba(40,98,65,0.08)",
              }}
            >
              <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden>✓</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: css.greenDark }}>Review saved</div>
                <div style={{ fontSize: 12, color: css.textGray, marginTop: 2, lineHeight: 1.4 }}>Your changes are updated in Past Reviews.</div>
              </div>
            </div>
          ) : null}

          <div style={{ padding: "14px 20px 18px", borderTop: `1px solid ${css.borderLight}`, display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", background: "#FAFBF9" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: `1px solid ${css.borderLight}`,
                background: "#FFF",
                color: css.textDark,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!review.reviewId || !scoringComplete || saving}
              onClick={handleSave}
              style={{
                padding: "10px 20px",
                borderRadius: 10,
                border: "none",
                background: scoringComplete && !saving ? css.greenDark : css.borderLight,
                color: "#FFF",
                fontSize: 13,
                fontWeight: 600,
                cursor: scoringComplete && !saving ? "pointer" : "not-allowed",
                opacity: saving ? 0.88 : 1,
              }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
