import { useEffect, useMemo, useState } from "react";
import { useAuthedFetch } from "../../auth/AuthContext";
import { METRICS } from "../../constants/config";
import { css } from "../../theme/colors";

const API = "http://localhost:3000";
const serifFont = "Georgia, 'Times New Roman', serif";
const cardGreen = "#085041";
const cardMint = "#1D9E75";
const cardPale = "#EAF3DE";
const cardLime = "#C0DD97";

function hasNumericValue(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function getInitials(name) {
  if (!name) return "??";
  return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
}

function titleCase(value) {
  if (!value) return "";
  return value.replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function formatNumber(value) {
  if (!hasNumericValue(value)) return "N/A";
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : numeric.toFixed(1);
}

function formatDate(value) {
  if (!value) return "Not yet";
  return new Date(value).toLocaleDateString();
}

function progressColor(progress) {
  if (progress >= 100) return css.greenDark;
  if (progress >= 75) return "#4CAF50";
  if (progress >= 50) return css.amber;
  return css.textGray;
}

function ProgressTiles({ count, expected }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 2 }}>
      {Array.from({ length: expected }).map((_, index) => (
        <div
          key={index}
          style={{
            width: 9,
            height: 9,
            borderRadius: 2,
            background: index < count ? cardMint : cardLime,
          }}
        />
      ))}
    </div>
  );
}

function CategoryRow({ metric, value }) {
  const pct = hasNumericValue(value) ? Math.max(0, Math.min(100, (Number(value) / 6) * 100)) : 0;

  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: css.textDark }}>{titleCase(metric)}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: cardGreen }}>
          {formatNumber(value)} <span style={{ color: css.textGray, fontWeight: 400 }}>/ 6</span>
        </span>
      </div>
      <div style={{ height: 5, background: "#EEF1EC", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: cardMint, borderRadius: 3, transition: "width 0.35s ease" }} />
      </div>
    </div>
  );
}

