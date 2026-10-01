import { css } from "../../../theme/colors";
import { hasText } from "../applicationUtils";
import { cardGreen } from "../constants";
import { UNRENDERABLE_QUESTION_LABEL } from "../../../utils/applicationResponses";

export default function EssayBlock({ label, text }) {
  const hasLabel = hasText(label);
  return (
    <div style={{ marginBottom: 18 }}>
      <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, fontStyle: hasLabel ? "normal" : "italic", color: hasLabel ? cardGreen : css.textGray }}>
        {hasLabel ? label : UNRENDERABLE_QUESTION_LABEL}
      </p>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: hasText(text) ? css.textDark : css.textGray, whiteSpace: "pre-wrap" }}>
        {hasText(text) ? text.trim() : "Not provided"}
      </p>
    </div>
  );
}
