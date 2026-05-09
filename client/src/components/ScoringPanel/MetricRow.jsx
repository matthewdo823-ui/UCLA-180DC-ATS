import { css } from "../../theme/colors";
import { BUBBLE_COLORS } from "../../constants/config";

export default function MetricRow({ metric, value, onScore }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: css.text2, textTransform: "capitalize" }}>{metric}</span>
        <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: css.gold }}>{value ?? "—"} / 6</span>
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        {[1, 2, 3, 4, 5, 6].map(n => {
          const sel = value === n;
          const c = BUBBLE_COLORS[n];
          return (
            <button key={n} onClick={() => onScore(metric, n)} style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${sel ? c.bd : css.border}`, color: sel ? c.color : css.text3, background: sel ? c.bg : css.surface2, transition: "all 0.11s", fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
