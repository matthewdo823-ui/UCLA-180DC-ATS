import { css } from "../../theme/colors";

export default function Topbar({ reviewed, onHistory, historyCount }) {
  return (
    <div style={{ height: 60, background: "transparent", borderBottom: `1px solid ${css.borderLight}`, display: "flex", alignItems: "center", padding: "0 24px", gap: 12, flexShrink: 0 }}>
      <span style={{ fontSize: 16, fontWeight: 700, color: css.greenDark, fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.02em" }}>180° Resume Screener</span>
      <div style={{ width: 1, height: 20, background: css.borderLight, margin: "0 4px" }} />
      <span style={{ fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 20, border: `1px solid rgba(29,158,117,0.15)`, background: "rgba(29,158,117,0.08)", color: "#1D9E75" }}>Round 1 · Resume Screen</span>
      <span style={{ fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 20, border: `1px solid rgba(29,158,117,0.15)`, background: "rgba(29,158,117,0.08)", color: "#1D9E75", display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#1D9E75" }} />
        Active
      </span>
      <div style={{ flex: 1 }} />
      
      <button onClick={onHistory} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "6px 14px", borderRadius: 20, border: `1px solid ${css.borderLight}`, background: css.cardWhite, fontSize: 12, fontWeight: 600, color: css.textDark, transition: "all 0.14s", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
        📋 Past Reviews
        <span style={{ background: css.greenDark, color: css.cardWhite, borderRadius: 20, fontSize: 10, fontWeight: 700, padding: "2px 7px" }}>{historyCount}</span>
      </button>

      <div style={{ width: 40, height: 40, borderRadius: "50%", border: `1px solid ${css.greenDark}`, background: "rgba(40, 98, 65, 0.08)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: css.greenDark, lineHeight: 1 }}>{reviewed}</span>
        <span style={{ fontSize: 7, fontWeight: 700, color: css.greenDark, textTransform: "uppercase", letterSpacing: "0.02em", marginTop: 1 }}>done</span>
      </div>
    </div>
  );
}
