import { useEffect, useMemo, useState } from "react";
import { useAuthedFetch } from "../../auth/AuthContext";
import { METRICS, MAX_SCORE } from "../../constants/config";
import { css } from "../../theme/colors";

const API = "http://localhost:3000";
const serifFont = "Georgia, 'Times New Roman', serif";
const cardGreen = "#085041";
const cardMint = "#1D9E75";
const cardPale = "#EAF3DE";
const cardLime = "#C0DD97";

function hasNumericScore(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function scoreColor(score) {
  if (!hasNumericScore(score)) return css.textGray;
  const numeric = Number(score);
  if (numeric >= 90) return css.greenDark;
  if (numeric >= 80) return "#4CAF50";
  if (numeric >= 70) return css.amber;
  return css.textGray;
}

function getInitials(name) {
  if (!name) return "??";
  return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
}

function getReviewerLabel(review, index) {
  return review?.reviewerName || review?.reviewerEmail || `Reviewer ${index + 1} not recorded`;
}

function getReviewerInitials(review, index) {
  if (review?.reviewerName) return getInitials(review.reviewerName);
  if (review?.reviewerEmail) return review.reviewerEmail.substring(0, 2).toUpperCase();
  return `R${index + 1}`;
}

function getReviewTotal(review) {
  if (Number.isFinite(Number(review?.score))) return Number(review.score);
  return Object.values(review?.scores ?? {}).reduce((total, value) => total + (Number(value) || 0), 0);
}

function titleCase(value) {
  if (!value) return "";
  return value.replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function formatScore(value) {
  if (!hasNumericScore(value)) return "N/A";
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : numeric.toFixed(1);
}

function normalizeMetricScore(candidate, metric) {
  const value = candidate?.categoryScores?.[metric];
  return hasNumericScore(value) ? Number(value) : null;
}

function getMaxScore(candidate) {
  return candidate?.maxScore ?? MAX_SCORE;
}

function getAggregateScore(candidate) {
  if (hasNumericScore(candidate?.aggregateScore)) {
    return Number(candidate.aggregateScore);
  }

  if (hasNumericScore(candidate?.score)) {
    return (Number(candidate.score) / 100) * getMaxScore(candidate);
  }

  return null;
}

function ReviewerStack({ reviews }) {
  const palette = [
    { bg: "#E8F1FF", color: "#24529A" },
    { bg: "#FFF2D8", color: "#9B5C00" },
    { bg: "#FCE5E5", color: "#9A2B2B" },
    { bg: "#E2F8EE", color: "#157253" },
  ];

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {reviews.slice(0, 4).map((review, index) => (
        <div
          key={review.id ?? index}
          title={`Review ${index + 1}`}
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: palette[index % palette.length].bg,
            color: palette[index % palette.length].color,
            border: "1.5px solid #FFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 8,
            fontWeight: 700,
            marginLeft: index ? -5 : 0,
          }}
        >
          {getReviewerInitials(review, index)}
        </div>
      ))}
    </div>
  );
}

function ScoreTiles({ score, maxScore }) {
  const filled = hasNumericScore(score) ? Math.round(Number(score)) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 2 }}>
      {Array.from({ length: maxScore }).map((_, index) => (
        <div
          key={index}
          style={{
            width: 9,
            height: 9,
            borderRadius: 2,
            background: index < filled ? cardMint : cardLime,
          }}
        />
      ))}
    </div>
  );
}

function CategoryRow({ metric, value }) {
  const pct = hasNumericScore(value) ? Math.max(0, Math.min(100, (Number(value) / 6) * 100)) : 0;

  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: css.textDark }}>{titleCase(metric)}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: cardGreen }}>
          {formatScore(value)} <span style={{ color: css.textGray, fontWeight: 400 }}>/ 6</span>
        </span>
      </div>
      <div style={{ height: 5, background: "#EEF1EC", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: cardMint, borderRadius: 3, transition: "width 0.35s ease" }} />
      </div>
    </div>
  );
}

