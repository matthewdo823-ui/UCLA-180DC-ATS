import { css } from "../../../theme/colors";
import { cardGreen, cardPale } from "../constants";

export default function RoundEvaluationPanel({ title, status = "upcoming", children }) {
  const isActive = status === "active";

  return (
    <div
      style={{
        border: `1px solid ${isActive ? "rgba(40, 98, 65, 0.22)" : css.borderLight}`,
        borderRadius: 10,
        overflow: "hidden",
        background: isActive ? "#FAFCF8" : "#FBFBFB",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 16px",
          borderBottom: `1px solid ${css.borderLight}`,
          background: isActive ? cardPale : "#F5F5F5",
        }}
      >
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: isActive ? cardGreen : css.textDark }}>
          {title}
        </p>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            padding: "4px 9px",
            borderRadius: 20,
            background: isActive ? "rgba(40, 98, 65, 0.12)" : "rgba(0,0,0,0.04)",
            color: isActive ? cardGreen : css.textGray,
          }}
        >
          {isActive ? "Completed" : "Upcoming"}
        </span>
      </div>
      <div style={{ padding: "16px" }}>{children}</div>
    </div>
  );
}
