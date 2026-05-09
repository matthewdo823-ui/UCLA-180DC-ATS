import { css } from "../../theme/colors";
import { YEAR_CFG } from "../../constants/config";

export default function CandidateRow({ resume }) {
  // 1. Safety Check
  if (!resume || !resume.candidates) return null;

  // 2. Data Mapping
  const rawYear = resume.candidates.year?.toLowerCase().replace(/\s/g, '');
  const year = YEAR_CFG[rawYear];

  // 3. Pre-defined Styles
  const rowStyle = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
    padding: "10px 16px",
    borderRadius: 10,
    background: year ? year.panelBg : css.surface,
    border: `1px solid ${year ? year.panelBd : css.border}`,
    transition: "all 0.2s ease"
  };

  return (
    <div style={rowStyle}>
      <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Candidate
      </span>

      <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: "#FFF" }}>
        {resume.name ?? "—"}
      </span>

      <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.2)" }} />

      {year ? (
        <>
          <span style={{ 
            display: "inline-flex", 
            alignItems: "center", 
            gap: 6, 
            padding: "4px 11px", 
            borderRadius: 20, 
            border: `1.5px solid ${year.badgeBd}`, 
            background: year.badgeBg, 
            color: "#FFF", 
            fontSize: 10, 
            fontWeight: 700, 
            textTransform: "uppercase" 
          }}>
            <span>{year.icon}</span>
            {year.label}
          </span>
          <span style={{ color: "rgba(255,255,255,0.9)", fontSize: 10, fontWeight: 600 }}>
            {year.sub} Student
          </span>
        </>
      ) : (
        <span style={{ color: css.text3, fontSize: 10 }}>Year Not Specified</span>
      )}
    </div>
  );
}
