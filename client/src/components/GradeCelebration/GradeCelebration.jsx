const CONFETTI_COLORS = ["#E95D5D", "#F2B134", "#4AA86D", "#4B88E8", "#A66BE5", "#F58B60"];
const CONFETTI = Array.from({ length: 42 }, (_, index) => ({
  color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
  left: (index * 37) % 100,
  drift: ((index * 29) % 160) - 80,
  delay: (index % 10) * -0.12,
  size: 7 + ((index * 3) % 7),
  rotation: (index * 47) % 360,
}));

export default function GradeCelebration({ active, specialCelebrationName = "" }) {
  if (!active) return null;

  const specialMode = Boolean(specialCelebrationName);

  return (
    <div data-grade-celebration aria-live="polite" aria-atomic="true" style={{ position: "fixed", inset: 0, zIndex: 500, overflow: "hidden", pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, background: specialMode ? "rgba(255, 237, 106, 0.16)" : "transparent", animation: specialMode ? "ryanCelebrationBlink 0.38s steps(2, end) infinite" : "none" }} />
      {CONFETTI.map((piece) => (
        <span
          key={`${piece.left}-${piece.rotation}`}
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -18,
            left: `${piece.left}%`,
            width: piece.size,
            height: piece.size * 1.55,
            borderRadius: 2,
            background: piece.color,
            transform: `rotate(${piece.rotation}deg)`,
            animation: `gradeConfetti 1.8s cubic-bezier(0.2, 0.7, 0.25, 1) ${piece.delay}s forwards`,
            "--confetti-drift": `${piece.drift}px`,
          }}
        />
      ))}
      {specialMode ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            color: "#FF2D55",
            fontSize: "clamp(38px, 7vw, 96px)",
            fontWeight: 900,
            lineHeight: 0.92,
            letterSpacing: "0.02em",
            textAlign: "center",
            textTransform: "uppercase",
            textShadow: "4px 4px 0 #FFF, 8px 8px 0 #4B88E8",
            animation: "ryanCelebrationText 0.38s steps(2, end) infinite",
          }}
        >
          CONGRAGULATIONS, {specialCelebrationName.toUpperCase()}!
        </div>
      ) : null}
      <style>{`
        @keyframes gradeConfetti {
          0% { opacity: 0; transform: translate3d(0, -24px, 0) rotate(0deg); }
          8% { opacity: 1; }
          100% { opacity: 0; transform: translate3d(var(--confetti-drift), 110vh, 0) rotate(720deg); }
        }
        @keyframes ryanCelebrationBlink {
          50% { opacity: 0.15; }
          100% { opacity: 0.82; }
        }
        @keyframes ryanCelebrationText {
          50% { transform: rotate(-2deg) scale(0.97); filter: hue-rotate(90deg); }
          100% { transform: rotate(2deg) scale(1.04); filter: hue-rotate(-30deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-grade-celebration] * { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
