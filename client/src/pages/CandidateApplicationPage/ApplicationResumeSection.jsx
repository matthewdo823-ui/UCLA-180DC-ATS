import { useState } from "react";
import ResumeModal from "../../components/ResumeModal/ResumeModal";
import { css } from "../../theme/colors";
import ApplicationResponsesModal from "./ApplicationResponsesSection";
import SectionCard from "./components/SectionCard";

export default function ApplicationResumeSection({ candidate, resume, authToken, compact = false, responsesState }) {
  const [resumeOpen, setResumeOpen] = useState(false);
  const [responsesOpen, setResponsesOpen] = useState(false);

  const hasResume = Boolean(resume?.id && resume?.fileUrl);
  const actionButtonStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: compact ? "8px 10px" : "10px 16px",
    borderRadius: 8,
    border: `1px solid ${css.borderLight}`,
    background: css.cardWhite,
    color: css.textDark,
    fontSize: compact ? 11 : 13,
    fontWeight: 700,
    cursor: "pointer",
    width: compact ? 112 : "auto",
    boxSizing: "border-box",
  };

  const actions = (
    <>
      <div style={{ display: "flex", flexDirection: compact ? "column" : "row", flexWrap: compact ? "nowrap" : "wrap", gap: compact ? 8 : 10 }}>
        <button
          type="button"
          onClick={() => setResumeOpen(true)}
          disabled={!hasResume}
          title={hasResume ? "Open this candidate's resume" : "Resume not provided"}
          style={{ ...actionButtonStyle, cursor: hasResume ? "pointer" : "not-allowed", opacity: hasResume ? 1 : 0.5 }}
        >
          {compact ? "Resume" : "View resume"}
        </button>
        <button type="button" onClick={() => setResponsesOpen(true)} style={actionButtonStyle}>
          {compact ? "Free responses" : "View free responses"}
        </button>
      </div>

      <ResumeModal
        open={resumeOpen}
        onClose={() => setResumeOpen(false)}
        title={resume?.name || candidate.name}
        resumeId={resume?.id}
        fileUrl={resume?.fileUrl}
        authToken={authToken}
      />
      <ApplicationResponsesModal open={responsesOpen} onClose={() => setResponsesOpen(false)} candidate={candidate} {...responsesState} />
    </>
  );

  if (compact) return actions;

  return (
    <SectionCard title="Application materials">
      {hasResume ? (
        <>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: css.textGray }}>
            {resume.name || candidate.name}
          </p>
        </>
      ) : (
        <p style={{ margin: "0 0 14px", fontSize: 14, color: css.textGray }}>Resume not provided</p>
      )}

      {actions}
    </SectionCard>
  );
}
