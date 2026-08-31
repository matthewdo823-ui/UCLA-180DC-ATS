import { useState } from "react";

export default function ActionBtn({ label, style, onClick, disabled = false, busy = false, title }) {
  const [hover, setHover] = useState(false);
  const activeHover = hover && !disabled;
  return (
    <button
      type="button"
      disabled={disabled}
      aria-busy={busy || undefined}
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "10px 8px",
        borderRadius: 28,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 12,
        fontWeight: 600,
        border: `1.5px solid ${style.borderColor}`,
        color: style.color,
        background: activeHover ? style.hoverBg : style.bg,
        boxShadow: activeHover ? `0 4px 18px ${style.borderColor}33` : "none",
        transform: activeHover ? "translateY(-1px)" : "none",
        transition: "all 0.15s",
        opacity: busy ? 0.78 : disabled ? 0.45 : 1,
      }}
    >
      {label}
    </button>
  );
}
