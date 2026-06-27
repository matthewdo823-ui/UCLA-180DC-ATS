import { css } from "../../theme/colors";
import { formatRoundKind } from "../../constants/rounds";

export const pageStyle = {
  minHeight: "100%",
  background: "#F8FAFB",
  fontFamily: "'DM Sans', sans-serif",
  color: css.textDark,
  padding: "28px 32px 40px",
};

export const sectionTitleStyle = {
  fontSize: 13,
  fontWeight: 700,
  color: css.textGray,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  margin: "0 0 14px",
};

export function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: css.cardWhite,
      border: `1px solid ${css.borderLight}`,
      borderRadius: 12,
      padding: "18px 20px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
      minWidth: 0,
    }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: css.textGray, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ marginTop: 8, fontSize: 28, fontWeight: 700, color: accent || css.greenDark, lineHeight: 1 }}>
        {value}
      </div>
      {sub ? (
        <div style={{ marginTop: 6, fontSize: 12, color: css.textGray }}>{sub}</div>
      ) : null}
    </div>
  );
}

export function ProgressBar({ pct, color = css.greenDark }) {
  return (
    <div style={{ height: 10, background: "#F3F4F6", borderRadius: 5, overflow: "hidden" }}>
      <div
        style={{
          width: `${Math.max(0, Math.min(100, pct || 0))}%`,
          height: "100%",
          background: color,
          borderRadius: 5,
          transition: "width 0.35s ease",
        }}
      />
    </div>
  );
}

const SEVERITY_STYLE = {
  critical: { bg: "rgba(226,75,74,0.08)", color: css.red, bd: "rgba(226,75,74,0.22)" },
  warning: { bg: "rgba(239,159,39,0.10)", color: css.amber, bd: "rgba(239,159,39,0.28)" },
  info: { bg: "rgba(29,158,117,0.08)", color: css.green, bd: "rgba(29,158,117,0.22)" },
};

