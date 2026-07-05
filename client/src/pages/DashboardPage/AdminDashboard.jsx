import { useNavigate } from "react-router-dom";
import Topbar from "../../components/Topbar/Topbar";
import { css } from "../../theme/colors";
import useAdminDashboard from "./useAdminDashboard";
import {
  pageStyle,
  Panel,
  StatCard,
  ActionItemList,
  CompactQuickLinks,
  GraderProgressRows,
  RoundTimeline,
  StatusBanner,
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

  const quickActions = [
    { label: "Scoreboard", path: "/scoreboard", iconKey: "scoreboard" },
    { label: "Graders", path: "/grader-scoreboard", iconKey: "graders" },
    { label: "Flags", path: "/flagged-candidates", iconKey: "flags" },
    { label: "Cycles", path: "/cycle-management", iconKey: "cycles" },
    { label: "Team", path: "/user-management", iconKey: "team" },
    { label: "Demographics", path: "/demographics", iconKey: "demographics" },
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

        {!loading && !error ? (
          <StatusBanner
            context={context}
            pipeline={pipeline}
            graderSummary={graderSummary}
            actionItems={actionItems}
          />
        ) : null}

        <Panel title="At a glance">
          {loading ? (
            <div style={{ fontSize: 14, color: css.textGray }}>Loading pipeline…</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
              {pipelineStats.map((stat) => (
                <StatCard key={stat.label} {...stat} hero />
              ))}
            </div>
          )}
        </Panel>

        <div style={twoColumnGridStyle}>
          <div>
            <Panel title="Needs attention">
              {loading ? (
                <div style={{ fontSize: 14, color: css.textGray }}>Loading action items…</div>
              ) : (
                <ActionItemList items={actionItems} onNavigate={navigate} />
              )}
            </Panel>

            <Panel title="Pipeline">
              {loading ? (
                <div style={{ fontSize: 14, color: css.textGray }}>Loading pipeline…</div>
              ) : (
                <PipelineBreakdown pipeline={pipeline} isInterview={isInterview} />
              )}
            </Panel>
          </div>

          <div>
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

            <Panel title="Grading coverage">
              {loading ? (
                <div style={{ fontSize: 14, color: css.textGray }}>Loading grader coverage…</div>
              ) : data?.graderLoadError ? (
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
        </div>

        <Panel title="Quick links" style={{ marginBottom: 0 }}>
          <CompactQuickLinks actions={quickActions} onNavigate={navigate} />
        </Panel>
      </div>
    </div>
  );
}
