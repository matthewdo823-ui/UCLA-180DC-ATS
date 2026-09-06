import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthedFetch } from "../../auth/AuthContext";
import { readJsonOrThrow, STALE } from "../../lib/queryClient";
import { qk } from "../../lib/queryKeys";
import { css } from "../../theme/colors";
import Topbar from "../../components/Topbar/Topbar";
import ErrorBanner from "../../components/ErrorBanner/ErrorBanner";
import { formatResponseError } from "../../utils/errors";
import { API } from "../../constants/config";
import { pageTitleStyle, sansFont } from "../../theme/typography";
import { formatDate, getInitials } from "../../utils/format";
import { useActiveCycle } from "../../hooks/useActiveCycle";

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
    description: "Open referrals from the team that need an admin decision.",
    emptyLabel: "No open candidate referrals.",
    statLabels: ["OPEN REFERRALS", "REFERRED CANDIDATES"],
    countSuffix: "open",
  },
];

function CandidateNameButton({ candidate, resumeId, onOpenProfile }) {
  const canOpen = Boolean(resumeId);
  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={() => canOpen && onOpenProfile(resumeId)}
      title={canOpen ? `Open ${candidate.name || "candidate"} profile` : "No linked resume profile"}
      style={{ border: "none", background: "none", padding: 0, fontFamily: sansFont, fontSize: 16, color: "#111", margin: "0 0 4px", fontWeight: 500, textAlign: "left", cursor: canOpen ? "pointer" : "default", textDecoration: canOpen ? "underline" : "none", textDecorationColor: "rgba(40,98,65,0.35)", textUnderlineOffset: 3 }}
    >
      {candidate.name || "Unknown candidate"}
    </button>
  );
}

