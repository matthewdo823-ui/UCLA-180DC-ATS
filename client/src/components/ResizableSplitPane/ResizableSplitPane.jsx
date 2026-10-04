import { useCallback, useRef, useState } from "react";
import { css } from "../../theme/colors";

const DEFAULT_LEFT_PERCENT = 42;
const MIN_LEFT_PERCENT = 30;
const MAX_LEFT_PERCENT = 70;
const KEYBOARD_STEP = 5;

function clampLeftPercent(value) {
  return Math.min(MAX_LEFT_PERCENT, Math.max(MIN_LEFT_PERCENT, value));
}

export default function ResizableSplitPane({ left, right, leftLabel, rightLabel }) {
  const containerRef = useRef(null);
  const [leftPercent, setLeftPercent] = useState(DEFAULT_LEFT_PERCENT);
  const [dragging, setDragging] = useState(false);

  const updateFromPointer = useCallback((clientX) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds?.width) return;
    setLeftPercent(clampLeftPercent(((clientX - bounds.left) / bounds.width) * 100));
  }, []);

  function handlePointerDown(event) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    updateFromPointer(event.clientX);
  }

  function handlePointerMove(event) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    updateFromPointer(event.clientX);
  }

  function stopDragging(event) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  }

  function handleKeyDown(event) {
    let nextPercent = null;

    if (event.key === "ArrowLeft") nextPercent = leftPercent - KEYBOARD_STEP;
    if (event.key === "ArrowRight") nextPercent = leftPercent + KEYBOARD_STEP;
    if (event.key === "Home") nextPercent = MIN_LEFT_PERCENT;
    if (event.key === "End") nextPercent = MAX_LEFT_PERCENT;

    if (nextPercent == null) return;
    event.preventDefault();
    setLeftPercent(clampLeftPercent(nextPercent));
  }

  const leftIsEmphasized = leftPercent >= 50;
  const toggleLabel = leftIsEmphasized
    ? `Give ${rightLabel} more space`
    : `Give ${leftLabel} more space`;

  return (
    <div
      ref={containerRef}
      className={`grading-split-pane${dragging ? " grading-split-pane--dragging" : ""}`}
      style={{ "--grading-left-width": `${leftPercent}%` }}
    >
      <div className="grading-split-pane__panel">{left}</div>

      <div
        className="grading-split-pane__divider"
        role="separator"
        aria-label={`Resize ${leftLabel} and ${rightLabel} panels`}
        aria-orientation="vertical"
        aria-valuemin={MIN_LEFT_PERCENT}
        aria-valuemax={MAX_LEFT_PERCENT}
        aria-valuenow={Math.round(leftPercent)}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onKeyDown={handleKeyDown}
        onDoubleClick={() => setLeftPercent(DEFAULT_LEFT_PERCENT)}
      >
        <button
          type="button"
          className="grading-split-pane__toggle"
          aria-label={toggleLabel}
          title={`${toggleLabel}. Drag to choose a custom split; double-click the divider to reset.`}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={() => setLeftPercent(leftIsEmphasized ? 40 : 60)}
          style={{
            background: css.cardWhite,
            borderColor: css.borderLight,
            color: css.greenDark,
          }}
        >
          <span aria-hidden="true">{leftIsEmphasized ? "‹" : "›"}</span>
        </button>
      </div>

      <div className="grading-split-pane__panel">{right}</div>
    </div>
  );
}
