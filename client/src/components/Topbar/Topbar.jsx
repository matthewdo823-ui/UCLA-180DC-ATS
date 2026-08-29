import { css } from "../../theme/colors";

export const topbarGhostButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
  padding: "6px 14px",
  borderRadius: 20,
  border: `1px solid ${css.borderLight}`,
  background: css.cardWhite,
  fontSize: 12,
  fontWeight: 600,
  color: css.textDark,
  transition: "all 0.14s",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
  fontFamily: "'DM Sans', sans-serif",
};

export const topbarStatCircleStyle = {
  width: 40,
  height: 40,
  borderRadius: "50%",
  border: `1px solid ${css.greenDark}`,
  background: "rgba(40, 98, 65, 0.08)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  marginLeft: 8,
};

export default function Topbar({
  rightSlot,
  reviewed,
  onHistory,
  historyCount,
  phaseLabel,
  activeLabel,
  showActivePill = true,
}) {
  // The default "Past Reviews" + "done" controls belong to the grading/screener
  // flow. Only render them when their data/handler is actually supplied, so
  // pages like the admin dashboard (which pass none) don't show empty, no-op
  // versions. Pages that want a blank right side pass rightSlot={<></>}.
  const hasReviewControls = onHistory != null || reviewed != null || historyCount != null;

  return (
    <div style={{ minHeight: 60, background: "transparent", borderBottom: `1px solid ${css.borderLight}`, display: "flex", alignItems: "center", padding: "10px 24px", gap: 12, flexShrink: 0 }}>
      <span style={{ fontSize: 16, fontWeight: 700, color: css.greenDark, fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.02em" }}>180° Resume Screener</span>
      {phaseLabel ? (
        <>
          <span aria-hidden="true" style={{ width: 1, height: 18, background: css.borderLight, flexShrink: 0 }} />
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: 600, color: css.textGray }}>
            {phaseLabel}
          </span>
        </>
      ) : null}
      {showActivePill && activeLabel ? (
        <span style={{ flexShrink: 0, borderRadius: 999, background: "rgba(29,158,117,0.10)", color: css.greenDark, padding: "4px 9px", fontSize: 11, fontWeight: 700 }}>
          {activeLabel}
        </span>
      ) : null}
      <div style={{ flex: 1 }} />

      {rightSlot ?? (hasReviewControls ? (
        <>
          <button type="button" onClick={onHistory} style={topbarGhostButtonStyle}>
            📋 Past Resume Grades
            <span style={{ background: css.greenDark, color: css.cardWhite, borderRadius: 20, fontSize: 10, fontWeight: 700, padding: "2px 7px" }}>{historyCount}</span>
          </button>

          <div style={topbarStatCircleStyle}>
            <span style={{ fontSize: 14, fontWeight: 700, color: css.greenDark, lineHeight: 1 }}>{reviewed}</span>
            <span style={{ fontSize: 7, fontWeight: 700, color: css.greenDark, textTransform: "uppercase", letterSpacing: "0.02em", marginTop: 1 }}>done</span>
          </div>
        </>
      ) : null)}
    </div>
  );
}
