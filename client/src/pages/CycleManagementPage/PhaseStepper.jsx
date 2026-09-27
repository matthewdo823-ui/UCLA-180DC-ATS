import { Fragment } from "react";
import { css } from "../../theme/colors";
import {
  PHASE_ORDER,
  PHASE_LABELS,
  PHASE_DESCRIPTIONS,
  normalizeRoundPhase,
  phaseIndex,
} from "../../constants/roundPhases";
import PhaseBadge from "../../components/PhaseBadge/PhaseBadge";
import ActionButton from "../../components/ActionButton/ActionButton";

const FORWARD_LABELS = {
  grading: "Open grading →",
  deliberation: "Start deliberation →",
  closed: "Close round →",
};

/**
 * The round lifecycle as four steps. Forward moves are one step at a time so
 * the server can run each phase's entry guards; anything it refuses comes back
 * as blockers and is listed here rather than in the page-level error banner.
 */
export default function PhaseStepper({ round, busy, issue, onChangePhase }) {
  const phase = normalizeRoundPhase(round.status);
  const current = phaseIndex(phase);
  const next = current >= 0 ? PHASE_ORDER[current + 1] : null;
  const previous = current > 0 ? PHASE_ORDER[current - 1] : null;
  const blockers = issue?.blockers?.length ? issue.blockers : null;

  return (
    <div>
      <div
        role="group"
        aria-label={`${round.name} phase`}
        style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
      >
        {PHASE_ORDER.map((step, index) => (
          <Fragment key={step}>
            {index > 0 ? (
              <span aria-hidden="true" style={{ color: css.borderLight, fontSize: 11 }}>—</span>
            ) : null}
            <PhaseBadge
              phase={step}
              size="stepper"
              state={index === current ? "current" : index < current ? "done" : "upcoming"}
            />
          </Fragment>
        ))}
      </div>

      <p style={{ margin: "8px 0 0", fontSize: 12, color: css.textGray, lineHeight: 1.4 }}>
        {PHASE_DESCRIPTIONS[phase] || "This round is in an unrecognized state."}
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        {next ? (
          <ActionButton
            label={FORWARD_LABELS[next]}
            variant="primary"
            disabled={busy}
            onClick={() => onChangePhase(next)}
          />
        ) : null}
        {previous ? (
          <ActionButton
            label={`← Back to ${PHASE_LABELS[previous]}`}
            disabled={busy}
            onClick={() => onChangePhase(previous)}
          />
        ) : null}
      </div>

      {blockers ? (
        <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12, color: css.red, lineHeight: 1.5 }}>
          {blockers.map((blocker) => (
            <li key={blocker.code}>{blocker.message}</li>
          ))}
        </ul>
      ) : issue?.error ? (
        <p style={{ margin: "10px 0 0", fontSize: 12, color: css.red }}>{issue.error}</p>
      ) : null}
    </div>
  );
}
