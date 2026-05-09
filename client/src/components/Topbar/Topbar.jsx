import { css } from "../../theme/colors";

export default function Topbar({ reviewed, total, onHistory, historyCount }) {
  const pct = total ? (reviewed / total) * 100 : 0;
  return (
    <div style={{ height: 52, background: css.navy2, borderBottom: `1px solid ${css.border}`, display: "flex", alignItems: "center", padding: "0 22px", gap: 10, flexShrink: 0 }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: css.text1, fontFamily: "'DM Sans', sans-serif" }}>180° Resume Screener</span>
      <div style={{ width: 1, height: 18, background: css.border2 }} />
      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, letterSpacing: "0.02em", border: `1px solid rgba(255,184,28,0.22)`, background: "rgba(255,184,28,0.12)", color: css.gold }}>Round 1 · Resume Screen</span>
      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, letterSpacing: "0.02em", border: `1px solid rgba(29,158,117,0.22)`, background: "rgba(29,158,117,0.12)", color: "#4ECBA0" }}>Active</span>
      <div style={{ flex: 1 }} />
      <button onClick={onHistory} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "6px 13px", borderRadius: 20, border: `1px solid ${css.border2}`, background: css.surface2, fontSize: 11, fontWeight: 600, color: css.text2, transition: "all 0.14s" }}>
        📋 Past Reviews
        <span style={{ background: css.gold, color: css.navy, borderRadius: 20, fontSize: 9, fontWeight: 800, padding: "1px 6px" }}>{historyCount}</span>
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: css.surface, border: `1px solid ${css.border}`, borderRadius: 22, padding: "5px 14px 5px 10px" }}>
        <span style={{ fontSize: 14 }}>📄</span>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: css.text1, lineHeight: 1 }}>{reviewed} / {total || "—"}</span>
          <span style={{ fontSize: 9, color: css.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>Reviewed</span>
          <div style={{ width: 70, height: 4, background: css.border2, borderRadius: 2, overflow: "hidden", marginTop: 2 }}>
            <div style={{ height: "100%", width: `${pct}%`, background: css.gold, borderRadius: 2, transition: "width 0.4s ease" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
