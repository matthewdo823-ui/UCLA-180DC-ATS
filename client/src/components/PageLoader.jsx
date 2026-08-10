import { css } from "../theme/colors";

/**
 * Unified page loading state: an animated ring above a label.
 * Matches the spinner treatment originally used on the Screener page.
 *
 * Props:
 *   label      - text under the ring (default "Loading…")
 *   fullscreen - fill the viewport height instead of the parent container
 *   minHeight  - override the inline min-height (ignored when fullscreen)
 *   color      - label color (default css.textGray)
 *   track      - ring track color (default css.borderLight)
 *   head       - spinning-segment color (default css.greenDark)
 */
export default function PageLoader({
  label = "Loading…",
  fullscreen = false,
  minHeight = 240,
  color = css.textGray,
  track = css.borderLight,
  head = css.greenDark,
}) {
  return (
    <div
      style={{
        flex: fullscreen ? undefined : 1,
        height: fullscreen ? "100vh" : undefined,
        minHeight: fullscreen ? undefined : minHeight,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        color,
        fontSize: 13,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          border: `3px solid ${track}`,
          borderTopColor: head,
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      {label}
    </div>
  );
}
