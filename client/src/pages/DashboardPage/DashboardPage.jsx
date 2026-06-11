import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import logo180 from "@images/180logo.webp";
import { useAuthedFetch } from "../../auth/AuthContext";
import { useActiveCycle } from "../../hooks/useActiveCycle";
import { css } from "../../theme/colors";
import { API } from "../../constants/config";

export default function DashboardPage() {
  const navigate = useNavigate();
  const authedFetch = useAuthedFetch();
  const { activeRound, gradingPath, isInterviewRound, loading: cycleLoading, phaseLabel } = useActiveCycle();
  const [graded, setGraded] = useState(0);
  const [expected, setExpected] = useState(null);
  const [interviewStats, setInterviewStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadProgress = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      if (isInterviewRound) {
        const res = await authedFetch(`${API}/interviews/candidates`);
        if (!res.ok) {
          setInterviewStats(null);
          setLoadError(true);
          return;
        }
        const data = await res.json();
        const stats = data.stats || {};
        setInterviewStats(stats);
        setGraded((stats.pass || 0) + (stats.fail || 0) + (stats.hold || 0));
        setExpected(stats.total || 0);
        return;
      }

      const res = await authedFetch(`${API}/reviews`);
      if (!res.ok) {
        setGraded(0);
        setExpected(null);
        setLoadError(true);
        return;
      }
      const data = await res.json();
      const n = Number(data.count);
      const goal = Number(data.expectedReviews);
      setGraded(Number.isFinite(n) ? n : 0);
      setExpected(Number.isFinite(goal) && goal > 0 ? goal : 30);
    } catch {
      setGraded(0);
      setExpected(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [authedFetch, isInterviewRound]);

  useEffect(() => {
    if (!cycleLoading) loadProgress();
  }, [loadProgress, cycleLoading]);

  const hasGoal = !loadError && expected != null;
  const goal = expected ?? 0;
  const progressPct =
    hasGoal && goal > 0 ? Math.min(100, Math.round((graded / goal) * 100)) : 0;

  const goalLabel = isInterviewRound
    ? `Evaluate ${goal} interview candidate${goal === 1 ? "" : "s"}`
    : `Grade ${goal} resume${goal === 1 ? "" : "s"}`;

  const buttonLabel = isInterviewRound ? "Open Interview Management" : "Start Grading Session";

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      minHeight: "100vh",
      background: "#F8FAFB",
      fontFamily: "'DM Sans', sans-serif",
      color: css.textDark,
      padding: 20
    }}>
      <img
        src={logo180}
        alt="180 Degrees Consulting"
        style={{
          width: 64,
          height: 64,
          objectFit: "contain",
          display: "block",
          marginBottom: 24,
          borderRadius: 16,
        }}
      />

      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px 0", letterSpacing: "-0.02em" }}>
        180DC Recruitment
      </h1>
      <div style={{ fontSize: 15, color: css.textGray, fontWeight: 500, marginBottom: 40 }}>
        {phaseLabel}
      </div>

      <div style={{
        background: css.cardWhite,
        width: "100%",
        maxWidth: 520,
        borderRadius: 16,
        padding: "28px 32px",
        boxShadow: "0 4px 32px rgba(0,0,0,0.04)",
        border: `1px solid ${css.borderLight}`
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, color: css.textGray, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
              <span>{isInterviewRound ? "📅" : "⭐"}</span> {isInterviewRound ? "Interview progress" : "Today's goal"}
            </span>
            <span style={{ fontSize: 18, fontWeight: 700 }}>
              {loading
                ? "Loading…"
                : loadError
                  ? "Could not load progress"
                  : activeRound
                    ? goalLabel
                    : "No active round"}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <span style={{ fontSize: 12, color: css.textGray, fontWeight: 500 }}>Progress</span>
            <span style={{ fontSize: 15, fontWeight: 700 }}>
              {loading ? "—" : hasGoal ? `${graded}/${goal}` : "—"}
            </span>
          </div>
        </div>

        <div style={{ height: 10, background: "#F3F4F6", borderRadius: 5, overflow: "hidden", marginBottom: 32 }}>
          <div
            style={{
              width: !hasGoal || loading ? "0%" : `${progressPct}%`,
              height: "100%",
              background: css.greenDark,
              borderRadius: 5,
              transition: "width 0.35s ease",
            }}
          />
        </div>

        {isInterviewRound && interviewStats ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 24, fontSize: 12 }}>
            {[
              ["Pass", interviewStats.pass],
              ["Fail", interviewStats.fail],
              ["Hold", interviewStats.hold],
              ["Pending", interviewStats.pending],
            ].map(([label, val]) => (
              <div key={label} style={{ textAlign: "center", padding: 8, background: "#F9FAFB", borderRadius: 8 }}>
                <div style={{ fontWeight: 700, color: css.textDark }}>{val ?? 0}</div>
                <div style={{ color: css.textGray, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        ) : null}

        <button
          onClick={() => navigate(activeRound ? gradingPath : "/")}
          disabled={!activeRound}
          style={{
            width: "100%",
            padding: "16px",
            background: activeRound ? css.greenDark : "#9CA3AF",
            color: "#FFF",
            border: "none",
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 600,
            cursor: activeRound ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            transition: "transform 0.15s, background 0.15s",
            boxShadow: activeRound ? "0 4px 14px rgba(40, 98, 65, 0.25)" : "none"
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
