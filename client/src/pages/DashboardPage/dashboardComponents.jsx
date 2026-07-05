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

export function StatCard({ label, value, sub, accent, hero }) {
  return (
    <div style={{
      background: css.cardWhite,
      border: `1px solid ${css.borderLight}`,
      borderLeft: accent ? `4px solid ${accent}` : `4px solid ${css.greenDark}`,
      borderRadius: 12,
      padding: hero ? "20px 22px" : "18px 20px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
      minWidth: 0,
    }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: css.textGray, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{
        marginTop: 8,
        fontSize: hero ? 32 : 28,
        fontWeight: 700,
        color: accent || css.greenDark,
        lineHeight: 1,
      }}
      >
        {value}
      </div>
      {sub ? (
        <div style={{ marginTop: 6, fontSize: 12, color: css.textGray }}>{sub}</div>
      ) : null}
    </div>
  );
}

export function StatusBanner({ context, pipeline, graderSummary, actionItems }) {
  const chips = [];

  if (context?.activeRound) {
    chips.push({
      label: `${context.activeRound.name} active`,
      tone: "good",
    });
  } else if (context?.allRounds?.length) {
    chips.push({ label: "Between rounds", tone: "warn" });
  } else {
    chips.push({ label: "No rounds configured", tone: "neutral" });
  }

  const criticalCount = actionItems?.filter((item) => item.severity === "critical").length || 0;
  const warningCount = actionItems?.filter((item) => item.severity === "warning").length || 0;

  if (criticalCount > 0) {
    chips.push({ label: `${criticalCount} critical`, tone: "bad" });
  }
  if (warningCount > 0) {
    chips.push({ label: `${warningCount} warning${warningCount === 1 ? "" : "s"}`, tone: "warn" });
  }
  if (pipeline?.awaitingReviews > 0) {
    chips.push({ label: `${pipeline.awaitingReviews} awaiting review`, tone: "warn" });
  }
  if (pipeline?.undecidedCount > 0) {
    chips.push({ label: `${pipeline.undecidedCount} undecided`, tone: "warn" });
  }
  if (graderSummary?.behindCount > 0) {
    chips.push({
      label: `${graderSummary.behindCount} grader${graderSummary.behindCount === 1 ? "" : "s"} behind`,
      tone: "warn",
    });
  }

  const allClear = chips.length === 1 && chips[0].tone === "good";
  if (allClear) {
    chips.push({ label: "All clear", tone: "good" });
  }

  const CHIP_STYLE = {
    good: { bg: "rgba(29,158,117,0.10)", color: css.green, bd: "rgba(29,158,117,0.28)" },
    warn: { bg: "rgba(239,159,39,0.10)", color: css.amber, bd: "rgba(239,159,39,0.28)" },
    bad: { bg: "rgba(226,75,74,0.08)", color: css.red, bd: "rgba(226,75,74,0.22)" },
    neutral: { bg: "rgba(107,114,128,0.08)", color: css.textGray, bd: "rgba(107,114,128,0.22)" },
  };

  return (
    <div style={{
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 24,
      padding: "14px 18px",
      background: css.cardWhite,
      border: `1px solid ${css.borderLight}`,
      borderRadius: 12,
      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
    }}
    >
      {chips.map((chip) => {
        const style = CHIP_STYLE[chip.tone] || CHIP_STYLE.neutral;
        return (
          <span
            key={chip.label}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: style.bg,
              color: style.color,
              border: `1px solid ${style.bd}`,
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              padding: "5px 12px",
              letterSpacing: "0.01em",
            }}
          >
            <span style={{ fontSize: 8, lineHeight: 1 }}>●</span>
            {chip.label}
          </span>
        );
      })}
    </div>
  );
}

function StackedBar({ segments, total }) {
  if (!total) {
    return (
      <div style={{
        height: 14,
        background: "#F3F4F6",
        borderRadius: 7,
      }}
      />
    );
  }

  return (
    <div style={{
      display: "flex",
      height: 14,
      borderRadius: 7,
      overflow: "hidden",
      background: "#F3F4F6",
    }}
    >
      {segments.filter((seg) => seg.value > 0).map((seg) => (
        <div
          key={seg.label}
          title={`${seg.label}: ${seg.value}`}
          style={{
            width: `${(seg.value / total) * 100}%`,
            background: seg.color,
            minWidth: seg.value > 0 ? 4 : 0,
            transition: "width 0.35s ease",
          }}
        />
      ))}
    </div>
  );
}

