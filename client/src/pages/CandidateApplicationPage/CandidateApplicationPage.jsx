import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import ErrorBanner from "../../components/ErrorBanner/ErrorBanner";
import Topbar from "../../components/Topbar/Topbar";
import { css } from "../../theme/colors";
import { qk } from "../../lib/queryKeys";
import ApplicationContactSection from "./ApplicationContactSection";
import ApplicationProfileSidebar from "./ApplicationProfileSidebar";
import ApplicationRoundsSection from "./ApplicationRoundsSection";
import ApplicationSignalsSection from "./ApplicationSignalsSection";
import ApplicationSummarySection from "./ApplicationSummarySection";
import useCandidateApplication from "./useCandidateApplication";
import useCandidateApplicationSummary from "./useCandidateApplicationSummary";

export default function CandidateApplicationPage() {
  const { candidateId: resumeId } = useParams();
  const location = useLocation();
  const cycleId = new URLSearchParams(location.search).get("cycleId") || null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const { candidate, resume, scoring, signals, roundDecision, contextLabel, loading, error, refresh } = useCandidateApplication(resumeId, cycleId);
  const summaryState = useCandidateApplicationSummary(resumeId, !loading && !error && Boolean(candidate), cycleId);
  const cachedScoreboard = queryClient
    .getQueriesData({ queryKey: qk.scoreboardRoot() })
    .map(([, cached]) => cached)
    .find((cached) => cached?.candidates?.some((entry) => String(entry.id) === String(resumeId)));
  const cachedCandidate = cachedScoreboard?.candidates?.find((entry) => String(entry.id) === String(resumeId));
  const candidateRank = Number(location.state?.candidateRank ?? cachedCandidate?.rank) || null;
  const candidateCount = Number(location.state?.candidateCount ?? cachedScoreboard?.stats?.applicants) || null;
  const resumeScreenRank = Number(location.state?.resumeScreenRank ?? cachedCandidate?.resumeScreenRank) || candidateRank;
  const coffeeChatScore = Number(location.state?.coffeeChatScore ?? scoring?.coffeeChatScore) || 0;
  const coffeeChatEvaluationCount = Number(location.state?.coffeeChatEvaluationCount ?? scoring?.coffeeChatEvaluationCount) || 0;
  const returnTo = location.state?.returnTo || null;
  const returnLabel = location.state?.returnLabel || "previous page";

  function returnToSource() {
    if (returnTo) {
      navigate(returnTo);
      return;
    }
    if ((window.history.state?.idx ?? 0) > 0) {
      navigate(-1);
      return;
    }
    navigate(cycleId ? `/scoreboard?cycleId=${encodeURIComponent(cycleId)}` : "/scoreboard");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: css.bgLight, color: css.textDark, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
      <Topbar phaseLabel={contextLabel} activeLabel="Application" rightSlot={<></>} />

      <div style={{ flex: 1, padding: "18px 20px 36px", width: "100%", boxSizing: "border-box" }}>
        <button
          type="button"
          onClick={returnToSource}
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
          ← Back to {returnLabel}
        </button>

        {loading && (
          <div style={{ padding: 48, textAlign: "center", color: css.textGray }}>Loading application…</div>
        )}

        {!loading && error && (
          <ErrorBanner error={error} onRetry={refresh} style={{ marginBottom: 20 }} />
        )}

        {!loading && !error && candidate && (
          <div className="candidate-application-grid" style={{ display: "grid", gridTemplateColumns: "minmax(250px, 280px) minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
            <ApplicationProfileSidebar
              candidate={candidate}
              resume={resume}
              scoring={scoring}
              authToken={token}
              candidateCount={candidateCount}
              resumeScreenRank={resumeScreenRank}
              coffeeChatScore={coffeeChatScore}
              coffeeChatEvaluationCount={coffeeChatEvaluationCount}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
              <ApplicationSummarySection {...summaryState} onRefresh={summaryState.refresh} />
              <ApplicationContactSection candidate={candidate} resume={resume} />
              <ApplicationSignalsSection signals={signals} />
              <ApplicationRoundsSection scoring={scoring} roundDecision={roundDecision} />
            </div>
          </div>
        )}
      </div>
      <style>{`
        @media (max-width: 900px) {
          .candidate-application-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
          .candidate-application-grid aside {
            position: static !important;
          }
        }
      `}</style>
    </div>
  );
}
