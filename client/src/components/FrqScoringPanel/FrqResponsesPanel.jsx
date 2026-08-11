import { css } from "../../theme/colors";
import { FRQ_ESSAY_FIELDS } from "../../constants/frq";
import { hasText } from "../../pages/CandidateApplicationPage/applicationUtils";

export default function FrqResponsesPanel({ candidate }) {
  const essays = candidate?.candidates || candidate || {};

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        background: css.cardWhite,
        border: `1px solid ${css.borderLight}`,
        borderRadius: 12,
        padding: "20px 24px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
        scrollbarWidth: "thin",
        scrollbarColor: `${css.borderLight} transparent`,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: css.greenDark,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ fontSize: 14 }}>📝</span>
        Application responses
      </div>

      {FRQ_ESSAY_FIELDS.map(({ key, label }) => {
        const value = essays[key] ?? "";
        return (
          <div key={key} style={{ marginBottom: 20 }}>
            <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: css.greenDark }}>{label}</p>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                lineHeight: 1.6,
                color: hasText(value) ? css.textDark : css.textGray,
                whiteSpace: "pre-wrap",
              }}
            >
              {hasText(value) ? value.trim() : "Not provided"}
            </p>
          </div>
        );
      })}
    </div>
  );
}
