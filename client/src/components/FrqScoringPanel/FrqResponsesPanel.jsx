import { css } from "../../theme/colors";
import { hasText } from "../../pages/CandidateApplicationPage/applicationUtils";
import {
  getGradableApplicationResponses,
  UNRENDERABLE_QUESTION_LABEL,
  UNRENDERABLE_RESPONSES_MESSAGE,
} from "../../utils/applicationResponses";

export default function FrqResponsesPanel({ candidate }) {
  const essays = candidate?.candidates || candidate || {};
  const responses = getGradableApplicationResponses(essays);

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

      {responses.length === 0 ? (
        <p style={{ margin: 0, fontSize: 14, fontStyle: "italic", color: css.textGray }}>
          {UNRENDERABLE_RESPONSES_MESSAGE}
        </p>
      ) : (
        responses.map(({ questionId, title, answer }) => {
          return (
            <div key={questionId} style={{ marginBottom: 20 }}>
              <p
                style={{
                  margin: "0 0 8px",
                  fontSize: 12,
                  fontWeight: 700,
                  fontStyle: title ? "normal" : "italic",
                  color: title ? css.greenDark : css.textGray,
                }}
              >
                {title || UNRENDERABLE_QUESTION_LABEL}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: hasText(answer) ? css.textDark : css.textGray,
                  whiteSpace: "pre-wrap",
                }}
              >
                {hasText(answer) ? answer.trim() : "Not provided"}
              </p>
            </div>
          );
        })
      )}
    </div>
  );
}
