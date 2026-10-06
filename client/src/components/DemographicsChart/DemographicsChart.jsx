import { useCallback, useState } from "react";
import { css } from "../../theme/colors";

export const CATEGORY_COLORS = [
  "#1D9E75",
  "#085041",
  "#5BA3E0",
  "#3DC9A0",
  "#F5C060",
  "#EF9F27",
  "#E24B4A",
  "#8B5CF6",
  "#64748B",
  "#14B8A6",
  "#F97316",
  "#6366F1",
];

export function colorForCategory(categories, category) {
  const index = categories.indexOf(category);
  return CATEGORY_COLORS[(index >= 0 ? index : 0) % CATEGORY_COLORS.length];
}

export function formatPercent(count, total) {
  if (!total) return "0%";
  return `${Math.round((count / total) * 1000) / 10}%`;
}

function Segment({ category, count, total, color, isFirst, isLast, active }) {
  const widthPct = total > 0 ? (count / total) * 100 : 0;
  if (widthPct <= 0) return null;

  return (
    <div
      aria-label={`${category}: ${count} (${formatPercent(count, total)})`}
      style={{
        width: `${widthPct}%`,
        minWidth: count > 0 ? 2 : 0,
        height: "100%",
        background: color,
        opacity: active === false ? 0.72 : 1,
        outline: active ? "2px solid rgba(17, 24, 39, 0.35)" : "none",
        outlineOffset: -1,
        borderRadius: `${isFirst ? 6 : 0}px ${isLast ? 6 : 0}px ${isLast ? 6 : 0}px ${isFirst ? 6 : 0}px`,
        transition: "opacity 0.12s ease",
      }}
    />
  );
}

function BarTooltip({ segment, total, color, style }) {
  if (!segment) return null;

  return (
    <div
      role="tooltip"
      style={{
        position: "absolute",
        left: style.left,
        top: style.top,
        transform: "translate(-50%, calc(-100% - 8px))",
        pointerEvents: "none",
        zIndex: 5,
        background: css.textDark,
        color: css.cardWhite,
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 12,
        lineHeight: 1.35,
        boxShadow: "0 8px 24px rgba(17, 24, 39, 0.18)",
        whiteSpace: "nowrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            background: color,
            flexShrink: 0,
          }}
        />
        <span style={{ fontWeight: 700 }}>{segment.category}</span>
      </div>
      <div style={{ marginTop: 4, color: "rgba(255,255,255,0.82)" }}>
        {segment.count} · {formatPercent(segment.count, total)}
      </div>
    </div>
  );
}

function StackedBar({ stageLabel, total, segments, categories }) {
  const [hovered, setHovered] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ left: 0, top: 0 });

  const resolveSegmentAtOffset = useCallback((barElement, offsetX) => {
    if (!barElement || total <= 0) return null;

    const barWidth = barElement.clientWidth;
    if (barWidth <= 0) return null;

    const ratio = Math.min(Math.max(offsetX / barWidth, 0), 1);
    let cumulative = 0;

    for (const entry of segments) {
      cumulative += entry.count / total;
      if (ratio <= cumulative) return entry;
    }

    return segments[segments.length - 1] || null;
  }, [segments, total]);

  const handleMouseMove = useCallback((event) => {
    const barElement = event.currentTarget;
    const rect = barElement.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const segment = resolveSegmentAtOffset(barElement, offsetX);

    setHovered(segment);
    setTooltipPos({
      left: offsetX,
      top: 0,
    });
  }, [resolveSegmentAtOffset]);

  const handleMouseLeave = useCallback(() => {
    setHovered(null);
  }, []);

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: css.textDark, marginBottom: 8, lineHeight: 1.35 }}>
        {stageLabel}
      </div>
      <div style={{ position: "relative" }}>
        <div
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{
            height: 28,
            display: "flex",
            overflow: "hidden",
            background: "var(--color-track)",
            borderRadius: 6,
            cursor: total > 0 ? "crosshair" : "default",
          }}
        >
          {total === 0 ? (
            <div style={{ width: "100%", height: "100%", background: "var(--color-track)" }} />
          ) : (
            segments.map((entry, index) => (
              <Segment
                key={entry.category}
                category={entry.category}
                count={entry.count}
                total={total}
                color={colorForCategory(categories, entry.category)}
                isFirst={index === 0}
                isLast={index === segments.length - 1}
                active={hovered ? hovered.category === entry.category : null}
              />
            ))
          )}
        </div>
        {hovered && total > 0 && (
          <BarTooltip
            segment={hovered}
            total={total}
            color={colorForCategory(categories, hovered.category)}
            style={tooltipPos}
          />
        )}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: css.textGray }}>
        <span style={{ fontWeight: 700, color: css.textDark }}>{total}</span>
        {" "}candidate{total === 1 ? "" : "s"}
      </div>
    </div>
  );
}

