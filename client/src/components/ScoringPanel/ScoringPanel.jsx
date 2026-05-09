import { css } from "../../theme/colors";
import { METRICS, MAX_SCORE } from "../../constants/config";
import MetricRow from "./MetricRow";
import ActionBtn from "./ActionBtn";

export default function ScoringPanel({ resume, scores, onScore, notes, onNotes, onAction }) {
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const scoreColor = total >= MAX_SCORE * 0.75 ? css.green : total >= MAX_SCORE * 0.5 ? css.amber : css.red;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", paddingBottom: 16, scrollbarWidth: "thin", scrollbarColor: `${css.border2} transparent` }}>
      {/* Metrics card */}
      <div style={{ background: css.surface, border: `1px solid ${css.border}`, borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: css.text3, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 14 }}>Scoring Rubric</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {METRICS.map(m => (
            <MetricRow key={m} metric={m} value={scores[m]} onScore={onScore} />
          ))}
        </div>
        {/* Score summary */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: css.surface2, borderRadius: 10, border: `1px solid ${css.border}`, marginTop: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 26, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: scoreColor, lineHeight: 1 }}>{total}</span>
              <span style={{ fontSize: 13, color: css.text3, fontFamily: "'DM Mono', monospace" }}>/ {MAX_SCORE}</span>
            </div>
            <div style={{ fontSize: 10, color: css.text3, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 2 }}>Aggregate</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ height: 5, background: css.border2, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(total / MAX_SCORE) * 100}%`, background: scoreColor, borderRadius: 3, transition: "width 0.3s ease" }} />
            </div>
          </div>
        </div>
      </div>

      {/* Notes card */}
      <div style={{ background: css.surface, border: `1px solid ${css.border}`, borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: css.text3, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>Notes</div>
        <textarea
          value={notes}
          onChange={e => onNotes(e.target.value.slice(0, 300))}
          placeholder="Add notes about this candidate…"
          style={{ width: "100%", height: 80, padding: "10px 12px", background: css.surface2, border: `1px solid ${css.border}`, borderRadius: 8, color: css.text2, fontSize: 12, fontFamily: "'DM Sans', sans-serif", resize: "none", outline: "none", boxSizing: "border-box" }}
        />
        <div style={{ fontSize: 10, color: css.text3, textAlign: "right", marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{notes.length} / 300</div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8 }}>
        {[
          { type: "reject", label: "✕ Skip",    style: { borderColor: css.red,   color: "#F07877", bg: "rgba(226,75,74,0.07)",  hoverBg: "rgba(226,75,74,0.18)"  } },
          { type: "flag",   label: "⚑ Flag",    style: { borderColor: css.amber, color: css.amber, bg: "rgba(239,159,39,0.07)", hoverBg: "rgba(239,159,39,0.18)" } },
          { type: "pass",   label: "✓ Advance", style: { borderColor: css.green, color: "#4ECBA0", bg: "rgba(29,158,117,0.07)", hoverBg: "rgba(29,158,117,0.18)" } },
        ].map(({ type, label, style }) => (
          <ActionBtn key={type} label={label} style={style} onClick={() => onAction(type)} />
        ))}
      </div>
    </div>
  );
}