export function PipelineBreakdown({ pipeline, isInterview }) {
  if (!pipeline) return null;

  const applicants = pipeline.applicants || 0;
  const reviewed = pipeline.reviewed || 0;
  const reviewPct = applicants > 0 ? Math.round((reviewed / applicants) * 100) : 0;

  const segments = isInterview
    ? [
        { label: "Pass", value: pipeline.pass || 0, color: css.green },
        { label: "Fail", value: pipeline.fail || 0, color: css.red },
        { label: "Hold", value: pipeline.hold || 0, color: css.amber },
        { label: "Pending", value: pipeline.pending || 0, color: "#9CA3AF" },
      ]
    : [
        { label: "Advanced", value: pipeline.advanced || 0, color: css.green },
        { label: "Hold", value: pipeline.hold || 0, color: css.amber },
        { label: "Rejected", value: pipeline.rejected || 0, color: css.red },
        { label: "Pending", value: pipeline.pending || 0, color: "#9CA3AF" },
      ];

  const breakdownTotal = segments.reduce((sum, seg) => sum + seg.value, 0);
  const breakdownTitle = isInterview ? "Evaluation outcomes" : "Deliberation outcomes";

  return (
    <div style={{
      background: css.cardWhite,
      border: `1px solid ${css.borderLight}`,
      borderRadius: 12,
      padding: "18px 20px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
    }}
    >
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: css.textDark }}>
            {isInterview ? "Evaluation progress" : "Review progress"}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: css.greenDark }}>
            {reviewed} / {applicants} ({reviewPct}%)
          </span>
        </div>
        <ProgressBar pct={reviewPct} />
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: css.textDark, marginBottom: 10 }}>
        {breakdownTitle}
      </div>
      <StackedBar segments={segments} total={breakdownTotal} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
        {segments.map((seg) => {
          const pct = breakdownTotal > 0 ? Math.round((seg.value / breakdownTotal) * 100) : 0;
          return (
            <div key={seg.label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, color: css.textDark }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: seg.color,
                    flexShrink: 0,
                  }}
                  />
                  {seg.label}
                </span>
                <span style={{ fontWeight: 700, color: css.textGray }}>
                  {seg.value} {breakdownTotal > 0 ? `(${pct}%)` : ""}
                </span>
              </div>
              <ProgressBar pct={breakdownTotal > 0 ? pct : 0} color={seg.color} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const QUICK_LINK_ICONS = {
  scoreboard: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="3" y1="9" x2="21" y2="9"></line>
      <line x1="9" y1="21" x2="9" y2="9"></line>
    </svg>
  ),
  graders: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>
  ),
  flags: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
      <line x1="4" y1="22" x2="4" y2="15"></line>
    </svg>
  ),
  cycles: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
  ),
  team: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
      <circle cx="12" cy="7" r="4"></circle>
    </svg>
  ),
  demographics: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path>
      <path d="M22 12A10 10 0 0 0 12 2v10z"></path>
    </svg>
  ),
};

export function CompactQuickLinks({ actions, onNavigate }) {
  return (
    <div style={{
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
      padding: "12px 14px",
      background: css.cardWhite,
      border: `1px solid ${css.borderLight}`,
      borderRadius: 12,
    }}
    >
      {actions.map((action) => (
        <button
          key={action.path}
          type="button"
          onClick={() => onNavigate(action.path)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "#F8FAFB",
            border: `1px solid ${css.borderLight}`,
            borderRadius: 999,
            padding: "8px 14px",
            cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            color: css.textDark,
          }}
        >
          <span style={{ color: css.greenDark, display: "flex" }}>
            {QUICK_LINK_ICONS[action.iconKey]}
          </span>
          {action.label}
        </button>
      ))}
    </div>
  );
}

export const twoColumnGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
  gap: 28,
  alignItems: "start",
};

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
