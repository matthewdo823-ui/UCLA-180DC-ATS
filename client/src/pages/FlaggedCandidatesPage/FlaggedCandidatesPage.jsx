import { useEffect, useMemo, useState } from "react";
import { useAuthedFetch } from "../../auth/AuthContext";
import { css } from "../../theme/colors";

const API = "http://localhost:3000";
const serifFont = "Georgia, 'Times New Roman', serif";
const cardGreen = "#085041";
const cardMint = "#1D9E75";
const cardPale = "#EAF3DE";

function getInitials(name) {
  if (!name) return "??";
  return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
}

function formatDate(value) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function FlagCard({ flag, onResolve, resolving }) {
  const candidate = flag.candidate || {};
  const flaggedBy = flag.flaggedBy?.name || flag.flaggedBy?.email || "Unknown reviewer";

  return (
    <div style={{ background: "#FFF", border: "1px solid #E4E0D9", borderRadius: 14, padding: 20, boxShadow: "0 10px 30px rgba(17,24,39,0.04)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18 }}>
        <div style={{ display: "flex", gap: 14, minWidth: 0 }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: cardGreen, color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 }}>
            {getInitials(candidate.name)}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: serifFont, fontSize: 20, color: "#111", margin: "0 0 4px", fontWeight: 600 }}>
              {candidate.name || "Unknown candidate"}
            </p>
            <p style={{ fontSize: 13, color: css.textGray, margin: 0 }}>
              {[candidate.major, candidate.year, candidate.gpa ? `GPA ${candidate.gpa}` : ""].filter(Boolean).join(" · ") || "No profile details"}
            </p>
          </div>
        </div>

        <span style={{ background: "rgba(239,159,39,0.12)", color: css.amber, border: "1px solid rgba(239,159,39,0.28)", borderRadius: 999, fontSize: 11, fontWeight: 800, padding: "5px 10px", letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
          Open Flag
        </span>
      </div>

      <div style={{ marginTop: 18, padding: "14px 16px", background: "#FFFBF3", border: "1px solid rgba(239,159,39,0.24)", borderRadius: 10 }}>
        <p style={{ margin: "0 0 6px", fontSize: 10, color: css.amber, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>
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
          <span style={detailValueStyle}>{formatDate(flag.createdAt)}</span>
        </div>
      </div>

      {candidate.extenuatingCircumstances && (
        <div style={{ marginTop: 14, fontSize: 12, color: css.textGray, lineHeight: 1.5 }}>
          <strong style={{ color: css.textDark }}>Extenuating circumstances:</strong> {candidate.extenuatingCircumstances}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 18, borderTop: "1px solid #EAEAEA", paddingTop: 14 }}>
        <div style={{ fontSize: 12, color: css.textGray }}>
          Resume: <span style={{ color: css.textDark, fontWeight: 700 }}>{flag.resume?.name || candidate.name || "Unknown"}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {flag.resume?.fileUrl && (
            <a
              href={flag.resume.fileUrl}
              target="_blank"
              rel="noreferrer"
              style={{ ...buttonStyle, background: "#FFF", color: css.textDark, border: `1px solid ${css.borderLight}`, textDecoration: "none" }}
            >
              Open Resume
            </a>
          )}
          <button
            type="button"
            onClick={() => onResolve(flag.id)}
            disabled={resolving}
            style={{ ...buttonStyle, background: cardGreen, color: "#FFF", border: "none", opacity: resolving ? 0.7 : 1 }}
          >
            {resolving ? "Resolving..." : "Resolve Flag"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FlaggedCandidatesPage() {
  const authedFetch = useAuthedFetch();
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resolvingId, setResolvingId] = useState(null);

  useEffect(() => {
    async function fetchFlags() {
      try {
        setLoading(true);
        setError("");
        const res = await authedFetch(`${API}/candidate-flags`);
        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(json.error || "Failed to load flagged candidates");
        }

        setFlags(json.flags || []);
      } catch (err) {
        console.error("Failed to load candidate flags:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchFlags();
  }, [authedFetch]);

  const uniqueCandidateCount = useMemo(
    () => new Set(flags.map(flag => flag.candidateId).filter(Boolean)).size,
    [flags]
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

      setFlags(current => current.filter(flag => flag.id !== flagId));
    } catch (err) {
      console.error("Failed to resolve candidate flag:", err);
      setError(err.message);
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FCFBFA", fontFamily: "'DM Sans', sans-serif", color: css.textDark }}>
      <div style={{ height: 64, background: css.greenDark, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", color: "#FFF" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, background: "rgba(255,255,255,0.15)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: cardPale, fontWeight: 800 }}>
            ⚑
          </div>
          <span style={{ fontSize: 16, fontWeight: 500, fontFamily: serifFont }}>Resume Screener</span>
          <span style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", fontFamily: serifFont }}>›</span>
          <span style={{ fontSize: 16, fontWeight: 600, fontFamily: serifFont }}>Flagged Candidates</span>
        </div>
      </div>

      <div style={{ padding: "40px 48px 28px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24 }}>
        <div>
          <h1 style={{ fontFamily: serifFont, fontSize: 32, margin: "0 0 8px", color: "#111", fontWeight: 500 }}>Flagged Candidates</h1>
          <div style={{ fontSize: 15, color: "#666" }}>Open admin review queue for candidate flags</div>
        </div>
      </div>

      <div style={{ background: "#F2EFEB", borderTop: "1px solid #E4E0D9", borderBottom: "1px solid #E4E0D9", display: "grid", gridTemplateColumns: "1fr 1fr", padding: "20px 48px" }}>
        {[
          ["OPEN FLAGS", flags.length],
          ["FLAGGED CANDIDATES", uniqueCandidateCount],
        ].map(([label, value], index) => (
          <div key={label} style={{ borderRight: index === 0 ? "1px solid #E4E0D9" : "none", padding: index ? "4px 0 4px 32px" : "4px 0" }}>
            <div style={{ fontSize: 28, fontFamily: serifFont, color: "#111", lineHeight: 1.1 }}>{value}</div>
            <div style={{ fontSize: 11, color: "#777", fontWeight: 600, letterSpacing: "0.05em", marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "28px 48px 60px", maxWidth: 1080, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        {loading && <div style={{ padding: 40, textAlign: "center", color: css.textGray }}>Loading flagged candidates...</div>}

        {!loading && error && (
          <div style={{ padding: 16, border: `1px solid rgba(226,75,74,0.24)`, background: "rgba(226,75,74,0.08)", color: css.red, borderRadius: 10 }}>
            {error}
          </div>
        )}

        {!loading && !error && flags.length === 0 && (
          <div style={{ padding: 48, textAlign: "center", background: "#FFF", border: "1px solid #E4E0D9", borderRadius: 14, color: css.textGray }}>
            <div style={{ width: 46, height: 46, background: "rgba(29,158,117,0.1)", color: cardMint, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontWeight: 800 }}>
              ✓
            </div>
            No open candidate flags.
          </div>
        )}

        {!loading && flags.map(flag => (
          <FlagCard
            key={flag.id}
            flag={flag}
            onResolve={resolveFlag}
            resolving={resolvingId === flag.id}
          />
        ))}
      </div>
    </div>
  );
}

const detailBoxStyle = {
  background: "#F8FAF6",
  border: "1px solid #E3E8DD",
  borderRadius: 8,
  padding: "10px 12px",
  minWidth: 0,
};

const detailLabelStyle = {
  display: "block",
  fontSize: 10,
  color: css.textGray,
  fontWeight: 800,
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
  padding: "8px 14px",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};
