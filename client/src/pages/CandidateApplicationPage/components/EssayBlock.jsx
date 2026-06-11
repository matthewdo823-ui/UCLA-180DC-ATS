import { css } from "../../../theme/colors";
import { hasText } from "../applicationUtils";
import { cardGreen } from "../constants";

export default function EssayBlock({ label, text }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: cardGreen }}>{label}</p>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: hasText(text) ? css.textDark : css.textGray, whiteSpace: "pre-wrap" }}>
        {hasText(text) ? text.trim() : "Not provided"}
      </p>
    </div>
  );
}
