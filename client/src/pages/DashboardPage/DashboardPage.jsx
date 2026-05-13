import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthedFetch } from "../../auth/AuthContext";
import { css } from "../../theme/colors";
import { API } from "../../constants/config";

export default function DashboardPage() {
  const navigate = useNavigate();
  const authedFetch = useAuthedFetch();
  const [graded, setGraded] = useState(0);
  const [expected, setExpected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadProgress = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
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
      setExpected(Number.isFinite(goal) && goal > 0 ? goal : 15);
    } catch {
      setGraded(0);
      setExpected(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  const hasGoal = !loadError && expected != null;
  const goal = expected ?? 0;
  const progressPct =
    hasGoal && goal > 0 ? Math.min(100, Math.round((graded / goal) * 100)) : 0;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      minHeight: "100vh", // keep minHeight for safety if content is short
      background: "#F8FAFB",
      fontFamily: "'DM Sans', sans-serif",
      color: css.textDark,
      padding: 20
    }}>

      {/* Logo Block */}
      <div style={{
        width: 64,
        height: 64,
        background: css.greenDark,
        borderRadius: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 24,
        boxShadow: "0 8px 24px rgba(40, 98, 65, 0.15)"
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
      </div>

      {/* Header text */}
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px 0", letterSpacing: "-0.02em" }}>
        180DC Recruitment
      </h1>
      <div style={{ fontSize: 15, color: css.textGray, fontWeight: 500, marginBottom: 40 }}>
        Resume Screener Demo
      </div>

      {/* Main Card */}
      <div style={{
        background: css.cardWhite,
        width: "100%",
        maxWidth: 520,
        borderRadius: 16,
        padding: "28px 32px",
        boxShadow: "0 4px 32px rgba(0,0,0,0.04)",
        border: `1px solid ${css.borderLight}`
      }}>

        {/* Card Header Row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, color: css.textGray, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
              <span>⭐</span> Today's Goal
            </span>
            <span style={{ fontSize: 18, fontWeight: 700 }}>
              {loading
                ? "Loading your goal…"
                : loadError
                  ? "Could not load your grading goal"
                  : `Grade ${goal} resume${goal === 1 ? "" : "s"}`}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <span style={{ fontSize: 12, color: css.textGray, fontWeight: 500 }}>
              Progress
            </span>
            <span style={{ fontSize: 15, fontWeight: 700 }}>
              {loading ? "—" : hasGoal ? `${graded}/${goal}` : "—"}
            </span>
          </div>
        </div>

        {/* Progress Bar */}
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

        {/* Action Button */}
        <button
          onClick={() => navigate("/resume-screener")}
          style={{
            width: "100%",
            padding: "16px",
            background: css.greenDark,
            color: "#FFF",
            border: "none",
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            transition: "transform 0.15s, background 0.15s",
            boxShadow: "0 4px 14px rgba(40, 98, 65, 0.25)"
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.background = "#1F4E33";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.background = css.greenDark;
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          Start Grading Session
        </button>
      </div>

    </div>
  );
}
