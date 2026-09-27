import { css } from "../../theme/colors";
import {
  PHASE_LABELS,
  ROUND_PHASE_STYLE,
  normalizeRoundPhase,
} from "../../constants/roundPhases";

/**
 * One pill for a round's phase, shared by Cycle Management and the dashboard so
 * a round reads identically wherever it appears.
 *
 * `state` is for the Cycle Management stepper, where past and upcoming steps are
 * shown alongside the current one; everywhere else the default is right.
 */
export default function PhaseBadge({ phase, state = "current", size = "sm" }) {
  const normalized = normalizeRoundPhase(phase);
  const tone = ROUND_PHASE_STYLE[normalized];
  const isCurrent = state === "current";

  if (!tone) return null;

  return (
    <span
      aria-current={state === "current" && size === "stepper" ? "step" : undefined}
      style={{
        background: isCurrent ? tone.bg : "transparent",
        color: isCurrent ? tone.color : state === "done" ? css.textDark : css.textGray,
        border: `1px solid ${isCurrent ? tone.bd : css.borderLight}`,
        borderRadius: 999,
        fontSize: size === "md" ? 11 : 10,
        fontWeight: 700,
        padding: size === "md" ? "5px 12px" : "4px 10px",
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        opacity: state === "upcoming" ? 0.6 : 1,
      }}
    >
      {PHASE_LABELS[normalized]}
    </span>
  );
}
