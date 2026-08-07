import { useNavigate } from "react-router-dom";
import Topbar from "../../components/Topbar/Topbar";
import { css } from "../../theme/colors";
import useAdminDashboard from "./useAdminDashboard";
import {
  pageStyle,
  Panel,
  StatCard,
  ActionItemList,
  GraderProgressRows,
  RoundTimeline,
  PipelineBreakdown,
  twoColumnGridStyle,
} from "./dashboardComponents";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { data, loading, error } = useAdminDashboard();

  const context = data?.context;
  const pipeline = data?.pipeline;
  const graderSummary = data?.graderSummary;
  const actionItems = data?.actionItems || [];

  const isInterview = context?.isInterviewRound;
  const phaseLabel = context?.phaseLabel || "Admin Dashboard";

  const pipelineStats = isInterview
    ? [
        { label: "In pool", value: pipeline?.applicants ?? 0 },
        { label: "Evaluated", value: pipeline?.reviewed ?? 0 },
        { label: "Pass", value: pipeline?.pass ?? 0, accent: css.green },
        { label: "Pending", value: pipeline?.pending ?? 0, accent: css.amber },
      ]
    : [
        { label: "Applicants", value: pipeline?.applicants ?? 0 },
        { label: "Reviewed", value: pipeline?.reviewed ?? 0 },
        { label: "Awaiting review", value: pipeline?.awaitingReviews ?? 0, accent: css.amber },
        { label: "Undecided", value: pipeline?.undecidedCount ?? 0, accent: css.amber },
      ];

  // The old status banner's alert counts, folded into the At a glance grid as
  // boxes. They only appear when non-zero, mirroring the banner's old behavior.
  const criticalCount = actionItems.filter((item) => item.severity === "critical").length;
  const warningCount = actionItems.filter((item) => item.severity === "warning").length;

  const alertStats = [];
  if (criticalCount > 0) {
    alertStats.push({ label: criticalCount === 1 ? "Critical" : "Criticals", value: criticalCount, accent: css.red });
  }
  if (warningCount > 0) {
    alertStats.push({ label: warningCount === 1 ? "Warning" : "Warnings", value: warningCount, accent: css.amber });
  }
  if (graderSummary?.behindCount > 0) {
    alertStats.push({
      label: graderSummary.behindCount === 1 ? "Grader behind" : "Graders behind",
      value: graderSummary.behindCount,
      accent: css.amber,
    });
  }

  const glanceStats = [...pipelineStats, ...alertStats];

  return (
    <div style={{ ...pageStyle, padding: 0 }}>
      <Topbar phaseLabel={phaseLabel} showActivePill={Boolean(context?.activeRound)} activeLabel="Admin" />

      <div style={{ padding: "24px 32px 40px", maxWidth: 1200, margin: "0 auto" }}>
        {error ? (
          <div style={{
            background: "rgba(226,75,74,0.08)",
            border: "1px solid rgba(226,75,74,0.22)",
            borderRadius: 12,
            padding: 16,
            color: css.red,
            fontSize: 14,
            marginBottom: 24,
          }}
          >
            {error}
          </div>
        ) : null}

        {loading ? (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            minHeight: "60vh",
            color: css.textGray,
            fontSize: 14,
          }}
          >
            <div style={{
              width: 36,
              height: 36,
              border: `3px solid ${css.borderLight}`,
              borderTopColor: css.greenDark,
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
            />
            Loading dashboard…
          </div>
        ) : (
          <>
             <Panel title="Round timeline">
              <RoundTimeline
                rounds={context?.allRounds}
                activeRound={context?.activeRound}
                nextRound={context?.nextRound}
              />
            </Panel>

            <Panel title="At a glance">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
                {glanceStats.map((stat) => (
                  <StatCard key={stat.label} {...stat} hero />
                ))}
              </div>
            </Panel>

           

            <div style={twoColumnGridStyle}>
              <Panel title="Needs attention">
                <ActionItemList items={actionItems} onNavigate={navigate} />
              </Panel>

              <Panel title="Grading coverage">
                {data?.graderLoadError ? (
                  <div style={{ fontSize: 14, color: css.red }}>{data.graderLoadError}</div>
                ) : !graderSummary ? (
                  <div style={{ fontSize: 14, color: css.textGray }}>No grader data for this cycle.</div>
                ) : (
                  <div style={{
                    background: css.cardWhite,
                    border: `1px solid ${css.borderLight}`,
                    borderRadius: 12,
                    padding: "18px 20px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                  }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginBottom: 16 }}>
                      <StatCard label="Active graders" value={graderSummary.activeGraders} sub={`of ${graderSummary.graders} total`} />
                      <StatCard label="Total reviews" value={graderSummary.totalReviews} sub={`Avg ${graderSummary.avgReviews} per grader`} />
                      <StatCard label="Goal complete" value={graderSummary.completeCount} sub={`${graderSummary.expectedReviews} reviews each`} />
                      <StatCard
                        label="Not started"
                        value={graderSummary.notStarted}
                        accent={graderSummary.notStarted > 0 ? css.amber : css.greenDark}
                      />
                    </div>
                    {graderSummary.behindGraders?.length > 0 ? (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 700, color: css.textGray, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Behind on goal
                        </div>
                        <GraderProgressRows
                          graders={graderSummary.behindGraders}
                          expectedReviews={graderSummary.expectedReviews}
                        />
                      </>
                    ) : (
                      <div style={{ fontSize: 13, color: css.textGray }}>All active graders are on track.</div>
                    )}
                  </div>
                )}
              </Panel>
            </div>

            <Panel title="Pipeline">
              <PipelineBreakdown pipeline={pipeline} isInterview={isInterview} />
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}
