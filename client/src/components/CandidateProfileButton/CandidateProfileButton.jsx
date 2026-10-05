export default function CandidateProfileButton({ resumeId, candidateName, onOpen, children, style = {} }) {
  const canOpen = Boolean(resumeId && onOpen);

  return (
    <button
      type="button"
      aria-label={canOpen ? `Open ${candidateName || "candidate"} profile` : undefined}
      disabled={!canOpen}
      onClick={(event) => {
        event.stopPropagation();
        if (canOpen) onOpen(resumeId);
      }}
      style={{
        border: "none",
        background: "transparent",
        padding: 0,
        cursor: canOpen ? "pointer" : "default",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
