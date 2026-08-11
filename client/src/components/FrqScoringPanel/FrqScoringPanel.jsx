import { css } from "../../theme/colors";
import { FRQ_MAX_SCORE } from "../../constants/frq";
import { BUBBLE_COLORS } from "../../constants/config";
import ActionBtn from "../ScoringPanel/ActionBtn";

export default function FrqScoringPanel({
  score,
  onScore,
  notes,
  onNotes,
  onComplete,
  scoringComplete = true,
  submitError = "",
}) {
  const total = typeof score === "number" ? score : 0;
  const hasScore = typeof score === "number" && score >= 1 && score <= FRQ_MAX_SCORE;
  const scoreColor = total >= FRQ_MAX_SCORE * 0.75 ? css.greenDark : total >= FRQ_MAX_SCORE * 0.5 ? css.amber : css.red;
  const levels = Array.from({ length: FRQ_MAX_SCORE }, (_, i) => i + 1);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        overflowY: "auto",
        paddingBottom: 16,
        scrollbarWidth: "thin",
        scrollbarColor: `${css.borderLight} transparent`,
      }}
    >
      <div
        style={{
          background: css.cardWhite,
          border: `1px solid ${css.borderLight}`,
          borderRadius: 12,
          padding: "20px 24px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: css.greenDark,
              letterSpacing: "0.05em",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 14 }}>⚖️</span>
            APPLICATION RESPONSES
          </div>
          <span style={{ fontSize: 11, color: css.textGray, fontWeight: 500 }}>Rate 1–{FRQ_MAX_SCORE}</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: css.textDark }}>Overall quality</span>
          <div style={{ display: "flex", gap: 6 }}>
            {levels.map((n) => {
              const sel = hasScore && score === n;
              const c = BUBBLE_COLORS[n];
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => onScore(n)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    border: `1px solid ${sel ? c.bd : css.borderLight}`,
                    color: sel ? c.color : css.textGray,
                    background: sel ? c.bg : css.cardWhite,
                    transition: "all 0.11s",
                    fontFamily: "'DM Mono', monospace",
                    flexShrink: 0,
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          background: css.cardWhite,
          borderRadius: 12,
          border: `1px solid ${css.borderLight}`,
          padding: "20px 24px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 32, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: scoreColor, lineHeight: 1 }}>
              {hasScore ? total : "—"}
            </span>
            <span style={{ fontSize: 14, color: css.textGray, fontFamily: "'DM Mono', monospace" }}>/ {FRQ_MAX_SCORE}</span>
          </div>
        </div>
        <div style={{ fontSize: 10, color: css.textGray, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 }}>
          FRQ Score
        </div>
        <div style={{ height: 6, background: css.bgLight, borderRadius: 3, overflow: "hidden", marginTop: 12 }}>
          <div
            style={{
              height: "100%",
              width: `${hasScore ? (total / FRQ_MAX_SCORE) * 100 : 0}%`,
              background: scoreColor,
              borderRadius: 3,
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>

      <div
        style={{
          background: css.cardWhite,
          border: `1px solid ${css.borderLight}`,
          borderRadius: 12,
          padding: "20px 24px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: css.greenDark,
              letterSpacing: "0.05em",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 14 }}>📝</span>
            NOTES
          </div>
          <span style={{ fontSize: 11, color: css.textGray, fontWeight: 500, fontFamily: "'DM Mono', monospace" }}>
            {notes.length} / 300
          </span>
        </div>
        <textarea
          value={notes}
          onChange={(e) => onNotes(e.target.value.slice(0, 300))}
          placeholder="Add notes about this candidate's application responses..."
          style={{
            width: "100%",
            height: 80,
            padding: "12px 14px",
            background: "#F9FAFB",
            border: `1px solid ${css.borderLight}`,
            borderRadius: 8,
            color: css.textDark,
            fontSize: 13,
            fontFamily: "'DM Sans', sans-serif",
            resize: "none",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {submitError ? (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(220,38,38,0.06)",
            border: "1px solid rgba(220,38,38,0.2)",
            borderRadius: 8,
            color: css.red,
            fontSize: 13,
          }}
        >
          {submitError}
        </div>
      ) : null}

      <ActionBtn
        label="✓ Complete"
        style={{ borderColor: css.greenDark, color: css.cardWhite, bg: css.greenDark, hoverBg: "#1F4E33" }}
        disabled={!scoringComplete}
        title={!scoringComplete ? `Rate application responses from 1 to ${FRQ_MAX_SCORE} first` : undefined}
        onClick={onComplete}
      />
    </div>
  );
}
