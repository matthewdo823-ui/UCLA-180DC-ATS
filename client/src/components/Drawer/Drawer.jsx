import { css } from "../../theme/colors";
import { YEAR_CFG, DEC_STYLE } from "../../constants/config";
import { resolveReviewMaxScore } from "../../utils/rubric";

function yearBadgeConfig(yearRaw) {
  if (yearRaw == null || yearRaw === "") return null;
  const rawYear = String(yearRaw).toLowerCase().replace(/\s/g, "");
  return YEAR_CFG[rawYear] || null;
}

export default function Drawer({ open, onClose, reviews, loading = false, onReviewClick }) {
  const passCount = reviews.filter((r) => r.decision === "pass").length;
  const flagCount = reviews.filter((r) => r.decision === "flag").length;
  const scoreColor = (review) => {
    const max = resolveReviewMaxScore(review);
    const total = Number(review?.total) || 0;
    return total >= max * 0.75 ? css.greenDark : total >= max * 0.5 ? css.amber : css.red;
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.22)", zIndex: 100, opacity: open ? 1 : 0, pointerEvents: open ? "all" : "none", transition: "opacity 0.22s" }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, background: css.bgLight, borderLeft: `1px solid ${css.borderLight}`, display: "flex", flexDirection: "column", zIndex: 101, transform: open ? "translateX(0)" : "translateX(100%)", transition: "transform 0.3s cubic-bezier(0.22,1,0.36,1)", boxShadow: "-12px 0 40px rgba(0,0,0,0.1)" }}>
        <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${css.borderLight}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: css.textDark }}>Past Resume Grades</div>
            <div style={{ fontSize: 10, color: css.textGray, marginTop: 2 }}>View or edit your past resume grades.</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${css.borderLight}`, background: css.cardWhite, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 12, color: css.textGray }}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "12px 20px", borderBottom: `1px solid ${css.borderLight}`, flexShrink: 0 }}>
          {[
            ["pass", passCount, css.greenDark, "Passed"],
            ["flag", flagCount, css.amber, "Flagged"],
          ].map(([, val, color, lbl]) => (
            <div key={lbl} style={{ textAlign: "center", padding: "12px 10px", background: css.cardWhite, borderRadius: 12, border: `1px solid ${css.borderLight}` }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'DM Mono', monospace", color }}>{val}</div>
              <div style={{ fontSize: 9, color: css.textGray, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{lbl}</div>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 20px", scrollbarWidth: "thin", scrollbarColor: `${css.borderLight} transparent`, position: "relative" }}>
          {loading && reviews.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: css.textGray, fontSize: 12 }}>
              <div style={{ width: 28, height: 28, border: `3px solid ${css.borderLight}`, borderTopColor: css.greenDark, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
              Loading your resume grades…
            </div>
          ) : reviews.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: css.textGray, fontSize: 12, lineHeight: 1.7 }}>
              <span style={{ fontSize: 28, display: "block", marginBottom: 10, opacity: 0.6 }}>📄</span>
              No resume grades yet.<br />Complete your first resume grade<br />to see history here.
            </div>
          ) : (
            <>
              {loading ? (
                <div style={{ fontSize: 10, color: css.textGray, fontWeight: 600, textAlign: "center", padding: "4px 0 10px" }}>Refreshing…</div>
              ) : null}
              <div style={{ fontSize: 9, fontWeight: 600, color: css.textGray, textTransform: "uppercase", letterSpacing: "0.08em", padding: "6px 0 8px", marginTop: 4 }}>All Resume Grades ({reviews.length})</div>
              {reviews.map((r) => {
                const yr = yearBadgeConfig(r.year);
                const dec = DEC_STYLE[r.decision] || DEC_STYLE.pass;
                const title = r.resumeName || r.candidateName || "Unnamed resume";
                const subtitleParts = [];
                if (yr) subtitleParts.push(yr.label.charAt(0).toUpperCase() + yr.label.slice(1));
                if (r.major) subtitleParts.push(String(r.major));
                const subtitle = subtitleParts.length ? subtitleParts.join(" · ") : null;
                return (
                  <div
                    key={r.reviewId || r.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onReviewClick?.(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onReviewClick?.(r);
                      }
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: `1px solid ${css.borderLight}`,
                      background: css.cardWhite,
                      marginBottom: 8,
                      cursor: onReviewClick ? "pointer" : "default",
                      outline: "none",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                      transition: "border-color 0.15s, box-shadow 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      if (onReviewClick) {
                        e.currentTarget.style.borderColor = "rgba(40,98,65,0.35)";
                        e.currentTarget.style.boxShadow = "0 2px 8px rgba(40,98,65,0.08)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = css.borderLight;
                      e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.03)";
                    }}
                  >
                    {yr && <div style={{ width: 4, height: 36, borderRadius: 3, background: yr.panelColor, flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: css.textDark, lineHeight: 1.25 }}>{title}</div>
                      {subtitle ? (
                        <div style={{ fontSize: 11, fontWeight: 500, color: css.textGray, marginTop: 3, lineHeight: 1.3 }}>{subtitle}</div>
                      ) : null}
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: scoreColor(r), minWidth: 36, textAlign: "right" }}>
                      {r.total}<span style={{ fontSize: 11, color: css.textGray, fontWeight: 500 }}>/{resolveReviewMaxScore(r)}</span>
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "3px 9px",
                        borderRadius: 20,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        border: `1px solid ${dec.bd}`,
                        background: dec.bg,
                        color: dec.color,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {dec.label}
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </>
  );
}