export function DemographicsLegend({ categories }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px", marginTop: 12 }}>
      {categories.map((category) => (
        <div key={category} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: css.textGray }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: colorForCategory(categories, category),
              flexShrink: 0,
            }}
          />
          <span>{category}</span>
        </div>
      ))}
    </div>
  );
}

export function DemographicsStackedBarChart({ stages, categories, stageCounts }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(stages.length, 1)}, minmax(120px, 1fr))`, gap: 16, marginTop: 18 }}>
      {stages.map((stage) => {
        const counts = stageCounts[stage.id] || {};
        const total = stage.total || 0;
        const segments = categories
          .map((category) => ({ category, count: counts[category] || 0 }))
          .filter((entry) => entry.count > 0);

        return (
          <StackedBar
            key={stage.id}
            stageLabel={stage.label}
            total={total}
            segments={segments}
            categories={categories}
          />
        );
      })}
    </div>
  );
}

export function DemographicsSummaryTable({ stages, categories, stageCounts }) {
  const appliedStage = stages[0];
  const appliedCounts = stageCounts[appliedStage?.id] || {};

  return (
    <div style={{ overflowX: "auto", marginTop: 18 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            <th style={tableHeadStyle}>Category</th>
            {stages.map((stage) => (
              <th key={stage.id} style={tableHeadStyle}>{stage.label}</th>
            ))}
            <th style={tableHeadStyle}>Δ vs applicants</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => {
            const appliedCount = appliedCounts[category] || 0;
            const appliedPct = appliedStage?.total ? appliedCount / appliedStage.total : 0;
            const lastStage = stages[stages.length - 1];
            const lastCount = (stageCounts[lastStage?.id] || {})[category] || 0;
            const lastPct = lastStage?.total ? lastCount / lastStage.total : 0;
            const deltaPts = Math.round((lastPct - appliedPct) * 1000) / 10;
            const deltaLabel = `${deltaPts > 0 ? "+" : ""}${deltaPts} pts`;

            return (
              <tr key={category}>
                <td style={tableCellStyle}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        background: colorForCategory(categories, category),
                      }}
                    />
                    {category}
                  </span>
                </td>
                {stages.map((stage) => {
                  const count = (stageCounts[stage.id] || {})[category] || 0;
                  return (
                    <td key={stage.id} style={tableCellStyle}>
                      {count}
                      <span style={{ color: css.textGray }}> ({formatPercent(count, stage.total)})</span>
                    </td>
                  );
                })}
                <td style={{
                  ...tableCellStyle,
                  color: deltaPts > 0 ? css.greenDark : deltaPts < 0 ? css.red : css.textGray,
                  fontWeight: 700,
                }}
                >
                  {deltaLabel}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const tableHeadStyle = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: `1px solid ${css.borderLight}`,
  color: css.textGray,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const tableCellStyle = {
  padding: "10px 12px",
  borderBottom: `1px solid ${css.borderLight}`,
  color: css.textDark,
  whiteSpace: "nowrap",
};
