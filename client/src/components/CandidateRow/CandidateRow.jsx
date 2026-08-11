import { css } from "../../theme/colors";
import { YEAR_CFG } from "../../constants/config";
import { getInitials } from "../../utils/format";

export default function CandidateRow({ resume }) {
  if (!resume || !resume.candidates) return null;

  const rawYear = resume.candidates.year?.toLowerCase().replace(/\s/g, '');
  const year = YEAR_CFG[rawYear];

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 16,
      flexShrink: 0,
      padding: "16px 24px",
      borderRadius: 16,
      background: css.greenDark,
      boxShadow: "0 4px 20px rgba(40, 98, 65, 0.15)",
      transition: "all 0.2s ease"
    }}>
      {/* Avatar */}
      <div style={{
        width: 48,
        height: 48,
        borderRadius: "50%",
        border: "1px solid rgba(255,255,255,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 16,
        fontWeight: 600,
        color: "#FFF",
        fontFamily: "'DM Sans', sans-serif",
        flexShrink: 0
      }}>
        {getInitials(resume.name)}
      </div>

      {/* Name and Subtitle */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 20, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", color: "#FFF", letterSpacing: "-0.01em" }}>
          {resume.name ?? "—"}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.8)" }}>
          B.A. Business Economics • UCLA • Expected 2029
        </span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Badges */}
      {year && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ 
            display: "inline-flex", 
            alignItems: "center", 
            gap: 6, 
            padding: "6px 14px", 
            borderRadius: 20, 
            border: `1px solid ${year.badgeBd}`, 
            background: year.panelColor, 
            color: "#FFF", 
            fontSize: 11, 
            fontWeight: 700, 
          }}>
            <span>{year.icon}</span>
            {year.label.charAt(0).toUpperCase() + year.label.slice(1)}
          </span>
          <span style={{ 
            display: "inline-flex", 
            alignItems: "center", 
            padding: "6px 14px", 
            borderRadius: 20, 
            border: `1px solid rgba(255,255,255,0.2)`, 
            background: "rgba(255,255,255,0.2)", 
            color: "#FFF", 
            fontSize: 11, 
            fontWeight: 700, 
            textTransform: "uppercase",
            letterSpacing: "0.02em"
          }}>
            {year.sub.toUpperCase()} STUDENT
          </span>
        </div>
      )}
    </div>
  );
}
