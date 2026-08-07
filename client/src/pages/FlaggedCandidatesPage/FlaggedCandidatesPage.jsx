import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthedFetch } from "../../auth/AuthContext";
import { css } from "../../theme/colors";
import Topbar from "../../components/Topbar/Topbar";
import { API } from "../../constants/config";
import { pageTitleStyle, sansFont } from "../../theme/typography";
import { formatDate, getInitials } from "../../utils/format";
const cardMint = "#1D9E75";

const SIGNAL_MODES = [
  {
    id: "flags",
    label: "Flags",
    endpoint: "candidate-flags",
    dataKey: "flags",
    eyebrow: "Admin queue",
    heading: "Flagged ",
    headingAccent: "candidates",
    description: "Open flags that need an admin decision — use Refresh to reload the queue after changes elsewhere.",
    emptyLabel: "No open candidate flags.",
    statLabels: ["OPEN FLAGS", "FLAGGED CANDIDATES"],
    countSuffix: "open",
  },
  {
    id: "referrals",
    label: "Referrals",
    endpoint: "candidate-referrals",
    dataKey: "referrals",
    eyebrow: "Admin queue",
    heading: "Referred ",
    headingAccent: "candidates",
    description: "Candidates referred by the team — use Refresh to reload the list after changes elsewhere.",
    emptyLabel: "No candidate referrals yet.",
    statLabels: ["REFERRALS", "REFERRED CANDIDATES"],
    countSuffix: "total",
  },
];

