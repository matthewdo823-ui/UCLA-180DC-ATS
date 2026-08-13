import { useState } from "react";
import { isDriveUrl } from "../../components/AuthedDriveImage/AuthedDriveImage";
import ResumeModal from "../../components/ResumeModal/ResumeModal";
import { css } from "../../theme/colors";
import ApplicationResponsesModal from "./ApplicationResponsesSection";
import SectionCard from "./components/SectionCard";

export default function ApplicationResumeSection({ candidate, resume, authToken }) {
  const [resumeOpen, setResumeOpen] = useState(false);
  const [responsesOpen, setResponsesOpen] = useState(false);

  const actionButtonStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    borderRadius: 8,
    border: `1px solid ${css.borderLight}`,
    background: css.cardWhite,
    color: css.textDark,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  };

  return (
    <SectionCard title="Application materials">
      {isDriveUrl(resume?.fileUrl) ? (
        <>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: css.textGray }}>
            {resume.name || candidate.name}
          </p>
        </>
      ) : (
        <p style={{ margin: "0 0 14px", fontSize: 14, color: css.textGray }}>Resume not provided</p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {isDriveUrl(resume?.fileUrl) && (
          <button type="button" onClick={() => setResumeOpen(true)} style={actionButtonStyle}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            View resume
          </button>
        )}
        <button type="button" onClick={() => setResponsesOpen(true)} style={actionButtonStyle}>
          View free responses
        </button>
      </div>

      <ResumeModal
        open={resumeOpen}
        onClose={() => setResumeOpen(false)}
        title={resume?.name || candidate.name}
        fileUrl={resume?.fileUrl}
        authToken={authToken}
      />
      <ApplicationResponsesModal open={responsesOpen} onClose={() => setResponsesOpen(false)} candidate={candidate} />
    </SectionCard>
  );
}