function ScorecardModal({ candidate, onClose }) {
  const [reviewersOpen, setReviewersOpen] = useState(false);
  const aggregateScore = getAggregateScore(candidate);
  const maxScore = getMaxScore(candidate);
  const reviews = candidate?.reviews ?? [];
  const latestNote = [...reviews].reverse().find(review => review.notes)?.notes;

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!candidate) return null;

  return (
    <div
      className="scorecard-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${candidate.name} Round 1 scorecard`}
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        background: "rgba(17, 24, 39, 0.58)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div className="scorecard-shell" style={{ width: "min(440px, 100%)", position: "relative", perspective: 900 }}>
        <button
          aria-label="Close scorecard"
          onClick={onClose}
          style={{
            position: "absolute",
            right: -12,
            top: -12,
            width: 34,
            height: 34,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.75)",
            background: "#FFF",
            color: cardGreen,
            cursor: "pointer",
            fontSize: 22,
            lineHeight: "30px",
            boxShadow: "0 12px 28px rgba(0,0,0,0.18)",
            zIndex: 1,
          }}
        >
          ×
        </button>

        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: "#FFF", textAlign: "center", margin: "0 0 10px" }}>
          ROUND 1
        </p>

        <div style={{ borderRadius: 16, border: `2px solid ${cardGreen}`, overflow: "hidden", background: "#FFF", boxShadow: "0 24px 70px rgba(0,0,0,0.26)" }}>
          <div style={{ background: cardGreen, padding: "18px 18px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
              <span style={{ background: "#04342C", color: "#9FE1CB", fontSize: 10, fontWeight: 700, padding: "4px 9px", borderRadius: 20, letterSpacing: "0.04em" }}>
                ROUND 1 · RESUME
              </span>
              <span style={{ background: "rgba(255,255,255,0.1)", color: cardLime, fontSize: 10, fontWeight: 700, padding: "4px 9px", borderRadius: 20, border: `1px solid ${cardMint}` }}>
                ACTIVE
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: cardMint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700, color: cardPale, flexShrink: 0, border: "2px solid #5DCAA5" }}>
                {getInitials(candidate.name)}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ color: cardPale, fontSize: 18, fontFamily: serifFont, fontWeight: 600, margin: "0 0 3px", lineHeight: 1.15 }}>{candidate.name}</p>
                <p style={{ color: "#9FE1CB", fontSize: 12, margin: "0 0 2px" }}>{candidate.major || "Undeclared"}</p>
                <p style={{ color: "#5DCAA5", fontSize: 11, margin: 0 }}>
                  {[candidate.year, candidate.gpa ? `GPA ${candidate.gpa}` : ""].filter(Boolean).join(" · ") || candidate.email || "Candidate profile"}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
              {candidate.year && <span style={chipStyle}>{candidate.year}</span>}
              {candidate.gpa && <span style={chipStyle}>GPA {candidate.gpa}</span>}
              {candidate.gm && <span style={chipStyle}>GM {candidate.gm}</span>}
            </div>
          </div>

          <div style={{ background: cardPale, padding: "11px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #DCE7D2" }}>
            <div>
              <p style={{ fontSize: 10, color: "#3B6D11", margin: "0 0 2px", fontWeight: 800, letterSpacing: "0.05em" }}>AGGREGATE SCORE</p>
              <p style={{ fontSize: 30, fontWeight: 700, color: cardGreen, margin: 0, lineHeight: 1 }}>
                {formatScore(aggregateScore)} <span style={{ fontSize: 14, color: "#3B6D11" }}>/ {maxScore}</span>
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 10, color: "#3B6D11", margin: "0 0 6px", fontWeight: 800, letterSpacing: "0.05em" }}>{METRICS.length} CATEGORIES</p>
              <ScoreTiles score={aggregateScore} maxScore={maxScore} />
            </div>
          </div>

          <div style={{ padding: "14px 18px 4px" }}>
            <p style={{ fontSize: 10, color: css.textGray, letterSpacing: "0.06em", margin: "0 0 10px", fontWeight: 800 }}>CATEGORY BREAKDOWN</p>
            {METRICS.map(metric => (
              <CategoryRow key={metric} metric={metric} value={normalizeMetricScore(candidate, metric)} />
            ))}
          </div>

          {latestNote && (
            <div style={{ margin: "6px 18px 0", padding: "10px 12px", background: "#F8FAF6", border: "1px solid #E3E8DD", borderRadius: 8 }}>
              <p style={{ fontSize: 10, color: css.textGray, letterSpacing: "0.05em", margin: "0 0 5px", fontWeight: 800 }}>LATEST NOTE</p>
              <p style={{ fontSize: 12, lineHeight: 1.45, color: css.textDark, margin: 0 }}>{latestNote}</p>
            </div>
          )}

          <div style={{ padding: "12px 18px 18px", borderTop: "1px solid #EAEAEA", marginTop: 12 }}>
            <button
              onClick={() => setReviewersOpen(open => !open)}
              aria-expanded={reviewersOpen}
              style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", padding: 0 }}
            >
              <span style={{ fontSize: 11, color: css.textGray, fontWeight: 800, letterSpacing: "0.05em" }}>
                REVIEWS ({reviews.length})
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ReviewerStack reviews={reviews} />
                <span style={{ color: css.textGray, transform: reviewersOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>⌄</span>
              </div>
            </button>

            {reviewersOpen && (
              <div style={{ marginTop: 10 }}>
                {reviews.map((review, index) => (
                  <div key={review.id ?? index} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid #EAEAEA" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#E8F1FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#24529A", flexShrink: 0 }}>
                      {getReviewerInitials(review, index)}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 12, color: css.textDark, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{getReviewerLabel(review, index)}</p>
                      <p style={{ fontSize: 11, color: css.textGray, margin: 0 }}>
                        {review.submittedAt ? new Date(review.submittedAt).toLocaleDateString() : "Submitted"}
                      </p>
                    </div>
                    <div style={{ fontSize: 12, color: cardGreen, fontWeight: 800 }}>{formatScore(getReviewTotal(review))}/24</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const chipStyle = {
  background: "#04342C",
  color: "#9FE1CB",
  fontSize: 10,
  padding: "4px 9px",
  borderRadius: 20,
  fontWeight: 700,
};

export default function ScoreboardPage() {
  const authedFetch = useAuthedFetch();
  const [data, setData] = useState({ stats: null, candidates: [] });
  const [loading, setLoading] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  useEffect(() => {
    async function fetchScoreboard() {
      try {
        const res = await authedFetch(`${API}/scoreboard`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Failed to load scoreboard:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchScoreboard();
  }, [authedFetch]);

  const candidates = useMemo(() => data.candidates ?? [], [data.candidates]);

  return (
    <div style={{ minHeight: "100vh", background: "#FCFBFA", fontFamily: "'DM Sans', sans-serif", color: css.textDark }}>
      <div style={{ height: 64, background: css.greenDark, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", color: "#FFF" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, background: "rgba(255,255,255,0.15)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <span style={{ fontSize: 16, fontWeight: 500, fontFamily: serifFont }}>Resume Screener</span>
          <span style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", fontFamily: serifFont }}>›</span>
          <span style={{ fontSize: 16, fontWeight: 600, fontFamily: serifFont }}>Scoreboard</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.4)", color: "#FFF", padding: "6px 16px", borderRadius: 6, fontSize: 13, cursor: "pointer", fontWeight: 500 }}>Export CSV</button>
          <button style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.4)", color: "#FFF", padding: "6px 16px", borderRadius: 6, fontSize: 13, cursor: "pointer", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
            Filters
          </button>
          <button style={{ background: "#FFF", border: "none", color: css.textDark, width: 32, height: 32, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
          </button>
        </div>
      </div>

      <div style={{ padding: "40px 48px 32px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24 }}>
        <div>
          <h1 style={{ fontFamily: serifFont, fontSize: 32, margin: "0 0 8px 0", color: "#111", fontWeight: 500 }}>Candidate Scoreboard</h1>
          <div style={{ fontSize: 15, color: "#666" }}>Spring 2025 Cohort · Ranked by aggregate score</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button style={{ background: css.greenDark, color: "#FFF", border: "none", padding: "6px 16px", borderRadius: 4, fontSize: 13, cursor: "pointer" }}>All</button>
          <button style={filterButtonStyle}>Top Performers</button>
          <button style={filterButtonStyle}>Flagged</button>
          <button style={filterButtonStyle}>Pending</button>
        </div>
      </div>

      <div style={{ background: "#F2EFEB", borderTop: "1px solid #E4E0D9", borderBottom: "1px solid #E4E0D9", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", padding: "20px 48px" }}>
        {[
          ["APPLICANTS", data.stats?.applicants ?? "—"],
          ["REVIEWED", data.stats?.reviewed ?? "—"],
          ["ADVANCED", data.stats?.advanced ?? "—"],
          ["AVG SCORE", data.stats?.avgScore ?? "—"],
        ].map(([label, value], index) => (
          <div key={label} style={{ borderRight: index < 3 ? "1px solid #E4E0D9" : "none", padding: index ? "4px 0 4px 32px" : "4px 0" }}>
            <div style={{ fontSize: 28, fontFamily: serifFont, color: "#111", lineHeight: 1.1 }}>{value}</div>
            <div style={{ fontSize: 11, color: "#777", fontWeight: 600, letterSpacing: "0.05em", marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "0 48px 60px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "60px minmax(240px, 2fr) 1fr 220px", padding: "16px 0", borderBottom: "2px solid #E4E0D9", color: "#888", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em" }}>
          <div>#</div>
          <div>CANDIDATE</div>
          <div>SCORE</div>
          <div style={{ textAlign: "right" }}>ACTIONS</div>
        </div>

        {loading && <div style={{ padding: 40, textAlign: "center", color: css.textGray }}>Loading candidates...</div>}

        {!loading && candidates.map(c => (
          <div key={c.id} style={{ display: "grid", gridTemplateColumns: "60px minmax(240px, 2fr) 1fr 220px", padding: "20px 0", borderBottom: "1px solid #EAEAEA", alignItems: "center", background: "#FFF" }}>
            <div style={{ color: css.greenDark, fontWeight: 700, fontSize: 14 }}>{c.rank}</div>

            <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
              <div style={{ width: 44, height: 44, background: css.greenDark, color: "#FFF", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 500, fontSize: 15, letterSpacing: "0.02em", flexShrink: 0 }}>
                {getInitials(c.name)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 16, fontWeight: 500, fontFamily: serifFont, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                <span style={{ fontSize: 13, color: "#888", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {[c.major, c.year, c.gpa ? `GPA ${c.gpa}` : ""].filter(Boolean).join(" · ")}
                </span>
              </div>
            </div>

            <div>
              <div style={{ color: scoreColor(c.score), fontSize: 18, fontFamily: serifFont, fontWeight: 600 }}>{formatScore(c.score)}</div>
              <div style={{ fontSize: 11, color: css.textGray }}>
                {formatScore(getAggregateScore(c))} / {getMaxScore(c)} · {c.numReviews ?? c.reviews?.length ?? 0} {(c.numReviews ?? c.reviews?.length ?? 0) === 1 ? "review" : "reviews"}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setSelectedCandidate(c)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 4, background: css.greenDark, color: "#FFF", border: "none", fontSize: 13, cursor: "pointer" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                Details
              </button>
              <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 4, background: "#FFF", color: "#333", border: `1px solid ${css.borderLight}`, fontSize: 13, cursor: "pointer" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                Application
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedCandidate && (
        <ScorecardModal candidate={selectedCandidate} onClose={() => setSelectedCandidate(null)} />
      )}
    </div>
  );
}

const filterButtonStyle = {
  background: "#FFF",
  color: css.textDark,
  border: `1px solid ${css.borderLight}`,
  padding: "6px 16px",
  borderRadius: 4,
  fontSize: 13,
  cursor: "pointer",
};