export function ActionItemList({ items, onNavigate }) {
  if (!items?.length) {
    return (
      <div style={{
        background: css.cardWhite,
        border: `1px solid ${css.borderLight}`,
        borderRadius: 12,
        padding: "24px 20px",
        color: css.textGray,
        fontSize: 14,
        textAlign: "center",
      }}
      >
        All clear — nothing needs attention right now.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item) => {
        const style = SEVERITY_STYLE[item.severity] || SEVERITY_STYLE.info;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.path)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              width: "100%",
              textAlign: "left",
              background: css.cardWhite,
              border: `1px solid ${css.borderLight}`,
              borderLeft: `3px solid ${style.color}`,
              borderRadius: 10,
              padding: "14px 16px",
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: css.textDark }}>{item.label}</div>
              {item.detail ? (
                <div style={{ fontSize: 12, color: css.textGray, marginTop: 4 }}>{item.detail}</div>
              ) : null}
            </div>
            {item.count != null ? (
              <span style={{
                background: style.bg,
                color: style.color,
                border: `1px solid ${style.bd}`,
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 800,
                padding: "4px 12px",
                flexShrink: 0,
              }}
              >
                {item.count}
              </span>
            ) : (
              <span style={{ fontSize: 18, color: css.textGray, flexShrink: 0 }}>→</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const ROUND_STATUS_STYLE = {
  active: {
    icon: "●",
    color: css.green,
    bg: "rgba(29,158,117,0.10)",
    bd: "rgba(29,158,117,0.35)",
    label: "Active",
  },
  closed: {
    icon: "✓",
    color: css.textGray,
    bg: "rgba(107,114,128,0.08)",
    bd: "rgba(107,114,128,0.22)",
    label: "Closed",
  },
  draft: {
    icon: "○",
    color: css.amber,
    bg: "rgba(239,159,39,0.08)",
    bd: "rgba(239,159,39,0.28)",
    label: "Draft",
  },
};

function getRoundPhaseMessage({ rounds, activeRound, nextRound }) {
  if (!rounds?.length) {
    return {
      tone: "neutral",
      title: "No rounds configured",
      detail: "Add rounds for this cycle in Cycle Management.",
    };
  }

  if (activeRound) {
    const style = ROUND_STATUS_STYLE.active;
    return {
      tone: "active",
      title: `Currently in ${activeRound.name}`,
      detail: `${formatRoundKind(activeRound.type)} is open — graders and deliberation run against this round.`,
      accent: style.color,
      bg: style.bg,
      bd: style.bd,
    };
  }

  const sorted = [...rounds].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const lastClosed = [...sorted].reverse().find((r) => r.status === "closed");
  const nextDraft = sorted.find((r) => r.status === "draft");
  const allClosed = sorted.every((r) => r.status === "closed");
  const allDraft = sorted.every((r) => r.status === "draft");

  if (allDraft) {
    return {
      tone: "between",
      title: "Recruiting hasn't started",
      detail: "All rounds are still in draft. Activate Round 1 when applications are ready to review.",
      accent: css.amber,
      bg: "rgba(239,159,39,0.10)",
      bd: "rgba(239,159,39,0.28)",
    };
  }

  if (allClosed) {
    return {
      tone: "between",
      title: "Cycle complete",
      detail: "Every round is closed. Archive this cycle or start a new one when the next recruiting season begins.",
      accent: css.textGray,
      bg: "rgba(107,114,128,0.08)",
      bd: "rgba(107,114,128,0.22)",
    };
  }

  const nextName = nextRound?.name || nextDraft?.name;
  if (lastClosed && nextName) {
    return {
      tone: "between",
      title: "Between rounds",
      detail: `${lastClosed.name} is closed. Activate ${nextName} in Cycle Management when you're ready to continue.`,
      accent: css.amber,
      bg: "rgba(239,159,39,0.10)",
      bd: "rgba(239,159,39,0.28)",
    };
  }

  return {
    tone: "between",
    title: "Between rounds",
    detail: "No round is active right now. Open Cycle Management to activate the next round.",
    accent: css.amber,
    bg: "rgba(239,159,39,0.10)",
    bd: "rgba(239,159,39,0.28)",
  };
}

export function RoundTimeline({ rounds, activeRound, nextRound }) {
  const sorted = [...(rounds || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const phase = getRoundPhaseMessage({ rounds: sorted, activeRound, nextRound });

  if (!sorted.length) {
    return (
      <div style={{ fontSize: 13, color: css.textGray }}>{phase.detail}</div>
    );
  }

  return (
    <div style={{
      background: css.cardWhite,
      border: `1px solid ${css.borderLight}`,
      borderRadius: 12,
      padding: "18px 20px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
    }}
    >
      <div style={{
        background: phase.bg || "rgba(29,158,117,0.08)",
        border: `1px solid ${phase.bd || css.borderLight}`,
        borderRadius: 10,
        padding: "14px 16px",
        marginBottom: 18,
      }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: phase.accent || css.greenDark }}>
          {phase.title}
        </div>
        <div style={{ fontSize: 13, color: css.textGray, marginTop: 6, lineHeight: 1.5 }}>
          {phase.detail}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {sorted.map((round, index) => {
          const status = round.status || "draft";
          const style = ROUND_STATUS_STYLE[status] || ROUND_STATUS_STYLE.draft;
          const isCurrent = activeRound?.id === round.id;

          return (
            <div key={round.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                background: isCurrent ? style.bg : css.cardWhite,
                border: `2px solid ${isCurrent ? style.color : style.bd}`,
                borderRadius: 10,
                padding: "10px 14px",
                minWidth: 0,
                boxShadow: isCurrent ? `0 0 0 3px ${style.bg}` : "none",
              }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: style.color, fontSize: 11, fontWeight: 800 }}>{style.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: isCurrent ? 700 : 600, color: css.textDark }}>
                      {round.name || formatRoundKind(round.type)}
                      {isCurrent ? (
                        <span style={{
                          marginLeft: 8,
                          fontSize: 10,
                          fontWeight: 800,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: style.color,
                        }}
                        >
                          You are here
                        </span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 11, color: css.textGray, marginTop: 2 }}>
                      {formatRoundKind(round.type)} · {style.label}
                    </div>
                  </div>
                </div>
              </div>
              {index < sorted.length - 1 ? (
                <span style={{
                  color: sorted[index + 1]?.status === "draft" && status === "closed" ? css.amber : css.textGray,
                  fontSize: 16,
                  fontWeight: 700,
                  padding: "0 2px",
                }}
                >
                  →
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function QuickActionGrid({ actions, onNavigate }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
      {actions.map((action) => (
        <button
          key={action.path}
          type="button"
          onClick={() => onNavigate(action.path)}
          style={{
            background: css.cardWhite,
            border: `1px solid ${css.borderLight}`,
            borderRadius: 10,
            padding: "14px 16px",
            cursor: "pointer",
            textAlign: "left",
            fontFamily: "'DM Sans', sans-serif",
            transition: "border-color 0.15s",
          }}
        >
          <div style={{ fontSize: 18, marginBottom: 6 }}>{action.icon}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: css.textDark }}>{action.label}</div>
        </button>
      ))}
    </div>
  );
}

export function Panel({ title, children, style }) {
  return (
    <section style={{ marginBottom: 28, ...style }}>
      {title ? <h2 style={sectionTitleStyle}>{title}</h2> : null}
      {children}
    </section>
  );
}

export function PrimaryButton({ label, onClick, disabled, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        padding: "15px 16px",
        background: disabled ? "#9CA3AF" : css.greenDark,
        color: "#FFF",
        border: "none",
        borderRadius: 10,
        fontSize: 15,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        boxShadow: disabled ? "none" : "0 4px 14px rgba(40, 98, 65, 0.25)",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

export function GraderProgressRows({ graders, expectedReviews }) {
  if (!graders?.length) {
    return <div style={{ fontSize: 13, color: css.textGray }}>No grader data yet.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {graders.map((grader) => {
        const pct = expectedReviews > 0
          ? Math.min(100, Math.round((grader.reviewCount / expectedReviews) * 100))
          : 0;
        return (
          <div key={grader.id} style={{
            background: css.cardWhite,
            border: `1px solid ${css.borderLight}`,
            borderRadius: 10,
            padding: "12px 14px",
          }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: css.textDark }}>{grader.name}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: css.greenDark }}>
                {grader.reviewCount} / {expectedReviews}
              </span>
            </div>
            <ProgressBar pct={pct} />
          </div>
        );
      })}
    </div>
  );
}

export function YearBreakdown({ items, total }) {
  if (!items?.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map(({ label, count }) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={label}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: css.textDark }}>{label}</span>
              <span style={{ fontWeight: 700, color: css.textGray }}>{count} ({pct}%)</span>
            </div>
            <ProgressBar pct={pct} color="#1D9E75" />
          </div>
        );
      })}
    </div>
  );
}
