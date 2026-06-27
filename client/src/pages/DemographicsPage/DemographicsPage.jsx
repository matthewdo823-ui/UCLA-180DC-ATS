import { useCallback, useEffect, useState } from "react";
import { useAuthedFetch } from "../../auth/AuthContext";
import { useActiveCycle } from "../../hooks/useActiveCycle";
import Topbar from "../../components/Topbar/Topbar";
import {
  DemographicsLegend,
  DemographicsStackedBarChart,
  DemographicsSummaryTable,
} from "../../components/DemographicsChart/DemographicsChart";
import { API } from "../../constants/config";
import { css } from "../../theme/colors";
import { serifFont } from "../../theme/typography";

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
      <h2 style={{ margin: 0, fontFamily: serifFont, fontSize: 20, fontWeight: 500, color: css.textDark }}>
        {dimension.label}
      </h2>
      <p style={{ margin: "8px 0 0", fontSize: 13, color: css.textGray, lineHeight: 1.5 }}>
        Share of each group at every pipeline stage. Hover anywhere on a bar for exact counts.
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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDemographics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authedFetch(`${API}/demographics`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 404) {
          throw new Error("Demographics API not found — restart the server in /server.");
        }
        throw new Error(body.error || `Could not load demographics (${res.status})`);
      }
      setData(await res.json());
    } catch (err) {
      setData(null);
      setError(err.message || "Could not load demographics");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    loadDemographics();
  }, [loadDemographics]);

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
          <h1 style={{ margin: 0, fontFamily: serifFont, fontSize: 28, fontWeight: 500, color: css.textDark }}>
            Demographics by pipeline stage
          </h1>
          <p style={{ margin: "10px 0 0", maxWidth: 760, fontSize: 14, lineHeight: 1.55, color: css.textGray }}>
            Composition across applicants, screening pools, and candidates advanced to each subsequent round.
            Percentages use the stage total; counts are shown beside each bar and in the tables.
          </p>
        </div>

        {loading && (
          <div style={{ maxWidth: 1200, margin: "24px auto 0", width: "100%", color: css.textGray }}>
            Loading demographics…
          </div>
        )}

        {!loading && error && (
          <div style={{
            maxWidth: 1200,
            margin: "24px auto 0",
            width: "100%",
            padding: "14px 16px",
            borderRadius: 10,
            background: "rgba(226,75,74,0.08)",
            border: "1px solid rgba(226,75,74,0.18)",
            color: css.red,
          }}
          >
            {error}
          </div>
        )}

        {!loading && !error && data && (
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
