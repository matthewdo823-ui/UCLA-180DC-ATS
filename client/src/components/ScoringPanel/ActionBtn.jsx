import { useState } from "react";

export default function ActionBtn({ label, style, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 8px", borderRadius: 28, cursor: "pointer", fontSize: 12, fontWeight: 600, border: `1.5px solid ${style.borderColor}`, color: style.color, background: hover ? style.hoverBg : style.bg, boxShadow: hover ? `0 4px 18px ${style.borderColor}33` : "none", transform: hover ? "translateY(-1px)" : "none", transition: "all 0.15s" }}>
      {label}
    </button>
  );
}