function FlagCard({ flag, onResolve, resolving }) {
  const candidate = flag.candidate || {};
  const flaggedBy = flag.flaggedBy?.name || flag.flaggedBy?.email || "Unknown reviewer";

  return (
    <div style={{ background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 10, padding: 20, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18 }}>
        <div style={{ display: "flex", gap: 14, minWidth: 0 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: css.greenDark, color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 500, fontSize: 15, letterSpacing: "0.02em", flexShrink: 0 }}>
            {getInitials(candidate.name)}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: sansFont, fontSize: 16, color: "#111", margin: "0 0 4px", fontWeight: 500 }}>
              {candidate.name || "Unknown candidate"}
            </p>
            <p style={{ fontSize: 13, color: css.textGray, margin: 0 }}>
              {[candidate.major, candidate.year, candidate.gpa ? `GPA ${candidate.gpa}` : ""].filter(Boolean).join(" · ") || "No profile details"}
            </p>
          </div>
        </div>

        <span style={{ background: "rgba(239,159,39,0.12)", color: css.amber, border: "1px solid rgba(239,159,39,0.28)", borderRadius: 999, fontSize: 11, fontWeight: 700, padding: "5px 10px", letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
          Open Flag
        </span>
      </div>

      <div style={{ marginTop: 18, padding: "14px 16px", background: "#FFFBF3", border: "1px solid rgba(239,159,39,0.24)", borderRadius: 10 }}>
        <p style={{ margin: "0 0 6px", fontSize: 10, color: css.amber, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Flag Reason
        </p>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: css.textDark }}>
          {flag.reason || "No reason provided."}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 16 }}>
        <div style={detailBoxStyle}>
          <span style={detailLabelStyle}>Email</span>
          <span style={detailValueStyle}>{candidate.email || "Not provided"}</span>
        </div>
        <div style={detailBoxStyle}>
          <span style={detailLabelStyle}>Flagged By</span>
          <span style={detailValueStyle}>{flaggedBy}</span>
        </div>
        <div style={detailBoxStyle}>
          <span style={detailLabelStyle}>Flagged At</span>
          <span style={detailValueStyle}>{formatDate(flag.createdAt, { fallback: "Unknown", style: "compact" })}</span>
        </div>
      </div>

      {candidate.extenuatingCircumstances && (
        <div style={{ marginTop: 14, fontSize: 12, color: css.textGray, lineHeight: 1.5 }}>
          <strong style={{ color: css.textDark }}>Extenuating circumstances:</strong> {candidate.extenuatingCircumstances}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 18, borderTop: `1px solid ${css.borderLight}`, paddingTop: 14 }}>
        <div style={{ fontSize: 12, color: css.textGray }}>
          Resume: <span style={{ color: css.textDark, fontWeight: 700 }}>{flag.resume?.name || candidate.name || "Unknown"}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {flag.resume?.fileUrl && (
            <a
              href={flag.resume.fileUrl}
              target="_blank"
              rel="noreferrer"
              style={{ ...buttonStyle, background: "#FFF", color: "#333", border: `1px solid ${css.borderLight}`, textDecoration: "none" }}
            >
              Open Resume
            </a>
          )}
          <button
            type="button"
            onClick={() => onResolve(flag.id)}
            disabled={resolving}
            style={{ ...buttonStyle, background: css.greenDark, color: "#FFF", border: "none", opacity: resolving ? 0.7 : 1 }}
          >
            {resolving ? "Resolving..." : "Resolve Flag"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReferralCard({ referral }) {
  const candidate = referral.candidate || {};
  const referredBy = referral.referredBy?.name || referral.referredBy?.email || "Unknown reviewer";

  return (
    <div style={{ background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 10, padding: 20, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18 }}>
        <div style={{ display: "flex", gap: 14, minWidth: 0 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: css.greenDark, color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 500, fontSize: 15, letterSpacing: "0.02em", flexShrink: 0 }}>
            {getInitials(candidate.name)}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: sansFont, fontSize: 16, color: "#111", margin: "0 0 4px", fontWeight: 500 }}>
              {candidate.name || "Unknown candidate"}
            </p>
            <p style={{ fontSize: 13, color: css.textGray, margin: 0 }}>
              {[candidate.major, candidate.year, candidate.gpa ? `GPA ${candidate.gpa}` : ""].filter(Boolean).join(" · ") || "No profile details"}
            </p>
          </div>
        </div>

        <span style={{ background: "rgba(40,98,65,0.1)", color: css.greenDark, border: "1px solid rgba(40,98,65,0.24)", borderRadius: 999, fontSize: 11, fontWeight: 700, padding: "5px 10px", letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
          Referral
        </span>
      </div>

      <div style={{ marginTop: 18, padding: "14px 16px", background: "#F8FBF6", border: "1px solid rgba(40,98,65,0.18)", borderRadius: 10 }}>
        <p style={{ margin: "0 0 6px", fontSize: 10, color: css.greenDark, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Referral Note
        </p>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: css.textDark }}>
          {referral.note || "No note provided."}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 16 }}>
        <div style={detailBoxStyle}>
          <span style={detailLabelStyle}>Email</span>
          <span style={detailValueStyle}>{candidate.email || "Not provided"}</span>
        </div>
        <div style={detailBoxStyle}>
          <span style={detailLabelStyle}>Referred By</span>
          <span style={detailValueStyle}>{referredBy}</span>
        </div>
        <div style={detailBoxStyle}>
          <span style={detailLabelStyle}>Referred At</span>
          <span style={detailValueStyle}>{formatDate(referral.createdAt, { fallback: "Unknown", style: "compact" })}</span>
        </div>
      </div>

      {candidate.extenuatingCircumstances && (
        <div style={{ marginTop: 14, fontSize: 12, color: css.textGray, lineHeight: 1.5 }}>
          <strong style={{ color: css.textDark }}>Extenuating circumstances:</strong> {candidate.extenuatingCircumstances}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 18, borderTop: `1px solid ${css.borderLight}`, paddingTop: 14 }}>
        <div style={{ fontSize: 12, color: css.textGray }}>
          Resume: <span style={{ color: css.textDark, fontWeight: 700 }}>{referral.resume?.name || candidate.name || "Unknown"}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {referral.resume?.fileUrl && (
            <a
              href={referral.resume.fileUrl}
              target="_blank"
              rel="noreferrer"
              style={{ ...buttonStyle, background: "#FFF", color: "#333", border: `1px solid ${css.borderLight}`, textDecoration: "none" }}
            >
              Open Resume
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FlaggedCandidatesPage() {
  const authedFetch = useAuthedFetch();
  const [mode, setMode] = useState(SIGNAL_MODES[0].id);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resolvingId, setResolvingId] = useState(null);

  const activeMode = useMemo(
    () => SIGNAL_MODES.find(m => m.id === mode) ?? SIGNAL_MODES[0],
    [mode]
  );

  const loadItems = useCallback(async (targetMode) => {
    try {
      setLoading(true);
      setError("");
      const res = await authedFetch(`${API}/${targetMode.endpoint}`);
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || `Failed to load ${targetMode.label.toLowerCase()}`);
      }

      setItems(json[targetMode.dataKey] || []);
    } catch (err) {
      console.error(`Failed to load ${targetMode.label.toLowerCase()}:`, err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    loadItems(activeMode);
  }, [loadItems, activeMode]);

  function handleModeChange(nextMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setItems([]);
    setError("");
  }

  const uniqueCandidateCount = useMemo(
    () => new Set(items.map(item => item.candidateId).filter(Boolean)).size,
    [items]
  );

  async function resolveFlag(flagId) {
    try {
      setResolvingId(flagId);
      const res = await authedFetch(`${API}/candidate-flags/${flagId}/resolve`, {
        method: "PATCH",
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || "Failed to resolve flag");
      }

      setItems(current => current.filter(item => item.id !== flagId));
    } catch (err) {
      console.error("Failed to resolve candidate flag:", err);
      setError(err.message);
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: css.bgLight, color: css.textDark, fontFamily: "'DM Sans', sans-serif", fontSize: 13, overflow: "auto" }}>
      <Topbar phaseLabel={`Admin · ${activeMode.label}`} activeLabel="Open queue" rightSlot={<></>} />

      <div style={{ flex: 1, padding: "14px 22px 32px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", display: "flex", gap: 8 }}>
        {SIGNAL_MODES.map(m => {
          const active = m.id === mode;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => handleModeChange(m.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                cursor: "pointer",
                padding: "9px 18px",
                borderRadius: 8,
                background: active ? css.greenDark : css.cardWhite,
                color: active ? "#FFF" : css.textDark,
                border: `1px solid ${active ? css.greenDark : css.borderLight}`,
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "'DM Sans', sans-serif",
                boxShadow: active ? "0 2px 12px rgba(40, 98, 65, 0.1)" : "0 1px 2px rgba(0,0,0,0.04)",
                transition: "border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, color 0.15s ease",
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
        <div style={{ maxWidth: 640, flex: "1 1 260px", minWidth: 0 }}>
          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: css.greenDark }}>
            Spring 2025 · {activeMode.eyebrow}
          </p>
          <div style={{ display: "flex", alignItems: "stretch", gap: 14 }}>
            <div style={{ width: 4, borderRadius: 4, background: `linear-gradient(180deg, ${css.greenDark} 0%, ${cardMint} 100%)`, flexShrink: 0 }} aria-hidden />
            <div style={{ minWidth: 0 }}>
              <h1 style={pageTitleStyle}>{activeMode.heading}{activeMode.headingAccent}</h1>
              <p style={{ margin: "10px 0 0", fontSize: 14, color: css.textGray, lineHeight: 1.45 }}>
                {activeMode.description}
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", flexShrink: 0, marginLeft: "auto" }}>
          <button
            type="button"
            onClick={() => loadItems(activeMode)}
            disabled={loading}
            aria-label={`Refresh ${activeMode.label.toLowerCase()} list`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              cursor: loading ? "wait" : "pointer",
              padding: "10px 16px",
              borderRadius: 8,
              background: css.cardWhite,
              color: css.textDark,
              border: `1px solid ${css.borderLight}`,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              opacity: loading ? 0.75 : 1,
            }}
          >
            <span style={{ display: "inline-flex", color: css.greenDark }} aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-.2-7.98L23 10" /></svg>
            </span>
            Refresh
          </button>
          {items.length > 0 && (
            <span style={{ background: "rgba(40, 98, 65, 0.1)", color: css.greenDark, borderRadius: 20, fontSize: 11, fontWeight: 700, padding: "6px 12px" }}>
              {items.length} {activeMode.countSuffix}
            </span>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 10, display: "grid", gridTemplateColumns: "1fr 1fr", padding: "18px 20px", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
        {[
          [activeMode.statLabels[0], items.length],
          [activeMode.statLabels[1], uniqueCandidateCount],
        ].map(([label, value], index) => (
          <div key={label} style={{ borderRight: index === 0 ? `1px solid ${css.borderLight}` : "none", padding: index ? "4px 0 4px 24px" : "4px 0" }}>
            <div style={{ fontSize: 24, fontFamily: "'DM Sans', sans-serif", color: css.textDark, lineHeight: 1.1, fontWeight: 700 }}>{value}</div>
            <div style={{ fontSize: 10, color: css.textGray, fontWeight: 700, letterSpacing: "0.06em", marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "0 0 48px", maxWidth: 1200, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
        {loading && <div style={{ padding: 40, textAlign: "center", color: css.textGray }}>Loading {activeMode.label.toLowerCase()}...</div>}

        {!loading && error && (
          <div style={{ padding: 16, border: `1px solid rgba(226,75,74,0.24)`, background: "rgba(226,75,74,0.08)", color: css.red, borderRadius: 10, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
            {error}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div style={{ padding: 48, textAlign: "center", background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 10, color: css.textGray, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
            <div style={{ width: 44, height: 44, background: "rgba(40, 98, 65, 0.1)", color: css.greenDark, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontWeight: 700, fontSize: 18 }}>
              ✓
            </div>
            {activeMode.emptyLabel}
          </div>
        )}

        {!loading && mode === "flags" && items.map(flag => (
          <FlagCard
            key={flag.id}
            flag={flag}
            onResolve={resolveFlag}
            resolving={resolvingId === flag.id}
          />
        ))}

        {!loading && mode === "referrals" && items.map(referral => (
          <ReferralCard key={referral.id} referral={referral} />
        ))}
      </div>
      </div>
    </div>
  );
}

const detailBoxStyle = {
  background: "#F8FAF6",
  border: `1px solid ${css.borderLight}`,
  borderRadius: 8,
  padding: "10px 12px",
  minWidth: 0,
};

const detailLabelStyle = {
  display: "block",
  fontSize: 10,
  color: css.textGray,
  fontWeight: 700,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  marginBottom: 4,
};

const detailValueStyle = {
  display: "block",
  fontSize: 12,
  color: css.textDark,
  fontWeight: 700,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const buttonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 16px",
  borderRadius: 4,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif",
};
