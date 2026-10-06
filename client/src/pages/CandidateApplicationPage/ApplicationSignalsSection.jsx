import { formatDate } from "../../utils/format";
import { css } from "../../theme/colors";
import SectionCard from "./components/SectionCard";

function memberLabel(person) {
  return person?.name || person?.email || "Unknown member";
}

function SignalItem({ icon, accent, accentBg, accentBorder, label, note, by, createdAt }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 8,
        background: accentBg,
        border: `1px solid ${accentBorder}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: note ? 8 : 0 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: accent,
          }}
        >
          {icon} {label}
        </span>
        <span style={{ fontSize: 11, color: css.textGray, whiteSpace: "nowrap" }}>
          {formatDate(createdAt, { fallback: "", style: "compact" })}
        </span>
      </div>
      {note ? (
        <p style={{ margin: "0 0 8px", fontSize: 13, lineHeight: 1.5, color: css.textDark }}>
          {note}
        </p>
      ) : null}
      <p style={{ margin: 0, fontSize: 11, color: css.textGray }}>
        {by}
      </p>
    </div>
  );
}

export default function ApplicationSignalsSection({ signals }) {
  const flags = signals?.flags ?? [];
  const referrals = signals?.referrals ?? [];
  if (!flags.length && !referrals.length) return null;

  return (
    <SectionCard title="Flags & referrals">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {flags.map((flag) => (
          <SignalItem
            key={flag.id}
            icon="⚑"
            accent="#B45309"
            accentBg="var(--color-warning-bg)"
            accentBorder="rgba(239,159,39,0.24)"
            label="Flag"
            note={flag.reason}
            by={memberLabel(flag.flaggedBy)}
            createdAt={flag.createdAt}
          />
        ))}
        {referrals.map((referral) => (
          <SignalItem
            key={referral.id}
            icon="★"
            accent={css.greenDark}
            accentBg="rgba(40,98,65,0.06)"
            accentBorder="rgba(40,98,65,0.18)"
            label="Referral"
            note={referral.note}
            by={memberLabel(referral.referredBy)}
            createdAt={referral.createdAt}
          />
        ))}
      </div>
    </SectionCard>
  );
}
