import { css } from "../../theme/colors";
import { METRICS, MAX_SCORE } from "../../constants/config";
import MetricRow from "./MetricRow";
import ActionBtn from "./ActionBtn";

export default function ScoringPanel({ resume, scores, onScore, notes, onNotes, onAction }) {
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const scoreColor = total >= MAX_SCORE * 0.75 ? css.greenDark : total >= MAX_SCORE * 0.5 ? css.amber : css.red;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", paddingBottom: 16, scrollbarWidth: "thin", scrollbarColor: `${css.borderLight} transparent` }}>
      {/* Metrics card */}
      <div style={{ background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 12, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: css.greenDark, letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>⚖️</span>
            SCORING RUBRIC
          </div>
          <span style={{ fontSize: 11, color: css.textGray, fontWeight: 500 }}>Rate 1-6 per category</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {METRICS.map(m => (
            <MetricRow key={m} metric={m} value={scores[m]} onScore={onScore} />
          ))}
        </div>
      </div>

      {/* Score summary */}
      <div style={{ display: "flex", flexDirection: "column", background: css.cardWhite, borderRadius: 12, border: `1px solid ${css.borderLight}`, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 32, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: scoreColor, lineHeight: 1 }}>{total}</span>
            <span style={{ fontSize: 14, color: css.textGray, fontFamily: "'DM Mono', monospace" }}>/ {MAX_SCORE}</span>
          </div>
          <div style={{ fontSize: 11, color: css.textGray, fontWeight: 500 }}>
            Categories scored <span style={{ fontWeight: 700, color: css.textDark }}>{Object.keys(scores).length}</span> / {METRICS.length}
          </div>
        </div>
        <div style={{ fontSize: 10, color: css.textGray, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 }}>Aggregate Score</div>
        
        <div style={{ height: 6, background: css.bgLight, borderRadius: 3, overflow: "hidden", marginTop: 12 }}>
          <div style={{ height: "100%", width: `${(total / MAX_SCORE) * 100}%`, background: scoreColor, borderRadius: 3, transition: "width 0.3s ease" }} />
        </div>
      </div>

      {/* Notes card */}
      <div style={{ background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 12, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: css.greenDark, letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>📝</span>
            NOTES
          </div>
          <span style={{ fontSize: 11, color: css.textGray, fontWeight: 500, fontFamily: "'DM Mono', monospace" }}>{notes.length} / 300</span>
        </div>
        <textarea
          value={notes}
          onChange={e => onNotes(e.target.value.slice(0, 300))}
          placeholder="Add notes about this candidate — strengths, flags, notable context..."
          style={{ width: "100%", height: 80, padding: "12px 14px", background: "#F9FAFB", border: `1px solid ${css.borderLight}`, borderRadius: 8, color: css.textDark, fontSize: 13, fontFamily: "'DM Sans', sans-serif", resize: "none", outline: "none", boxSizing: "border-box" }}
        />
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 12 }}>
        {[
          { type: "reject", label: "✕ Skip",    style: { borderColor: css.red,   color: css.red, bg: css.cardWhite,  hoverBg: "rgba(226,75,74,0.05)"  } },
          { type: "flag",   label: "⚑ Flag",    style: { borderColor: css.amber, color: css.amber, bg: css.cardWhite, hoverBg: "rgba(239,159,39,0.05)" } },
          { type: "pass",   label: "✓ Advance", style: { borderColor: css.greenDark, color: css.cardWhite, bg: css.greenDark, hoverBg: "#1F4E33" } },
        ].map(({ type, label, style }) => (
          <ActionBtn key={type} label={label} style={style} onClick={() => onAction(type)} />
        ))}
      </div>

      {/* Placeholder card */}
      <div style={{ background: css.bgLight, border: `1px dashed ${css.borderLight}`, borderRadius: 12, padding: 30, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: css.textGray, marginTop: 4 }}>
        <span style={{ fontSize: 20, marginBottom: 8, opacity: 0.5 }}>📋</span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", opacity: 0.7 }}>Rubric — Coming Soon</span>
      </div>
    </div>
  );
}
