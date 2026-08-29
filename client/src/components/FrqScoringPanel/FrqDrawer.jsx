import { css } from "../../theme/colors";
import { FRQ_MAX_SCORE } from "../../constants/frq";
import { YEAR_CFG } from "../../constants/config";

function yearBadgeConfig(yearRaw) {
  if (yearRaw == null || yearRaw === "") return null;
  const rawYear = String(yearRaw).toLowerCase().replace(/\s/g, "");
  return YEAR_CFG[rawYear] || null;
}

function scoreColor(total) {
  return total >= FRQ_MAX_SCORE * 0.75 ? css.greenDark : total >= FRQ_MAX_SCORE * 0.5 ? css.amber : css.red;
}

export default function FrqDrawer({ open, onClose, reviews, loading = false, onReviewClick }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.22)",
          zIndex: 100,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "all" : "none",
          transition: "opacity 0.22s",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 420,
          background: css.bgLight,
          borderLeft: `1px solid ${css.borderLight}`,
          display: "flex",
          flexDirection: "column",
          zIndex: 101,
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s cubic-bezier(0.22,1,0.36,1)",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.1)",
        }}
      >
        <div
          style={{
            padding: "18px 20px 14px",
            borderBottom: `1px solid ${css.borderLight}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: css.textDark }}>Past Free-Response Grades</div>
            <div style={{ fontSize: 10, color: css.textGray, marginTop: 2 }}>Edit or review past application response grades</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: `1px solid ${css.borderLight}`,
              background: css.cardWhite,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 12,
              color: css.textGray,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 20px", scrollbarWidth: "thin" }}>
          {loading && reviews.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: css.textGray, fontSize: 12 }}>
              Loading…
            </div>
          ) : reviews.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: css.textGray, fontSize: 12, lineHeight: 1.7 }}>
              <span style={{ fontSize: 28, display: "block", marginBottom: 10, opacity: 0.6 }}>📝</span>
              No free-response grades yet.
            </div>
          ) : (
            <>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: css.textGray,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  padding: "6px 0 8px",
                }}
              >
                All Free-Response Grades ({reviews.length})
              </div>
              {reviews.map((r) => {
                const yr = yearBadgeConfig(r.year);
                const title = r.resumeName || r.candidateName || "Unnamed candidate";
                const total = Number(r.score ?? r.total);
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
                    }}
                  >
                    {yr && (
                      <div style={{ width: 4, height: 36, borderRadius: 3, background: yr.panelColor, flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: css.textDark }}>{title}</div>
                      {r.major ? (
                        <div style={{ fontSize: 11, color: css.textGray, marginTop: 3 }}>{r.major}</div>
                      ) : null}
                    </div>
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        fontFamily: "'DM Mono', monospace",
                        color: scoreColor(total),
                      }}
                    >
                      {total}
                      <span style={{ fontSize: 11, color: css.textGray, fontWeight: 500 }}>/{FRQ_MAX_SCORE}</span>
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
