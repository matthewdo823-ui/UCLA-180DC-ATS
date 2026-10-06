import { css } from "../../../theme/colors";
import { formatScore, hasNumericScore, titleCase } from "../../../utils/format";
import { cardMint } from "../constants";

export default function CategoryRow({ metric, label, value, maxPerCategory }) {
  const pct = hasNumericScore(value) ? Math.max(0, Math.min(100, (Number(value) / maxPerCategory) * 100)) : 0;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: css.textDark }}>{label || titleCase(metric)}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-card-ink)" }}>
          {formatScore(value)} <span style={{ color: css.textGray, fontWeight: 400 }}>/ {maxPerCategory}</span>
        </span>
      </div>
      <div style={{ height: 5, background: "var(--color-track)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: cardMint, borderRadius: 3 }} />
      </div>
    </div>
  );
}
