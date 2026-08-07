import { css } from "../../../theme/colors";
import { displayValue, hasText } from "../applicationUtils";

export default function DetailField({ label, value, href }) {
  const content = href && hasText(value) ? (
    <a href={href} target="_blank" rel="noreferrer" style={{ color: css.greenDark, fontWeight: 600, textDecoration: "none", wordBreak: "break-word" }}>
      {value}
    </a>
  ) : (
    <span style={{ color: css.textDark, fontWeight: 500, wordBreak: "break-word" }}>{displayValue(value)}</span>
  );

  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: css.textGray }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>{content}</p>
    </div>
  );
}
