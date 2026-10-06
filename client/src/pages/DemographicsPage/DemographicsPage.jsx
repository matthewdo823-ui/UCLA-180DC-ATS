import { useQuery } from "@tanstack/react-query";
import { useAuthedFetch } from "../../auth/AuthContext";
import { useActiveCycle } from "../../hooks/useActiveCycle";
import { readJsonOrThrow, STALE } from "../../lib/queryClient";
import { qk } from "../../lib/queryKeys";
import Topbar from "../../components/Topbar/Topbar";
import PageLoader from "../../components/PageLoader";
import ErrorBanner from "../../components/ErrorBanner/ErrorBanner";
import {
  DemographicsLegend,
  DemographicsStackedBarChart,
  DemographicsSummaryTable,
} from "../../components/DemographicsChart/DemographicsChart";
import { API } from "../../constants/config";
import { css } from "../../theme/colors";
import { pageTitleStyle, sansFont } from "../../theme/typography";

function StageSummaryCard({ stage }) {
  return (
    <div style={{
      background: css.cardWhite,
      border: `1px solid ${css.borderLight}`,
      borderRadius: 10,
      padding: "14px 16px",
      minWidth: 140,
      flex: "1 1 140px",
    }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: css.textGray, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {stage.label}
      </div>
      <div style={{ marginTop: 8, fontSize: 28, fontWeight: 700, color: css.greenDark, lineHeight: 1 }}>
        {stage.total}
      </div>
    </div>
  );
}

function DimensionPanel({ dimension, stages }) {
  return (
    <section style={{
      background: css.cardWhite,
      border: `1px solid ${css.borderLight}`,
      borderRadius: 12,
      padding: "20px 22px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
    }}
    >
      <h2 style={{ margin: 0, fontFamily: sansFont, fontSize: 20, fontWeight: 500, color: css.textDark }}>
        {dimension.label}
      </h2>
      <p style={{ margin: "8px 0 0", fontSize: 13, color: css.textGray, lineHeight: 1.5 }}>
        {dimension.kind === "indicator"
          ? "A mutually exclusive Selected / Not selected / Not specified breakdown at every pipeline stage."
          : "Share of each group at every pipeline stage. Hover anywhere on a bar for exact counts."}
      </p>

      <DemographicsStackedBarChart
        stages={stages}
        categories={dimension.categories}
        stageCounts={dimension.stages}
      />
      <DemographicsLegend categories={dimension.categories} />
      <DemographicsSummaryTable
        stages={stages}
        categories={dimension.categories}
        stageCounts={dimension.stages}
      />
    </section>
  );
}

export default function DemographicsPage() {
  const authedFetch = useAuthedFetch();
  const { phaseLabel, cycle } = useActiveCycle();

  // Cached under qk.demographics so revisiting the page (or bouncing back to it)
  // renders instantly from cache and refreshes in the background instead of
  // showing a spinner and refetching from scratch every mount.
  const { data, isPending: loading, error: queryError, refetch } = useQuery({
    queryKey: qk.demographics(),
    queryFn: async () => {
      const res = await authedFetch(`${API}/demographics`);
      return readJsonOrThrow(
        res,
        "loading demographic data",
        "Check GET /demographics endpoint in server/src/routes/dashboardRoutes.js"
      );
    },
    staleTime: STALE.dashboard,
  });

  const stages = data?.stages || [];
  const dimensions = data?.dimensions || [];
  const cycleName = data?.context?.cycle?.name || cycle?.name || "Active cycle";

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      minHeight: "100vh",
      background: css.bgLight,
      color: css.textDark,
      fontFamily: "'DM Sans', sans-serif",
      fontSize: 13,
    }}
    >
      <Topbar phaseLabel={phaseLabel} activeLabel="Demographics" rightSlot={<></>} />

      <div style={{ flex: 1, padding: "18px 22px 36px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: css.greenDark }}>
            {cycleName}
          </p>
          <h1 style={pageTitleStyle}>
            Demographics by pipeline stage
          </h1>
          <p style={{ margin: "10px 0 0", maxWidth: 760, fontSize: 14, lineHeight: 1.55, color: css.textGray }}>
            Composition across applicants, screening pools, and candidates advanced to each subsequent round.
            Percentages use the stage total; counts are shown beside each bar and in the tables.
          </p>
        </div>

        {loading && <PageLoader />}

        {!loading && queryError && (
          <div style={{ maxWidth: 1200, margin: "16px auto 0", width: "100%" }}>
            <ErrorBanner error={queryError} onRetry={() => refetch()} />
          </div>
        )}

        {!loading && !queryError && data && (
          <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {stages.map((stage) => (
                <StageSummaryCard key={stage.id} stage={stage} />
              ))}
            </div>

            {stages[0]?.total === 0 ? (
              <div style={{
                background: css.cardWhite,
                border: `1px solid ${css.borderLight}`,
                borderRadius: 12,
                padding: "28px 24px",
                color: css.textGray,
                textAlign: "center",
              }}
              >
                No applicants in this cycle yet. Sync the application form to populate demographics.
              </div>
            ) : (
              dimensions.map((dimension) => (
                <DimensionPanel key={dimension.id} dimension={dimension} stages={stages} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
