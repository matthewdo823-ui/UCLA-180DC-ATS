import { DECISION_STYLE, normalizeDecisionStatus } from "../../ScoreboardPage/decisionUtils";

export default function DecisionBadge({ status }) {
  const style = DECISION_STYLE[normalizeDecisionStatus(status)];

  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "4px 9px",
        borderRadius: 20,
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.bd}`,
      }}
    >
      {style.label}
    </span>
  );
}
