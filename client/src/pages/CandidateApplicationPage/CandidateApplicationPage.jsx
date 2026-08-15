import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import Topbar from "../../components/Topbar/Topbar";
import { css } from "../../theme/colors";
import { isAdminRole } from "../../utils/auth";
import AdminOverridesSection from "./AdminOverridesSection";
import ApplicationContactSection from "./ApplicationContactSection";
import ApplicationEvaluationsSection from "./ApplicationEvaluationsSection";
import ApplicationProfileSidebar from "./ApplicationProfileSidebar";
import ApplicationResumeSection from "./ApplicationResumeSection";
import ApplicationSignalsSection from "./ApplicationSignalsSection";
import ApplicationSummarySection from "./ApplicationSummarySection";
import useCandidateApplication from "./useCandidateApplication";
import useCandidateApplicationSummary from "./useCandidateApplicationSummary";

export default function CandidateApplicationPage() {
  const { candidateId: resumeId } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { candidate, resume, scoring, signals, contextLabel, loading, error, refresh } = useCandidateApplication(resumeId);
  const summaryState = useCandidateApplicationSummary(resumeId, !loading && !error && Boolean(candidate));
  const isAdmin = isAdminRole(user?.role);

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
              <ApplicationSummarySection {...summaryState} onRefresh={summaryState.refresh} />
              <ApplicationContactSection candidate={candidate} resume={resume} />
              <ApplicationSignalsSection signals={signals} />
              {isAdmin && (
                <AdminOverridesSection
                  resumeId={resumeId}
                  scoring={scoring}
                  onOverrideSaved={() => refresh()}
                />
              )}
              <ApplicationResumeSection candidate={candidate} resume={resume} authToken={token} />
              <ApplicationEvaluationsSection scoring={scoring} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
