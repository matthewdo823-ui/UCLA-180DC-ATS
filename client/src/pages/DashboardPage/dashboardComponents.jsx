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

const ROUND_STATUS_ICON = {
  active: "●",
  closed: "✓",
  draft: "○",
};

const ROUND_STATUS_COLOR = {
  active: css.green,
  closed: css.textGray,
  draft: css.amber,
};

export function RoundTimeline({ rounds }) {
  if (!rounds?.length) {
    return (
      <div style={{ fontSize: 13, color: css.textGray }}>No rounds configured for this cycle.</div>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      {rounds.map((round, index) => {
        const status = round.status || "draft";
        return (
          <div key={round.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              background: css.cardWhite,
              border: `1px solid ${status === "active" ? "rgba(29,158,117,0.35)" : css.borderLight}`,
              borderRadius: 999,
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 600,
              color: css.textDark,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
            >
              <span style={{ color: ROUND_STATUS_COLOR[status] || css.textGray, fontSize: 10 }}>
                {ROUND_STATUS_ICON[status] || "○"}
              </span>
              <span>{round.name || formatRoundKind(round.type)}</span>
              <span style={{
                fontSize: 10,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: ROUND_STATUS_COLOR[status] || css.textGray,
              }}
              >
                {status}
              </span>
            </div>
            {index < rounds.length - 1 ? (
              <span style={{ color: css.textGray, fontSize: 14 }}>→</span>
            ) : null}
          </div>
        );
      })}
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
