import { css } from "../../theme/colors";
import { YEAR_CFG, DEC_STYLE, MAX_SCORE } from "../../constants/config";

export default function Drawer({ open, onClose, reviews }) {
  const passCount   = reviews.filter(r => r.decision === "pass").length;
  const flagCount   = reviews.filter(r => r.decision === "flag").length;
  const rejectCount = reviews.filter(r => r.decision === "reject").length;
  const scoreColor = t => t >= MAX_SCORE * 0.75 ? css.green : t >= MAX_SCORE * 0.5 ? css.amber : css.red;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.52)", zIndex: 100, opacity: open ? 1 : 0, pointerEvents: open ? "all" : "none", transition: "opacity 0.22s" }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, background: css.navy2, borderLeft: `1px solid ${css.border2}`, display: "flex", flexDirection: "column", zIndex: 101, transform: open ? "translateX(0)" : "translateX(100%)", transition: "transform 0.3s cubic-bezier(0.22,1,0.36,1)", boxShadow: "-12px 0 40px rgba(0,0,0,0.35)" }}>
        <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${css.border}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: css.text1 }}>Past Reviews</div>
            <div style={{ fontSize: 10, color: css.text3, marginTop: 2 }}>All evaluated candidates</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${css.border2}`, background: css.surface2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 12, color: css.text3 }}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "12px 20px", borderBottom: `1px solid ${css.border}`, flexShrink: 0 }}>
          {[["pass", passCount, "#4ECBA0", "Passed"], ["flag", flagCount, css.amber, "Flagged"], ["reject", rejectCount, "#F07877", "Skipped"]].map(([, val, color, lbl]) => (
            <div key={lbl} style={{ textAlign: "center", padding: "10px 8px", background: css.surface, borderRadius: 10, border: `1px solid ${css.border}` }}>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'DM Mono', monospace", color }}>{val}</div>
              <div style={{ fontSize: 9, color: css.text3, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{lbl}</div>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 20px", scrollbarWidth: "thin", scrollbarColor: `${css.border2} transparent` }}>
          {reviews.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: css.text3, fontSize: 12, lineHeight: 1.7 }}>
              <span style={{ fontSize: 28, display: "block", marginBottom: 10, opacity: 0.6 }}>📄</span>
              No reviews yet.<br />Complete your first review<br />to see history here.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 9, fontWeight: 600, color: css.text3, textTransform: "uppercase", letterSpacing: "0.08em", padding: "6px 0 8px", marginTop: 4 }}>All Reviews ({reviews.length})</div>
              {reviews.map((r, i) => {
                const yr = r.year ? YEAR_CFG[r.year] : null;
                const dec = DEC_STYLE[r.decision];
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1px solid ${css.border}`, background: css.surface, marginBottom: 6, cursor: "default" }}>
                    {yr && <div style={{ width: 3, height: 32, borderRadius: 2, background: yr.panelColor, flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: css.text1 }}>{r.id}</div>
                      {yr && <div style={{ fontSize: 10, fontWeight: 600, color: yr.panelColor, marginTop: 2 }}>{yr.label}</div>}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: scoreColor(r.total), width: 38, textAlign: "right" }}>{r.total}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 20, letterSpacing: "0.04em", textTransform: "uppercase", border: `1px solid ${dec.bd}`, background: dec.bg, color: dec.color, whiteSpace: "nowrap" }}>{dec.label}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </>
  );
}
