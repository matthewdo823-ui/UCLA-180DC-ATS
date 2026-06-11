import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import Topbar from "../../components/Topbar/Topbar";
import { css } from "../../theme/colors";
import ApplicationContactSection from "./ApplicationContactSection";
import ApplicationEvaluationsSection from "./ApplicationEvaluationsSection";
import ApplicationProfileSidebar from "./ApplicationProfileSidebar";
import ApplicationResponsesSection from "./ApplicationResponsesSection";
import ApplicationResumeSection from "./ApplicationResumeSection";
import useCandidateApplication from "./useCandidateApplication";

export default function CandidateApplicationPage() {
  const { candidateId: resumeId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { candidate, resume, scoring, contextLabel, loading, error } = useCandidateApplication(resumeId);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: css.bgLight, color: css.textDark, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
      <Topbar phaseLabel={contextLabel} activeLabel="Application" rightSlot={<></>} />

      <div style={{ flex: 1, padding: "20px 22px 40px", maxWidth: 1180, margin: "0 auto", width: "100%" }}>
        <button
          type="button"
          onClick={() => navigate("/scoreboard")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 20,
            padding: "8px 14px",
            borderRadius: 6,
            border: `1px solid ${css.borderLight}`,
            background: css.cardWhite,
            color: css.textDark,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ← Back to scoreboard
        </button>

        {loading && (
          <div style={{ padding: 48, textAlign: "center", color: css.textGray }}>Loading application…</div>
        )}

        {!loading && error && (
          <div style={{ padding: 24, borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B" }}>
            {error}
          </div>
        )}

        {!loading && !error && candidate && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 300px) minmax(0, 1fr)", gap: 20, alignItems: "start" }}>
            <ApplicationProfileSidebar candidate={candidate} resume={resume} scoring={scoring} />

            <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
              <ApplicationContactSection candidate={candidate} resume={resume} />
              <ApplicationResponsesSection candidate={candidate} />
              <ApplicationResumeSection candidate={candidate} resume={resume} authToken={token} />
              <ApplicationEvaluationsSection scoring={scoring} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
