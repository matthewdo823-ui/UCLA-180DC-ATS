import { css } from "../../theme/colors";

export default function ActionButton({ label, onClick, disabled, variant = "secondary" }) {
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: `1px solid ${isPrimary ? css.greenDark : isDanger ? css.red : css.borderLight}`,
        background: isPrimary ? css.greenDark : "var(--color-surface)",
        color: isPrimary ? "var(--color-on-primary)" : isDanger ? css.red : css.textDark,
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {label}
    </button>
  );
}
