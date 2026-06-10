import { css } from "../../theme/colors";
import { BUBBLE_COLORS, METRIC_ICONS } from "../../constants/config";

export default function MetricRow({ metric, value, onScore, maxScore = 4 }) {
  const levels = Array.from({ length: maxScore }, (_, i) => i + 1);

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: css.textDark, textTransform: "capitalize", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16, background: css.bgLight, borderRadius: "50%", padding: 4, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>{METRIC_ICONS[metric] || "📋"}</span>
        {metric}
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        {levels.map(n => {
          const sel = value === n;
          const c = BUBBLE_COLORS[n];
          return (
            <button key={n} onClick={() => onScore(metric, n)} style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${sel ? c.bd : css.borderLight}`, color: sel ? c.color : css.textGray, background: sel ? c.bg : css.cardWhite, transition: "all 0.11s", fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
