import { useState, useEffect } from "react";
import { css } from "../../theme/colors";

const API = "http://localhost:3000";

const serifFont = "Georgia, 'Times New Roman', serif";

function ScoreColor(score) {
  if (score >= 90) return css.greenDark;
  if (score >= 80) return "#4CAF50"; // lighter green
  if (score >= 70) return css.amber;
  return css.textGray;
}

export default function ScoreboardPage() {
  const [data, setData] = useState({ stats: null, candidates: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchScoreboard() {
      try {
        const res = await fetch(`${API}/scoreboard`);
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
  }, []);

  const getInitials = (name) => {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  };

  return (
    <div style={{ minHeight: "100vh", background: "#FCFBFA", fontFamily: "'DM Sans', sans-serif", color: css.textDark }}>
      
      {/* Navbar */}
      <div style={{ height: 64, background: css.greenDark, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", color: "#FFF" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, background: "rgba(255,255,255,0.15)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <span style={{ fontSize: 16, fontWeight: 500, fontFamily: serifFont }}>Resume Screener</span>
          <span style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", fontFamily: serifFont }}>›</span>
          <span style={{ fontSize: 16, fontWeight: 600, fontFamily: serifFont }}>Scoreboard</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.4)", color: "#FFF", padding: "6px 16px", borderRadius: 6, fontSize: 13, cursor: "pointer", fontWeight: 500 }}>
            Export CSV
          </button>
          <button style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.4)", color: "#FFF", padding: "6px 16px", borderRadius: 6, fontSize: 13, cursor: "pointer", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
            Filters
          </button>
          <button style={{ background: "#FFF", border: "none", color: css.textDark, width: 32, height: 32, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
          </button>
        </div>
      </div>

      {/* Header & Filter Pills */}
      <div style={{ padding: "40px 48px 32px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontFamily: serifFont, fontSize: 32, margin: "0 0 8px 0", color: "#111", fontWeight: 500 }}>Candidate Scoreboard</h1>
          <div style={{ fontSize: 15, color: "#666" }}>Spring 2025 Cohort · Ranked by aggregate score</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ background: css.greenDark, color: "#FFF", border: "none", padding: "6px 16px", borderRadius: 4, fontSize: 13, cursor: "pointer" }}>All</button>
          <button style={{ background: "#FFF", color: css.textDark, border: `1px solid ${css.borderLight}`, padding: "6px 16px", borderRadius: 4, fontSize: 13, cursor: "pointer" }}>Top Performers</button>
          <button style={{ background: "#FFF", color: css.textDark, border: `1px solid ${css.borderLight}`, padding: "6px 16px", borderRadius: 4, fontSize: 13, cursor: "pointer" }}>Flagged</button>
          <button style={{ background: "#FFF", color: css.textDark, border: `1px solid ${css.borderLight}`, padding: "6px 16px", borderRadius: 4, fontSize: 13, cursor: "pointer" }}>Pending</button>
        </div>
      </div>

      {/* Stats Bar */}
      <div style={{ background: "#F2EFEB", borderTop: `1px solid #E4E0D9`, borderBottom: `1px solid #E4E0D9`, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", padding: "20px 48px" }}>
        <div style={{ borderRight: `1px solid #E4E0D9`, padding: "4px 0" }}>
          <div style={{ fontSize: 28, fontFamily: serifFont, color: "#111", lineHeight: 1.1 }}>{data.stats?.applicants ?? "—"}</div>
          <div style={{ fontSize: 11, color: "#777", fontWeight: 600, letterSpacing: "0.05em", marginTop: 4 }}>APPLICANTS</div>
        </div>
        <div style={{ borderRight: `1px solid #E4E0D9`, padding: "4px 0 4px 32px" }}>
          <div style={{ fontSize: 28, fontFamily: serifFont, color: "#111", lineHeight: 1.1 }}>{data.stats?.reviewed ?? "—"}</div>
          <div style={{ fontSize: 11, color: "#777", fontWeight: 600, letterSpacing: "0.05em", marginTop: 4 }}>REVIEWED</div>
        </div>
        <div style={{ borderRight: `1px solid #E4E0D9`, padding: "4px 0 4px 32px" }}>
          <div style={{ fontSize: 28, fontFamily: serifFont, color: "#111", lineHeight: 1.1 }}>{data.stats?.advanced ?? "—"}</div>
          <div style={{ fontSize: 11, color: "#777", fontWeight: 600, letterSpacing: "0.05em", marginTop: 4 }}>ADVANCED</div>
        </div>
        <div style={{ padding: "4px 0 4px 32px" }}>
          <div style={{ fontSize: 28, fontFamily: serifFont, color: "#111", lineHeight: 1.1 }}>{data.stats?.avgScore ?? "—"}</div>
          <div style={{ fontSize: 11, color: "#777", fontWeight: 600, letterSpacing: "0.05em", marginTop: 4 }}>AVG SCORE</div>
        </div>
      </div>

      {/* Table Area */}
      <div style={{ padding: "0 48px 60px", maxWidth: 1200, margin: "0 auto" }}>
        {/* Table Header */}
        <div style={{ display: "grid", gridTemplateColumns: "60px 2fr 1fr 200px", padding: "16px 0", borderBottom: `2px solid #E4E0D9`, color: "#888", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em" }}>
          <div>#</div>
          <div>CANDIDATE</div>
          <div>SCORE</div>
          <div style={{ textAlign: "right" }}>ACTIONS</div>
        </div>

        {/* Loading state */}
        {loading && (
          <div style={{ padding: 40, textAlign: "center", color: css.textGray }}>Loading candidates...</div>
        )}

        {/* Table Rows */}
        {!loading && data.candidates.map((c, idx) => (
          <div key={c.id} style={{ display: "grid", gridTemplateColumns: "60px 2fr 1fr 200px", padding: "20px 0", borderBottom: `1px solid #EAEAEA`, alignItems: "center", background: "#FFF", transition: "background 0.2s" }}>
            
            <div style={{ color: css.greenDark, fontWeight: 700, fontSize: 14 }}>
              {c.rank}
            </div>
            
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 44, height: 44, background: css.greenDark, color: "#FFF", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 500, fontSize: 15, letterSpacing: "0.02em" }}>
                {getInitials(c.name)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 16, fontWeight: 500, fontFamily: serifFont, color: "#111" }}>{c.name}</span>
                <span style={{ fontSize: 13, color: "#888" }}>{c.major}</span>
              </div>
            </div>

            <div style={{ color: ScoreColor(c.score), fontSize: 18, fontFamily: serifFont, fontWeight: 600 }}>
              {c.score}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 4, background: css.greenDark, color: "#FFF", border: "none", fontSize: 13, cursor: "pointer" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                Details
              </button>
              <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 4, background: "#FFF", color: "#333", border: `1px solid ${css.borderLight}`, fontSize: 13, cursor: "pointer" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                Application
              </button>
            </div>
            
          </div>
        ))}
      </div>
    </div>
  );
}
