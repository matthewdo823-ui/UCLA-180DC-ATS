import { css } from "../../theme/colors";
import { formatRoundKind } from "../../constants/rounds";
import { formatReviewCountPair } from "../../utils/reviewCounts";

export const pageStyle = {
  minHeight: "100%",
  background: css.bgLight,
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

export function StatCard({ label, value, sub, accent, hero, textValue }) {
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
        // Text values (e.g. a round name) get a smaller size so they sit on one
        // or two tidy lines instead of the oversized numeric treatment.
        fontSize: textValue ? 20 : (hero ? 32 : 28),
        fontWeight: 700,
        color: accent || css.greenDark,
        lineHeight: textValue ? 1.25 : 1,
        wordBreak: "break-word",
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

function StackedBar({ segments, total }) {
  if (!total) {
    return (
      <div style={{
        height: 14,
        background: "var(--color-surface-muted)",
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
      background: "var(--color-surface-muted)",
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
  const resumeReviewed = pipeline.resumeReviewed || 0;
  const frqReviewed = pipeline.frqReviewed || 0;
  const resumeLeft = pipeline.resumeReviewsRemaining || 0;
  const frqLeft = pipeline.frqReviewsRemaining || 0;
  const resumeReviewPct = applicants > 0 ? Math.round((resumeReviewed / applicants) * 100) : 0;
  const frqReviewPct = applicants > 0 ? Math.round((frqReviewed / applicants) * 100) : 0;

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
  const breakdownTitle = isInterview ? "Evaluation outcomes" : "Decision outcomes";

  return (
    <div style={{
      background: css.cardWhite,
      border: `1px solid ${css.borderLight}`,
      borderRadius: 12,
      padding: "18px 20px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
    }}
    >
      {isInterview ? (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: css.textDark }}>Evaluation progress</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: css.greenDark }}>
              {reviewed} / {applicants} ({reviewPct}%)
            </span>
          </div>
          <ProgressBar pct={reviewPct} />
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 7 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: css.textDark }}>Resume review coverage</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: css.greenDark }}>{resumeReviewed} / {applicants} ({resumeReviewPct}%) · {resumeLeft} left</span>
            </div>
            <ProgressBar pct={resumeReviewPct} />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 7 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: css.textDark }}>Free response review coverage</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1D9E75" }}>{frqReviewed} / {applicants} ({frqReviewPct}%) · {frqLeft} left</span>
            </div>
            <ProgressBar pct={frqReviewPct} color="#1D9E75" />
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, fontWeight: 700, color: css.textGray, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
        {breakdownTitle}
      </div>
      <StackedBar segments={segments} total={breakdownTotal} />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${segments.length}, minmax(0, 1fr))`, gap: 8, marginTop: 14 }}>
        {segments.map((seg) => {
          const pct = breakdownTotal > 0 ? Math.round((seg.value / breakdownTotal) * 100) : 0;
          return (
            <div key={seg.label} style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: css.textGray }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: seg.color,
                    flexShrink: 0,
                  }}
                  />
                  {seg.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: css.textDark, marginTop: 5 }}>
                {seg.value}<span style={{ fontSize: 11, fontWeight: 600, color: css.textGray, marginLeft: 4 }}>{breakdownTotal > 0 ? `${pct}%` : ""}</span>
              </div>
            </div>
          );
        })}
      </div>
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
    <div style={{ height: 10, background: "var(--color-surface-muted)", borderRadius: 5, overflow: "hidden" }}>
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

export function ActionItemList({ items, onNavigate, limit }) {
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

  const visibleItems = limit ? items.slice(0, limit) : items;

  return (
    <div style={{ background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 12, overflow: "hidden" }}>
      {visibleItems.map((item, index) => {
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
              background: "transparent",
              border: "none",
              borderTop: index ? `1px solid ${css.borderLight}` : "none",
              padding: "14px 18px",
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: css.textDark }}>
                <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: style.color, flexShrink: 0 }} />
                {item.label}
              </div>
              {item.detail ? (
                <div style={{ fontSize: 12, color: css.textGray, marginTop: 4 }}>{item.detail}</div>
              ) : null}
            </div>
            {item.countLabel != null || item.count != null ? (
              <span style={{
                background: style.bg,
                color: style.color,
                border: `1px solid ${style.bd}`,
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 700,
                padding: "4px 12px",
                flexShrink: 0,
              }}
              >
                {item.countLabel ?? item.count}
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

function getRoundStageName(round) {
  const labels = {
    resume_screen: "Resume Screen",
    coffee_chat: "Coffee Chats",
    interview: "Coffee Chats",
    final_round: "Final Round",
  };

  return labels[round?.type] || round?.name || formatRoundKind(round?.type);
}

export function RoundTimeline({ rounds, activeRound, nextRound, cycleName, onManage }) {
  const sorted = [...(rounds || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const phase = getRoundPhaseMessage({ rounds: sorted, activeRound, nextRound });

  if (!sorted.length) {
    return (
      <div style={{ marginBottom: 28, padding: "28px 30px", borderRadius: 16, border: `1px solid ${phase.bd || css.borderLight}`, background: phase.bg || css.cardWhite }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: phase.accent || css.textDark, textTransform: "uppercase", letterSpacing: "0.09em" }}>Recruiting journey</div>
        <div style={{ marginTop: 8, fontSize: 26, fontWeight: 800, color: css.textDark }}>{phase.title}</div>
        <div style={{ marginTop: 7, fontSize: 14, color: css.textGray }}>{phase.detail}</div>
      </div>
    );
  }

  return (
    <div style={{
      marginBottom: 28,
      background: "linear-gradient(135deg, var(--color-surface) 0%, rgba(29, 158, 117, 0.055) 100%)",
      border: `1px solid ${css.borderLight}`,
      borderRadius: 16,
      padding: "28px 30px 30px",
      boxShadow: "0 4px 18px rgba(40, 98, 65, 0.06)",
    }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, marginBottom: 24 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: css.greenDark, textTransform: "uppercase", letterSpacing: "0.09em" }}>
            {cycleName ? `${cycleName} · recruiting journey` : "Recruiting journey"}
          </div>
          <div style={{ marginTop: 8, fontSize: 28, lineHeight: 1.15, fontWeight: 800, letterSpacing: "-0.025em", color: css.textDark }}>
            {activeRound ? `We are currently in ${getRoundStageName(activeRound)}` : phase.title}
          </div>
          <div style={{ marginTop: 8, maxWidth: 720, fontSize: 14, lineHeight: 1.5, color: css.textGray }}>{phase.detail}</div>
        </div>
        <button
          type="button"
          onClick={onManage}
          style={{ flexShrink: 0, border: `1px solid ${css.borderLight}`, borderRadius: 9, background: css.cardWhite, color: css.greenDark, padding: "10px 13px", cursor: "pointer", fontSize: 12, fontWeight: 800, fontFamily: "'DM Sans', sans-serif" }}
        >
          Manage cycle →
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${sorted.length}, minmax(0, 1fr))`, gap: 14, overflowX: "auto" }}>
        {sorted.map((round, index) => {
          const status = round.status || "draft";
          const style = ROUND_STATUS_STYLE[status] || ROUND_STATUS_STYLE.draft;
          const isCurrent = activeRound?.id === round.id;
          const StageElement = isCurrent ? "button" : "div";

          return (
            <StageElement
              key={round.id}
              type={isCurrent ? "button" : undefined}
              onClick={isCurrent ? onManage : undefined}
              aria-label={isCurrent ? `${getRoundStageName(round)} is the current stage. Open cycle management.` : undefined}
              style={{
                position: "relative",
                minWidth: 210,
                minHeight: 148,
                overflow: "hidden",
                textAlign: "left",
                background: isCurrent ? css.greenDark : css.cardWhite,
                border: `1px solid ${isCurrent ? css.greenDark : style.bd}`,
                borderRadius: 13,
                padding: "19px 20px",
                boxShadow: isCurrent ? "0 9px 24px rgba(40, 98, 65, 0.22)" : "0 1px 3px rgba(0,0,0,0.03)",
                cursor: isCurrent ? "pointer" : "default",
                color: isCurrent ? "#FFF" : css.textDark,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: isCurrent ? "rgba(255,255,255,0.72)" : style.color }}>
                  Stage {index + 1}
                </span>
                <span style={{ fontSize: 16, fontWeight: 800, color: isCurrent ? "#FFF" : style.color }}>{style.icon}</span>
              </div>
              <div style={{ marginTop: 22, fontSize: 21, lineHeight: 1.15, fontWeight: 800, letterSpacing: "-0.02em" }}>
                {getRoundStageName(round)}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: isCurrent ? "#FFF" : css.textGray }}>
                {isCurrent ? "You are here →" : style.label}
              </div>
              {index < sorted.length - 1 ? (
                <span aria-hidden="true" style={{ position: "absolute", right: 15, bottom: 13, fontSize: 22, fontWeight: 800, color: isCurrent ? "rgba(255,255,255,0.28)" : "rgba(107,114,128,0.24)" }}>→</span>
              ) : null}
            </StageElement>
          );
        })}
      </div>
    </div>
  );
}

