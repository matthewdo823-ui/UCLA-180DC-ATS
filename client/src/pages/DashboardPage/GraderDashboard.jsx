import { useNavigate } from "react-router-dom";
import logo180 from "@images/180logo.webp";
import { useActiveCycle } from "../../hooks/useActiveCycle";
import { css } from "../../theme/colors";
import { formatDate } from "../../utils/format";
import useGraderDashboard from "./useGraderDashboard";
import {
  pageStyle,
  Panel,
  ProgressBar,
  PrimaryButton,
  StatCard,
} from "./dashboardComponents";

function relativeLastActivity(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return "Less than an hour ago";
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return formatDate(iso, { style: "short" });
}

export default function GraderDashboard() {
  const navigate = useNavigate();
  const { gradingPath } = useActiveCycle();
  const { data, loading, error } = useGraderDashboard();

  const context = data?.context;
  const personal = data?.personal;
  const activeRound = context?.activeRound;
  const isInterview = context?.isInterviewRound;
  const phaseLabel = context?.phaseLabel || "Loading…";

  const count = personal?.count ?? 0;
  const goal = personal?.expectedReviews ?? 0;
  const progressPct = personal?.progressPct ?? 0;
  const goalComplete = personal?.goalComplete;
  const lastActivity = relativeLastActivity(personal?.lastActivityAt);

  const goalLabel = isInterview
    ? goal > 0
      ? `Evaluate ${goal} candidate${goal === 1 ? "" : "s"} in ${activeRound?.name || "this round"}`
      : "No candidates in your interview queue"
    : `Grade ${goal} resume${goal === 1 ? "" : "s"}`;

  const statusMessage = goalComplete
    ? "Goal complete — thank you!"
    : goal > count
      ? `${goal - count} more to go`
      : null;

  const buttonLabel = isInterview
    ? `Open ${activeRound?.name || "Interviews"}`
    : "Start Grading Session";

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 32 }}>
          <img
            src={logo180}
            alt="180 Degrees Consulting"
            style={{ width: 56, height: 56, objectFit: "contain", marginBottom: 16, borderRadius: 14 }}
          />
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
            Welcome back
          </h1>
          <p style={{ margin: 0, fontSize: 15, color: css.textGray, fontWeight: 500 }}>{phaseLabel}</p>
        </div>

        {error ? (
          <div style={{
            background: "rgba(226,75,74,0.08)",
            border: "1px solid rgba(226,75,74,0.22)",
            borderRadius: 12,
            padding: 16,
            color: css.red,
            fontSize: 14,
            marginBottom: 20,
            textAlign: "center",
          }}
          >
            {error}
          </div>
        ) : null}

        <div style={{
          background: css.cardWhite,
          border: `1px solid ${css.borderLight}`,
          borderRadius: 16,
          padding: "28px 32px",
          boxShadow: "0 4px 32px rgba(0,0,0,0.04)",
          marginBottom: 24,
        }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18, gap: 16 }}>
            <div>
              <span style={{ fontSize: 13, color: css.textGray, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                <span>{isInterview ? "📅" : "⭐"}</span>
                {isInterview ? "Your interview progress" : "Your grading goal"}
              </span>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 8 }}>
                {loading ? "Loading…" : activeRound ? goalLabel : "No active round"}
              </div>
              {!loading && statusMessage ? (
                <div style={{ fontSize: 13, color: goalComplete ? css.green : css.textGray, marginTop: 6, fontWeight: 600 }}>
                  {statusMessage}
                </div>
              ) : null}
              {!loading && lastActivity ? (
                <div style={{ fontSize: 12, color: css.textGray, marginTop: 4 }}>
                  Last activity: {lastActivity}
                </div>
              ) : null}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: css.textGray, fontWeight: 500 }}>Progress</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>
                {loading ? "—" : goal > 0 ? `${count}/${goal}` : count}
              </div>
            </div>
          </div>

          <ProgressBar pct={loading ? 0 : progressPct} />
          <div style={{ marginTop: 24 }}>
            <PrimaryButton
              label={buttonLabel}
              disabled={loading}
              onClick={() => navigate("/grading")}
              icon={(
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              )}
            />
          </div>
        </div>

        {isInterview && personal?.breakdown && !loading ? (
          <Panel title="Your evaluations">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {[
                ["Pass", personal.breakdown.pass, css.green],
                ["Fail", personal.breakdown.fail, css.red],
                ["Hold", personal.breakdown.hold, css.amber],
                ["Remaining", personal.breakdown.pending, css.textGray],
              ].map(([label, val, color]) => (
                <StatCard key={label} label={label} value={val ?? 0} accent={color} />
              ))}
            </div>
          </Panel>
        ) : null}

        <Panel title="Quick links">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {[
              { label: "Past reviews", path: gradingPath, icon: "📋", desc: "View and edit your submissions", state: { openPastQueue: true } },
              { label: "Scoreboard", path: "/scoreboard", icon: "📊", desc: "See ranked candidates" },
              { label: "Demographics", path: "/demographics", icon: "📈", desc: "Pipeline diversity overview" },
            ].map((link) => (
              <button
                key={link.path + link.label}
                type="button"
                onClick={() => navigate(link.path, link.state ? { state: link.state } : undefined)}
                style={{
                  background: css.cardWhite,
                  border: `1px solid ${css.borderLight}`,
                  borderRadius: 12,
                  padding: "16px 18px",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                <div style={{ fontSize: 22, marginBottom: 8 }}>{link.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: css.textDark }}>{link.label}</div>
                <div style={{ fontSize: 12, color: css.textGray, marginTop: 4 }}>{link.desc}</div>
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
