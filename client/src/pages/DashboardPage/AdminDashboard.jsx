import { useNavigate } from "react-router-dom";
import Topbar from "../../components/Topbar/Topbar";
import { css } from "../../theme/colors";
import useAdminDashboard from "./useAdminDashboard";
import {
  pageStyle,
  Panel,
  StatCard,
  ActionItemList,
  QuickActionGrid,
  GraderProgressRows,
  RoundTimeline,
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

  const deliberationStats = !isInterview && pipeline?.mode === "resume"
    ? [
        { label: "Advanced", value: pipeline?.advanced ?? 0, accent: css.green },
        { label: "Hold", value: pipeline?.hold ?? 0, accent: css.amber },
        { label: "Rejected", value: pipeline?.rejected ?? 0, accent: css.red },
        { label: "Pending", value: pipeline?.pending ?? 0 },
      ]
    : null;

  const quickActions = [
    { label: "Scoreboard", path: "/scoreboard", icon: "📊" },
    { label: "Graders", path: "/grader-scoreboard", icon: "👥" },
    { label: "Flags", path: "/flagged-candidates", icon: "🚩" },
    { label: "Cycles", path: "/cycle-management", icon: "⏱" },
    { label: "Team", path: "/user-management", icon: "🧑‍💼" },
    { label: "Demographics", path: "/demographics", icon: "📈" },
  ];

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

        <Panel title="Needs attention">
          {loading ? (
            <div style={{ fontSize: 14, color: css.textGray }}>Loading action items…</div>
          ) : (
            <ActionItemList items={actionItems} onNavigate={navigate} />
          )}
        </Panel>

        <Panel title="Round timeline">
          {loading ? (
            <div style={{ fontSize: 14, color: css.textGray }}>Loading round status…</div>
          ) : (
            <RoundTimeline
              rounds={context?.allRounds}
              activeRound={context?.activeRound}
              nextRound={context?.nextRound}
            />
          )}
        </Panel>

        <Panel title="Pipeline">
          {loading ? (
            <div style={{ fontSize: 14, color: css.textGray }}>Loading pipeline…</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: deliberationStats ? 12 : 0 }}>
                {pipelineStats.map((stat) => (
                  <StatCard key={stat.label} {...stat} />
                ))}
              </div>
              {deliberationStats ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
                  {deliberationStats.map((stat) => (
                    <StatCard key={stat.label} {...stat} />
                  ))}
                </div>
              ) : null}
            </>
          )}
        </Panel>

        <Panel title="Grading coverage">
          {loading ? (
            <div style={{ fontSize: 14, color: css.textGray }}>Loading grader coverage…</div>
          ) : data?.graderLoadError ? (
            <div style={{ fontSize: 14, color: css.red }}>{data.graderLoadError}</div>
          ) : !graderSummary ? (
            <div style={{ fontSize: 14, color: css.textGray }}>No grader data for this cycle.</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
                <StatCard label="Active graders" value={graderSummary.activeGraders} sub={`of ${graderSummary.graders} total`} />
                <StatCard label="Total reviews" value={graderSummary.totalReviews} sub={`Avg ${graderSummary.avgReviews} per grader`} />
                <StatCard label="Goal complete" value={graderSummary.completeCount} sub={`${graderSummary.expectedReviews} reviews each`} />
                <StatCard label="Not started" value={graderSummary.notStarted} accent={graderSummary.notStarted > 0 ? css.amber : css.greenDark} />
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
            </>
          )}
        </Panel>

        <Panel title="Quick actions">
          <QuickActionGrid actions={quickActions} onNavigate={navigate} />
        </Panel>
      </div>
    </div>
  );
}