function GraderModal({ grader, onClose }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!grader) return null;

  return (
    <div
      className="scorecard-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${grader.name} grader summary`}
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
      <div className="scorecard-shell" style={{ width: "min(460px, 100%)", position: "relative", perspective: 900 }}>
        <button
          aria-label="Close grader summary"
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
          GRADER SUMMARY
        </p>

        <div style={{ borderRadius: 16, border: `2px solid ${cardGreen}`, overflow: "hidden", background: "#FFF", boxShadow: "0 24px 70px rgba(0,0,0,0.26)" }}>
          <div style={{ background: cardGreen, padding: "18px 18px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
              <span style={{ background: "#04342C", color: "#9FE1CB", fontSize: 10, fontWeight: 700, padding: "4px 9px", borderRadius: 20, letterSpacing: "0.04em" }}>
                ROUND 1 · GRADER
              </span>
              <span style={{ background: "rgba(255,255,255,0.1)", color: cardLime, fontSize: 10, fontWeight: 700, padding: "4px 9px", borderRadius: 20, border: `1px solid ${cardMint}`, textTransform: "uppercase" }}>
                {grader.role}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: cardMint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700, color: cardPale, flexShrink: 0, border: "2px solid #5DCAA5" }}>
                {getInitials(grader.name)}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ color: cardPale, fontSize: 18, fontFamily: serifFont, fontWeight: 600, margin: "0 0 3px", lineHeight: 1.15 }}>{grader.name}</p>
                <p style={{ color: "#9FE1CB", fontSize: 12, margin: "0 0 2px" }}>{grader.email}</p>
                <p style={{ color: "#5DCAA5", fontSize: 11, margin: 0 }}>
                  Last login: {formatDate(grader.lastLogin)}
                </p>
              </div>
            </div>
          </div>

          <div style={{ background: cardPale, padding: "11px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #DCE7D2" }}>
            <div>
              <p style={{ fontSize: 10, color: "#3B6D11", margin: "0 0 2px", fontWeight: 800, letterSpacing: "0.05em" }}>REVIEWS GRADED</p>
              <p style={{ fontSize: 30, fontWeight: 700, color: cardGreen, margin: 0, lineHeight: 1 }}>
                {grader.reviewCount} <span style={{ fontSize: 14, color: "#3B6D11" }}>/ {grader.expectedReviews}</span>
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 10, color: "#3B6D11", margin: "0 0 6px", fontWeight: 800, letterSpacing: "0.05em" }}>
                {grader.progressScore}% COMPLETE
              </p>
              <ProgressTiles count={grader.reviewCount} expected={grader.expectedReviews} />
            </div>
          </div>

          <div style={{ padding: "14px 18px 4px" }}>
            <p style={{ fontSize: 10, color: css.textGray, letterSpacing: "0.06em", margin: "0 0 10px", fontWeight: 800 }}>AVERAGE SCORES GIVEN</p>
            {METRICS.map(metric => (
              <CategoryRow key={metric} metric={metric} value={grader.categoryScores?.[metric]} />
            ))}
          </div>

          <div style={{ margin: "6px 18px 0", padding: "10px 12px", background: "#F8FAF6", border: "1px solid #E3E8DD", borderRadius: 8 }}>
            <p style={{ fontSize: 10, color: css.textGray, letterSpacing: "0.05em", margin: "0 0 5px", fontWeight: 800 }}>SUMMARY</p>
            <p style={{ fontSize: 12, lineHeight: 1.45, color: css.textDark, margin: 0 }}>
              Average total score given: {formatNumber(grader.averageScore)} / {grader.maxScore}. Latest grading activity: {formatDate(grader.latestReviewAt)}.
            </p>
          </div>

          <div style={{ padding: "12px 18px 18px", borderTop: "1px solid #EAEAEA", marginTop: 12 }}>
            <p style={{ fontSize: 11, color: css.textGray, fontWeight: 800, letterSpacing: "0.05em", margin: "0 0 8px" }}>
              RECENT REVIEWS ({grader.reviews?.length ?? 0})
            </p>
            {(grader.reviews ?? []).slice(0, 5).map(review => (
              <div key={review.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid #EAEAEA" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 12, color: css.textDark, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{review.resumeName}</p>
                  <p style={{ fontSize: 11, color: css.textGray, margin: 0 }}>{formatDate(review.submittedAt)}</p>
                </div>
                <div style={{ fontSize: 12, color: cardGreen, fontWeight: 800 }}>{formatNumber(review.score)}/{grader.maxScore}</div>
              </div>
            ))}
            {grader.reviews?.length === 0 && (
              <div style={{ fontSize: 12, color: css.textGray, padding: "8px 0" }}>No reviews submitted yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GraderScoreboardPage() {
  const authedFetch = useAuthedFetch();
  const [data, setData] = useState({ stats: null, graders: [] });
  const [loading, setLoading] = useState(true);
  const [selectedGrader, setSelectedGrader] = useState(null);

  useEffect(() => {
    async function fetchGraders() {
      try {
        const res = await authedFetch(`${API}/grader-scoreboard`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Failed to load grader scoreboard:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchGraders();
  }, [authedFetch]);

  const graders = useMemo(() => data.graders ?? [], [data.graders]);

  return (
    <div style={{ minHeight: "100vh", background: "#FCFBFA", fontFamily: "'DM Sans', sans-serif", color: css.textDark }}>
      <div style={{ height: 64, background: css.greenDark, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", color: "#FFF" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, background: "rgba(255,255,255,0.15)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <span style={{ fontSize: 16, fontWeight: 500, fontFamily: serifFont }}>Resume Screener</span>
          <span style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", fontFamily: serifFont }}>›</span>
          <span style={{ fontSize: 16, fontWeight: 600, fontFamily: serifFont }}>Graders</span>
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
          <h1 style={{ fontFamily: serifFont, fontSize: 32, margin: "0 0 8px 0", color: "#111", fontWeight: 500 }}>Grader Scoreboard</h1>
          <div style={{ fontSize: 15, color: "#666" }}>Spring 2025 Cohort · Ranked by resumes graded</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button style={{ background: css.greenDark, color: "#FFF", border: "none", padding: "6px 16px", borderRadius: 4, fontSize: 13, cursor: "pointer" }}>All</button>
          <button style={filterButtonStyle}>Complete</button>
          <button style={filterButtonStyle}>In Progress</button>
          <button style={filterButtonStyle}>Not Started</button>
        </div>
      </div>

      <div style={{ background: "#F2EFEB", borderTop: "1px solid #E4E0D9", borderBottom: "1px solid #E4E0D9", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", padding: "20px 48px" }}>
        {[
          ["GRADERS", data.stats?.graders ?? "—"],
          ["ACTIVE", data.stats?.activeGraders ?? "—"],
          ["TOTAL REVIEWS", data.stats?.totalReviews ?? "—"],
          ["GOAL", data.stats?.expectedReviews ?? "—"],
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
          <div>GRADER</div>
          <div>RESUMES GRADED</div>
          <div style={{ textAlign: "right" }}>ACTIONS</div>
        </div>

        {loading && <div style={{ padding: 40, textAlign: "center", color: css.textGray }}>Loading graders...</div>}

        {!loading && graders.map(grader => (
          <div key={grader.id} style={{ display: "grid", gridTemplateColumns: "60px minmax(240px, 2fr) 1fr 220px", padding: "20px 0", borderBottom: "1px solid #EAEAEA", alignItems: "center", background: "#FFF" }}>
            <div style={{ color: css.greenDark, fontWeight: 700, fontSize: 14 }}>{grader.rank}</div>

            <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
              <div style={{ width: 44, height: 44, background: css.greenDark, color: "#FFF", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 500, fontSize: 15, letterSpacing: "0.02em", flexShrink: 0 }}>
                {getInitials(grader.name)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 16, fontWeight: 500, fontFamily: serifFont, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{grader.name}</span>
                <span style={{ fontSize: 13, color: "#888", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textTransform: "capitalize" }}>
                  {[grader.role, grader.email].filter(Boolean).join(" · ")}
                </span>
              </div>
            </div>

            <div>
              <div style={{ color: progressColor(grader.progressScore), fontSize: 18, fontFamily: serifFont, fontWeight: 600 }}>
                {grader.reviewCount} / {grader.expectedReviews}
              </div>
              <div style={{ fontSize: 11, color: css.textGray }}>
                {grader.progressScore}% complete · avg score {formatNumber(grader.averageScore)} / {grader.maxScore}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setSelectedGrader(grader)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 4, background: css.greenDark, color: "#FFF", border: "none", fontSize: 13, cursor: "pointer" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                Details
              </button>
              <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 4, background: "#FFF", color: "#333", border: `1px solid ${css.borderLight}`, fontSize: 13, cursor: "pointer" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                Summary
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedGrader && (
        <GraderModal grader={selectedGrader} onClose={() => setSelectedGrader(null)} />
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