function FlagCard({ flag, onResolve, resolving, onOpenProfile }) {
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
            <CandidateNameButton candidate={candidate} resumeId={flag.resumeId || flag.resume?.id} onOpenProfile={onOpenProfile} />
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

function ReferralCard({ referral, onResolve, resolving, onOpenProfile }) {
  const candidate = referral.candidate || {};
  const referredBy = referral.referredBy?.name || referral.referredBy?.email || "Unknown reviewer";
  const resolutionAvailable = referral.resolutionAvailable !== false;

  return (
    <div style={{ background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 10, padding: 20, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18 }}>
        <div style={{ display: "flex", gap: 14, minWidth: 0 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: css.greenDark, color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 500, fontSize: 15, letterSpacing: "0.02em", flexShrink: 0 }}>
            {getInitials(candidate.name)}
          </div>
          <div style={{ minWidth: 0 }}>
            <CandidateNameButton candidate={candidate} resumeId={referral.resumeId || referral.resume?.id} onOpenProfile={onOpenProfile} />
            <p style={{ fontSize: 13, color: css.textGray, margin: 0 }}>
              {[candidate.major, candidate.year, candidate.gpa ? `GPA ${candidate.gpa}` : ""].filter(Boolean).join(" · ") || "No profile details"}
            </p>
          </div>
        </div>

        <span style={{ background: "rgba(40,98,65,0.1)", color: css.greenDark, border: "1px solid rgba(40,98,65,0.24)", borderRadius: 999, fontSize: 11, fontWeight: 700, padding: "5px 10px", letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
          Open Referral
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
          <button
            type="button"
            onClick={() => onResolve(referral.id)}
            disabled={resolving || !resolutionAvailable}
            title={resolutionAvailable ? "Resolve referral" : "Run server/sql/add_candidate_referral_resolution.sql first"}
            style={{ ...buttonStyle, background: css.greenDark, color: "#FFF", border: "none", opacity: resolving || !resolutionAvailable ? 0.55 : 1, cursor: resolving || !resolutionAvailable ? "not-allowed" : "pointer" }}
          >
            {resolving ? "Resolving..." : resolutionAvailable ? "Resolve Referral" : "Migration needed"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FlaggedCandidatesPage() {
  const location = useLocation();
  const authedFetch = useAuthedFetch();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { cycle } = useActiveCycle();
  const [mode, setMode] = useState(SIGNAL_MODES[0].id);
  // Kept apart from the query's own error so a failed resolve doesn't clobber the
  // loaded list (or get wiped by a background refetch).
  const [resolveError, setResolveError] = useState(null);
  const [resolvingId, setResolvingId] = useState(null);

  const activeMode = useMemo(
    () => SIGNAL_MODES.find(m => m.id === mode) ?? SIGNAL_MODES[0],
    [mode]
  );

  // Each mode keys its own cache entry, so toggling flags/referrals is instant
  // after the first load instead of refetching every time.
  const signalsQuery = useQuery({
    queryKey: qk.candidateSignals(activeMode.endpoint),
    queryFn: async () => {
      const res = await authedFetch(`${API}/${activeMode.endpoint}`);
      const json = await readJsonOrThrow(
        res,
        `loading ${activeMode.label.toLowerCase()}`,
        `Check GET /${activeMode.endpoint} in server/src/routes/candidateRoutes.js`
      );
      return json[activeMode.dataKey] || [];
    },
    staleTime: STALE.dashboard,
  });

  const items = useMemo(() => signalsQuery.data ?? [], [signalsQuery.data]);
  const loading = signalsQuery.isPending;
  const refreshing = signalsQuery.isFetching;
  const error = resolveError || signalsQuery.error;

  function handleModeChange(nextMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setResolveError(null);
  }

  const uniqueCandidateCount = useMemo(
    () => new Set(items.map(item => item.candidateId).filter(Boolean)).size,
    [items]
  );

  async function resolveSignal(signalId, signalMode = activeMode) {
    try {
      setResolvingId(signalId);
      setResolveError(null);
      const res = await authedFetch(`${API}/${signalMode.endpoint}/${signalId}/resolve`, {
        method: "PATCH",
      });

      if (!res.ok) {
        throw await formatResponseError(res, `resolving candidate ${signalMode.id === "flags" ? "flag" : "referral"}`);
      }

      // Drop the resolved signal from its cached open queue — snappy, no refetch.
      queryClient.setQueryData(
        qk.candidateSignals(signalMode.endpoint),
        (current) => (current ? current.filter(item => item.id !== signalId) : current)
      );
    } catch (err) {
      console.error("Failed to resolve candidate signal:", err);
      setResolveError(err);
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
            {cycle?.name || "Current cycle"} · {activeMode.eyebrow}
          </p>
          <div style={{ minWidth: 0 }}>
            <h1 style={pageTitleStyle}>{activeMode.heading}{activeMode.headingAccent}</h1>
            <p style={{ margin: "10px 0 0", fontSize: 14, color: css.textGray, lineHeight: 1.45 }}>
              {activeMode.description}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", flexShrink: 0, marginLeft: "auto" }}>
          <button
            type="button"
            onClick={() => signalsQuery.refetch()}
            disabled={refreshing}
            aria-label={`Refresh ${activeMode.label.toLowerCase()} list`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              cursor: refreshing ? "wait" : "pointer",
              padding: "10px 16px",
              borderRadius: 8,
              background: css.cardWhite,
              color: css.textDark,
              border: `1px solid ${css.borderLight}`,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              opacity: refreshing ? 0.75 : 1,
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
          <ErrorBanner
            error={error}
            onDismiss={resolveError ? () => setResolveError(null) : undefined}
            onRetry={signalsQuery.isError ? () => signalsQuery.refetch() : undefined}
          />
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
            onResolve={(id) => resolveSignal(id, SIGNAL_MODES[0])}
            resolving={resolvingId === flag.id}
            onOpenProfile={(resumeId) => navigate(`/candidates/${resumeId}`, { state: { returnTo: `${location.pathname}${location.search}`, returnLabel: "flags" } })}
          />
        ))}

        {!loading && mode === "referrals" && items.map(referral => (
          <ReferralCard
            key={referral.id}
            referral={referral}
            onResolve={(id) => resolveSignal(id, SIGNAL_MODES[1])}
            resolving={resolvingId === referral.id}
            onOpenProfile={(resumeId) => navigate(`/candidates/${resumeId}`, { state: { returnTo: `${location.pathname}${location.search}`, returnLabel: "referrals" } })}
          />
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