export function Panel({ title, children, style, rightSlot }) {
  return (
    <section style={{ marginBottom: 28, ...style }}>
      {title || rightSlot ? (
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
          {title ? <h2 style={{ ...sectionTitleStyle, margin: 0 }}>{title}</h2> : <span />}
          {rightSlot}
        </div>
      ) : null}
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

export function GraderProgressRows({ graders, expectedReviews, expectedFrqReviews = 0 }) {
  if (!graders?.length) {
    return <div style={{ fontSize: 13, color: css.textGray }}>No grader data yet.</div>;
  }

  return (
    <div>
      {graders.map((grader, index) => {
        const resumeCount = grader.resumeReviewCount ?? grader.reviewCount ?? 0;
        const frqCount = grader.frqReviewCount || 0;
        const resumePct = expectedReviews > 0
          ? Math.min(100, Math.round((resumeCount / expectedReviews) * 100))
          : 0;
        const frqPct = expectedFrqReviews > 0
          ? Math.min(100, Math.round((frqCount / expectedFrqReviews) * 100))
          : 0;
        const showFrqProgress = grader.role === "admin" && expectedFrqReviews > 0;
        return (
          <div key={grader.id} style={{
            padding: "11px 0",
            borderTop: index ? `1px solid ${css.borderLight}` : "none",
          }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: css.textDark }}>{grader.name}</span>
              <span style={{ fontSize: 11, color: css.textGray }}>{formatReviewCountPair(resumeCount, frqCount)}</span>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4, fontSize: 11 }}>
                  <span style={{ color: css.textGray }}>Resume reviews</span>
                  <strong style={{ color: css.greenDark }}>{resumeCount} / {expectedReviews}</strong>
                </div>
                <ProgressBar pct={resumePct} />
              </div>
              {showFrqProgress ? (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4, fontSize: 11 }}>
                    <span style={{ color: css.textGray }}>Free response reviews</span>
                    <strong style={{ color: "#1D9E75" }}>{frqCount} / {expectedFrqReviews}</strong>
                  </div>
                  <ProgressBar pct={frqPct} color="#1D9E75" />
                </div>
              ) : null}
            </div>
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
