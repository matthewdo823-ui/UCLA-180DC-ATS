import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthedFetch } from "../../auth/AuthContext";
import { API } from "../../constants/config";
import { readJsonOrThrow, STALE } from "../../lib/queryClient";
import { qk } from "../../lib/queryKeys";
import { css } from "../../theme/colors";
import { pageTitleStyle } from "../../theme/typography";
import Topbar from "../../components/Topbar/Topbar";
import PageLoader from "../../components/PageLoader";
import ErrorBanner from "../../components/ErrorBanner/ErrorBanner";
import {
  InterestMultiplierEditor,
  InterestEventPanel,
  AddEventForm,
  InterestReviewQueue,
} from "./DemonstratedInterestPanels";

export default function DemonstratedInterestPage() {
  const authedFetch = useAuthedFetch();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [selectedCycleId, setSelectedCycleId] = useState(null);

  const cyclesQuery = useQuery({
    queryKey: qk.cycles(),
    queryFn: async () => {
      const res = await authedFetch(`${API}/cycles`);
      return readJsonOrThrow(res, "loading cycles", "Check GET /cycles in server/src/routes/cycleRoutes.js");
    },
    staleTime: STALE.dashboard,
  });

  const cycles = useMemo(
    () => (Array.isArray(cyclesQuery.data?.cycles) ? cyclesQuery.data.cycles : []),
    [cyclesQuery.data]
  );
  const activeCycleId = cyclesQuery.data?.activeCycleId || null;

  // Defaults to the active cycle; past cycles stay reachable because their
  // attendance history is still worth reading after the cycle closes.
  const cycle = useMemo(() => {
    if (selectedCycleId) return cycles.find((c) => c.id === selectedCycleId) || null;
    return cycles.find((c) => c.id === activeCycleId) || cycles[0] || null;
  }, [cycles, selectedCycleId, activeCycleId]);

  const eventsQuery = useQuery({
    queryKey: qk.interestEvents(cycle?.id),
    enabled: Boolean(cycle?.id),
    queryFn: async () => {
      const res = await authedFetch(`${API}/cycles/${cycle.id}/interest-events`);
      return readJsonOrThrow(
        res,
        "loading Demonstrated Interest events",
        "Run server/sql/add_demonstrated_interest.sql and check server/src/routes/interestRoutes.js"
      );
    },
  });

  const events = eventsQuery.data?.events || [];
  const staleCount = events.filter((e) => e.mappingStatus === "stale").length;
  const needsReview = events.reduce(
    (sum, e) => sum + (e.counts?.unmatched || 0) + (e.counts?.late || 0),
    0
  );

  // Attendance changes move scores, so expire the scoreboard and profile caches too.
  const refreshAll = useCallback(async () => {
    if (!cycle?.id) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.interestEvents(cycle.id) }),
      queryClient.invalidateQueries({ queryKey: qk.interestAttendance(cycle.id) }),
      queryClient.invalidateQueries({ queryKey: qk.scoreboardRoot() }),
      queryClient.invalidateQueries({ queryKey: qk.candidateApplicationsRoot() }),
    ]);
  }, [cycle?.id, queryClient]);

  const handleStepsSaved = useCallback(async () => {
    setBusy(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.cycles() }),
        queryClient.invalidateQueries({ queryKey: qk.scoreboardRoot() }),
      ]);
    } finally {
      setBusy(false);
    }
  }, [queryClient]);

  if (cyclesQuery.isPending) {
    return <PageLoader label="Loading Demonstrated Interest…" />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: css.bgLight, color: css.textDark, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
      <Topbar phaseLabel="Admin · Demonstrated Interest" activeLabel="Demonstrated Interest" rightSlot={<></>} />

      <div style={{ maxWidth: 1360, margin: "0 auto", width: "100%", boxSizing: "border-box", padding: "24px 32px 40px" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ ...pageTitleStyle, margin: "0 0 8px" }}>Demonstrated Interest</h1>
          <p style={{ margin: 0, fontSize: 14, color: css.textGray, lineHeight: 1.5 }}>
            Event attendance, logged through one Google Form per event, multiplies each candidate&apos;s
            Resume + FRQ score. Add an event, map its form fields, then resolve anyone the sync could not match.
          </p>
        </div>

        {cyclesQuery.error ? <ErrorBanner error={cyclesQuery.error} /> : null}

        {cycles.length > 1 ? (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 20, fontSize: 12, fontWeight: 700, color: css.textGray }}>
            Cycle
            <select
              value={cycle?.id || ""}
              onChange={(event) => setSelectedCycleId(event.target.value)}
              style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${css.borderLight}`, background: css.cardWhite, fontSize: 13, fontWeight: 600, color: css.textDark }}
            >
              {cycles.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}{option.id === activeCycleId ? " (active)" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {!cycle ? (
          <p style={{ margin: 0, fontSize: 14, color: css.textGray }}>
            No recruiting cycles yet. Create one in Cycle management first.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {staleCount || needsReview ? (
              <div style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${staleCount ? "rgba(226,75,74,0.4)" : css.borderLight}`, background: css.cardWhite, fontSize: 13 }}>
                {needsReview ? <span>{needsReview} attendance row{needsReview === 1 ? "" : "s"} need review</span> : null}
                {needsReview && staleCount ? " · " : null}
                {staleCount ? <span style={{ color: css.red }}>{staleCount} form{staleCount === 1 ? "" : "s"} changed since mapping</span> : null}
              </div>
            ) : null}

            <InterestMultiplierEditor
              cycle={cycle}
              busy={busy}
              authedFetch={authedFetch}
              onSaved={handleStepsSaved}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: css.textDark }}>Events</h2>
              {eventsQuery.error ? (
                <p style={{ margin: 0, fontSize: 12, color: css.red }}>{eventsQuery.error.message}</p>
              ) : null}
              {events.map((event) => (
                <InterestEventPanel
                  key={event.id}
                  event={event}
                  authedFetch={authedFetch}
                  onChanged={refreshAll}
                />
              ))}
              {!eventsQuery.error ? (
                <AddEventForm cycleId={cycle.id} authedFetch={authedFetch} onAdded={refreshAll} />
              ) : null}
            </div>

            {!eventsQuery.error && events.length ? (
              <InterestReviewQueue cycleId={cycle.id} authedFetch={authedFetch} onChanged={refreshAll} />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
