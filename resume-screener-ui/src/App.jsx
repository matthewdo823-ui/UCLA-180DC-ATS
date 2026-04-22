import { useState, useEffect, useRef, useCallback } from "react";
 
// ─── Constants ────────────────────────────────────────────────────────────────
const METRICS = ["experience", "leadership", "social impact", "communication"];
const API = "http://localhost:3000";
const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const MAX_SCORE = METRICS.length * 6;
 
const YEAR_CFG = {
  freshman: {
    label: "freshman", icon: "🌱", sub: "1st Year",
    panelColor: "#5BA3E0", panelBg: "rgb(0, 104, 216)", panelBd: "rgba(91,163,224,0.30)",
    badgeBg: "rgba(74,144,217,0.13)", badgeColor: "#5BA3E0", badgeBd: "rgba(91,163,224,0.35)",
  },
  sophomore: {
    label: "sophomore", icon: "📚", sub: "2nd Year",
    panelColor: "#3DC9A0", panelBg: "rgb(0, 184, 126)", panelBd: "rgba(61,201,160,0.30)",
    badgeBg: "rgba(29,158,117,0.13)", badgeColor: "#3DC9A0", badgeBd: "rgba(61,201,160,0.35)",
  },
  junior: {
    label: "junior", icon: "⭐", sub: "3rd Year",
    panelColor: "#F5C060", panelBg: "rgb(206, 124, 0)", panelBd: "rgba(245,192,96,0.30)",
    badgeBg: "rgba(239,159,39,0.13)", badgeColor: "#F5C060", badgeBd: "rgba(245,192,96,0.35)",
  },
  juniortransfer: {
    label: "juniortransfer", icon: "⭐", sub: "3rd Year Transfer",
    panelColor: "#F5C060", panelBg: "rgb(206, 124, 0)", panelBd: "rgba(245,192,96,0.30)",
    badgeBg: "rgba(239,159,39,0.13)", badgeColor: "#F5C060", badgeBd: "rgba(245,192,96,0.35)",
  },
  senior: {
    label: "senior", icon: "⭐", sub: "4th Year",
    panelColor: "#F5C060", panelBg: "rgb(225, 0, 0)", panelBd: "rgba(245,192,96,0.30)",
    badgeBg: "rgba(239,159,39,0.13)", badgeColor: "#F5C060", badgeBd: "rgba(245,192,96,0.35)",
  },
};
 
// ─── Styles (CSS-in-JS object map) ────────────────────────────────────────────
const css = {
  // tokens
  navy:    "#0D1B2A",
  navy2:   "#131f2e",
  gold:    "#FFB81C",
  surface: "#1a2840",
  surface2:"#1f3048",
  border:  "rgba(255,255,255,0.07)",
  border2: "rgba(255,255,255,0.13)",
  text1:   "#EEF2F7",
  text2:   "#8FA3B8",
  text3:   "#4A6070",
  green:   "#1D9E75",
  red:     "#E24B4A",
  amber:   "#EF9F27",
};
 
// ─── PDF Renderer ─────────────────────────────────────────────────────────────
function PdfViewer({ url }) {
  const containerRef = useRef(null);
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const renderingRef = useRef(false);
 
  // Load PDF.js script once
  useEffect(() => {
    if (window.pdfjsLib) return;
    const script = document.createElement("script");
    script.src = PDFJS_URL;
    script.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; };
    document.head.appendChild(script);
  }, []);
 
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
 
    async function renderPdf() {
      setLoading(true);
      setError(null);
      setPages([]);
 
      // Wait for PDF.js to load
      let tries = 0;
      while (!window.pdfjsLib && tries < 40) {
        await new Promise(r => setTimeout(r, 100));
        tries++;
      }
      if (!window.pdfjsLib) { setError("PDF.js failed to load"); setLoading(false); return; }
 
      try {
        const pdf = await window.pdfjsLib.getDocument(url).promise;
        if (cancelled) return;
 
        const pageDataArr = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.6 });
          pageDataArr.push({ page, viewport });
        }
        if (!cancelled) { setPages(pageDataArr); setLoading(false); }
      } catch (e) {
        if (!cancelled) { setError("Could not render PDF"); setLoading(false); }
      }
    }
 
    renderPdf();
    return () => { cancelled = true; };
  }, [url]);
 
  return (
    <div ref={containerRef} style={{ flex: 1, overflowY: "auto", background: css.navy, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "16px 12px", scrollbarWidth: "thin", scrollbarColor: `${css.border2} transparent` }}>
      {loading && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: css.text3, fontSize: 13 }}>
          <div style={{ width: 36, height: 36, border: `3px solid ${css.border2}`, borderTopColor: css.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          Rendering PDF…
        </div>
      )}
      {error && <div style={{ color: css.red, fontSize: 13, padding: 20 }}>{error}</div>}
      {pages.map(({ page, viewport }, idx) => (
        <PageCanvas key={idx} page={page} viewport={viewport} />
      ))}
    </div>
  );
}
 
function PageCanvas({ page, viewport }) {
  const canvasRef = useRef(null);
  const rendered = useRef(false);
 
  useEffect(() => {
    if (!canvasRef.current || rendered.current) return;
    rendered.current = true;
    const canvas = canvasRef.current;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    page.render({ canvasContext: canvas.getContext("2d"), viewport });
  }, [page, viewport]);
 
  return (
    <canvas ref={canvasRef} style={{ width: "100%", maxWidth: viewport.width, boxShadow: "0 4px 24px rgba(0,0,0,0.5)", borderRadius: 6 }} />
  );
}
 
// ─── Topbar ───────────────────────────────────────────────────────────────────
function Topbar({ reviewed, total, onHistory, historyCount }) {
  const pct = total ? (reviewed / total) * 100 : 0;
  return (
    <div style={{ height: 52, background: css.navy2, borderBottom: `1px solid ${css.border}`, display: "flex", alignItems: "center", padding: "0 22px", gap: 10, flexShrink: 0 }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: css.text1, fontFamily: "'DM Sans', sans-serif" }}>180° Resume Screener</span>
      <div style={{ width: 1, height: 18, background: css.border2 }} />
      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, letterSpacing: "0.02em", border: `1px solid rgba(255,184,28,0.22)`, background: "rgba(255,184,28,0.12)", color: css.gold }}>Round 1 · Resume Screen</span>
      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, letterSpacing: "0.02em", border: `1px solid rgba(29,158,117,0.22)`, background: "rgba(29,158,117,0.12)", color: "#4ECBA0" }}>Active</span>
      <div style={{ flex: 1 }} />
      <button onClick={onHistory} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "6px 13px", borderRadius: 20, border: `1px solid ${css.border2}`, background: css.surface2, fontSize: 11, fontWeight: 600, color: css.text2, transition: "all 0.14s" }}>
        📋 Past Reviews
        <span style={{ background: css.gold, color: css.navy, borderRadius: 20, fontSize: 9, fontWeight: 800, padding: "1px 6px" }}>{historyCount}</span>
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: css.surface, border: `1px solid ${css.border}`, borderRadius: 22, padding: "5px 14px 5px 10px" }}>
        <span style={{ fontSize: 14 }}>📄</span>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: css.text1, lineHeight: 1 }}>{reviewed} / {total || "—"}</span>
          <span style={{ fontSize: 9, color: css.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>Reviewed</span>
          <div style={{ width: 70, height: 4, background: css.border2, borderRadius: 2, overflow: "hidden", marginTop: 2 }}>
            <div style={{ height: "100%", width: `${pct}%`, background: css.gold, borderRadius: 2, transition: "width 0.4s ease" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
 
// ─── Candidate Row ────────────────────────────────────────────────────────────
function CandidateRow({ resume }) {
  // 1. Safety Check
  if (!resume || !resume.candidates) return null;

  // 2. Data Mapping
  const rawYear = resume.candidates.year?.toLowerCase().replace(/\s/g, '');
  const year = YEAR_CFG[rawYear];

  // 3. Pre-defined Styles (The "Style Routing")
  // This centralizes the 'Hero' look and fallbacks
  const rowStyle = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
    padding: "10px 16px",
    borderRadius: 10,
    // Route to config values OR defaults
    background: year ? year.panelBg : css.surface,
    border: `1px solid ${year ? year.panelBd : css.border}`,
    transition: "all 0.2s ease" // Smooth color changes
  };

  return (
    <div style={rowStyle}>
      <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Candidate
      </span>

      <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: "#FFF" }}>
        {resume.name ?? "—"}
      </span>

      <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.2)" }} />

      {year ? (
        <>
          {/* The Year Badge */}
          <span style={{ 
            display: "inline-flex", 
            alignItems: "center", 
            gap: 6, 
            padding: "4px 11px", 
            borderRadius: 20, 
            border: `1.5px solid ${year.badgeBd}`, 
            background: year.badgeBg, 
            color: "#FFF", 
            fontSize: 10, 
            fontWeight: 700, 
            textTransform: "uppercase" 
          }}>
            <span>{year.icon}</span>
            {year.label}
          </span>

          {/* The Hero Status Text */}
          <span style={{ color: "rgba(255,255,255,0.9)", fontSize: 10, fontWeight: 600 }}>
            {year.sub} Student
          </span>
        </>
      ) : (
        <span style={{ color: css.text3, fontSize: 10 }}>Year Not Specified</span>
      )}
    </div>
  );
}
 
// ─── Score Bubble Row ─────────────────────────────────────────────────────────
const BUBBLE_COLORS = {
  1: { bg: "rgba(226,75,74,0.20)",  bd: "#E24B4A",               color: "#E24B4A"  },
  2: { bg: "rgba(226,75,74,0.12)",  bd: "rgba(226,75,74,0.5)",   color: "#F07877"  },
  3: { bg: "rgba(239,159,39,0.15)", bd: "#EF9F27",               color: "#EF9F27"  },
  4: { bg: "rgba(239,159,39,0.10)", bd: "rgba(239,159,39,0.5)",  color: "#F5C060"  },
  5: { bg: "rgba(29,158,117,0.15)", bd: "#1D9E75",               color: "#4ECBA0"  },
  6: { bg: "rgba(29,158,117,0.22)", bd: "#4ECBA0",               color: "#80D9BF"  },
};
 
function MetricRow({ metric, value, onScore }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: css.text2, textTransform: "capitalize" }}>{metric}</span>
        <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: css.gold }}>{value ?? "—"} / 6</span>
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        {[1, 2, 3, 4, 5, 6].map(n => {
          const sel = value === n;
          const c = BUBBLE_COLORS[n];
          return (
            <button key={n} onClick={() => onScore(metric, n)} style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${sel ? c.bd : css.border}`, color: sel ? c.color : css.text3, background: sel ? c.bg : css.surface2, transition: "all 0.11s", fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
 
// ─── Scoring Panel ────────────────────────────────────────────────────────────
function ScoringPanel({ resume, scores, onScore, notes, onNotes, onAction }) {
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const year = resume?.year ? YEAR_CFG[resume.year] : null;
  const scoreColor = total >= MAX_SCORE * 0.75 ? css.green : total >= MAX_SCORE * 0.5 ? css.amber : css.red;
 
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", paddingBottom: 16, scrollbarWidth: "thin", scrollbarColor: `${css.border2} transparent` }}>
      {/* Metrics card */}
      <div style={{ background: css.surface, border: `1px solid ${css.border}`, borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: css.text3, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 14 }}>Scoring Rubric</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {METRICS.map(m => (
            <MetricRow key={m} metric={m} value={scores[m]} onScore={onScore} />
          ))}
        </div>
        {/* Score summary */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: css.surface2, borderRadius: 10, border: `1px solid ${css.border}`, marginTop: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 26, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: scoreColor, lineHeight: 1 }}>{total}</span>
              <span style={{ fontSize: 13, color: css.text3, fontFamily: "'DM Mono', monospace" }}>/ {MAX_SCORE}</span>
            </div>
            <div style={{ fontSize: 10, color: css.text3, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 2 }}>Aggregate</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ height: 5, background: css.border2, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(total / MAX_SCORE) * 100}%`, background: scoreColor, borderRadius: 3, transition: "width 0.3s ease" }} />
            </div>
          </div>
        </div>
      </div>
 
      {/* Notes card */}
      <div style={{ background: css.surface, border: `1px solid ${css.border}`, borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: css.text3, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>Notes</div>
        <textarea
          value={notes}
          onChange={e => onNotes(e.target.value.slice(0, 300))}
          placeholder="Add notes about this candidate…"
          style={{ width: "100%", height: 80, padding: "10px 12px", background: css.surface2, border: `1px solid ${css.border}`, borderRadius: 8, color: css.text2, fontSize: 12, fontFamily: "'DM Sans', sans-serif", resize: "none", outline: "none", boxSizing: "border-box" }}
        />
        <div style={{ fontSize: 10, color: css.text3, textAlign: "right", marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{notes.length} / 300</div>
      </div>
 
      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8 }}>
        {[
          { type: "reject", label: "✕ Skip",    style: { borderColor: css.red,   color: "#F07877", bg: "rgba(226,75,74,0.07)",  hoverBg: "rgba(226,75,74,0.18)"  } },
          { type: "flag",   label: "⚑ Flag",    style: { borderColor: css.amber, color: css.amber, bg: "rgba(239,159,39,0.07)", hoverBg: "rgba(239,159,39,0.18)" } },
          { type: "pass",   label: "✓ Advance", style: { borderColor: css.green, color: "#4ECBA0", bg: "rgba(29,158,117,0.07)", hoverBg: "rgba(29,158,117,0.18)" } },
        ].map(({ type, label, style }) => (
          <ActionBtn key={type} label={label} style={style} onClick={() => onAction(type)} />
        ))}
      </div>
    </div>
  );
}
 
function ActionBtn({ label, style, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 8px", borderRadius: 28, cursor: "pointer", fontSize: 12, fontWeight: 600, border: `1.5px solid ${style.borderColor}`, color: style.color, background: hover ? style.hoverBg : style.bg, boxShadow: hover ? `0 4px 18px ${style.borderColor}33` : "none", transform: hover ? "translateY(-1px)" : "none", transition: "all 0.15s" }}>
      {label}
    </button>
  );
}
 
// ─── Past Reviews Drawer ──────────────────────────────────────────────────────
const DEC_STYLE = {
  pass:   { bg: "rgba(29,158,117,0.12)", color: "#4ECBA0", bd: "rgba(29,158,117,0.28)", label: "✓ Advanced" },
  flag:   { bg: "rgba(239,159,39,0.12)", color: "#F5C060", bd: "rgba(239,159,39,0.28)", label: "⚑ Flagged" },
  reject: { bg: "rgba(226,75,74,0.10)",  color: "#F07877", bd: "rgba(226,75,74,0.22)",  label: "✕ Skipped" },
};
 
function Drawer({ open, onClose, reviews }) {
  const passCount   = reviews.filter(r => r.decision === "pass").length;
  const flagCount   = reviews.filter(r => r.decision === "flag").length;
  const rejectCount = reviews.filter(r => r.decision === "reject").length;
  const scoreColor = t => t >= MAX_SCORE * 0.75 ? css.green : t >= MAX_SCORE * 0.5 ? css.amber : css.red;
 
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.52)", zIndex: 100, opacity: open ? 1 : 0, pointerEvents: open ? "all" : "none", transition: "opacity 0.22s" }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, background: css.navy2, borderLeft: `1px solid ${css.border2}`, display: "flex", flexDirection: "column", zIndex: 101, transform: open ? "translateX(0)" : "translateX(100%)", transition: "transform 0.3s cubic-bezier(0.22,1,0.36,1)", boxShadow: "-12px 0 40px rgba(0,0,0,0.35)" }}>
        <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${css.border}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: css.text1 }}>Past Reviews</div>
            <div style={{ fontSize: 10, color: css.text3, marginTop: 2 }}>All evaluated candidates</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${css.border2}`, background: css.surface2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 12, color: css.text3 }}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "12px 20px", borderBottom: `1px solid ${css.border}`, flexShrink: 0 }}>
          {[["pass", passCount, "#4ECBA0", "Passed"], ["flag", flagCount, css.amber, "Flagged"], ["reject", rejectCount, "#F07877", "Skipped"]].map(([, val, color, lbl]) => (
            <div key={lbl} style={{ textAlign: "center", padding: "10px 8px", background: css.surface, borderRadius: 10, border: `1px solid ${css.border}` }}>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'DM Mono', monospace", color }}>{val}</div>
              <div style={{ fontSize: 9, color: css.text3, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{lbl}</div>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 20px", scrollbarWidth: "thin", scrollbarColor: `${css.border2} transparent` }}>
          {reviews.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: css.text3, fontSize: 12, lineHeight: 1.7 }}>
              <span style={{ fontSize: 28, display: "block", marginBottom: 10, opacity: 0.6 }}>📄</span>
              No reviews yet.<br />Complete your first review<br />to see history here.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 9, fontWeight: 600, color: css.text3, textTransform: "uppercase", letterSpacing: "0.08em", padding: "6px 0 8px", marginTop: 4 }}>All Reviews ({reviews.length})</div>
              {reviews.map((r, i) => {
                const yr = r.year ? YEAR_CFG[r.year] : null;
                const dec = DEC_STYLE[r.decision];
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1px solid ${css.border}`, background: css.surface, marginBottom: 6, cursor: "default" }}>
                    {yr && <div style={{ width: 3, height: 32, borderRadius: 2, background: yr.panelColor, flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: css.text1 }}>{r.id}</div>
                      {yr && <div style={{ fontSize: 10, fontWeight: 600, color: yr.panelColor, marginTop: 2 }}>{yr.label}</div>}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: scoreColor(r.total), width: 38, textAlign: "right" }}>{r.total}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 20, letterSpacing: "0.04em", textTransform: "uppercase", border: `1px solid ${dec.bd}`, background: dec.bg, color: dec.color, whiteSpace: "nowrap" }}>{dec.label}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </>
  );
}
 
// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [resume, setResume] = useState(null);
  const [scores, setScores] = useState({});
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(null);   // total resumes to review
  const [reviewed, setReviewed] = useState(0);
  const [history, setHistory] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [animClass, setAnimClass] = useState(""); // "fly-out" | "fly-in"
  const panelRef = useRef(null);
 
  useEffect(() => { fetchNext(); }, []);
 
  async function fetchNext() {
    try {
      setLoading(true);
      const res = await fetch(`${API}/next-resume`);
      if (!res.ok) { setResume(null); return; }
      const data = await res.json();
      setResume(data);
      setTotal(data.total ?? null);
      setScores({});
      setNotes("");
    } catch (e) {
      console.error("Fetch failed:", e);
      setResume(null);
    } finally {
      setLoading(false);
    }
  }
 
  async function handleAction(type) {
    const total_score = Object.values(scores).reduce((a, b) => a + b, 0);
 
    // Save review to history
    setHistory(h => [{ id: resume.id, year: resume.year, scores: { ...scores }, total: total_score, decision: type, notes: notes || "No notes added." }, ...h]);
    setReviewed(r => r + 1);
 
    // Post to server
    try {
      await fetch(`${API}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume_id: resume.id, scores, notes, decision: type }),
      });
    } catch (e) { console.warn("Could not post review:", e); }
 
    // Animate out → fetch next → animate in
    if (panelRef.current) panelRef.current.style.animation = "cardFlyOut 0.28s ease forwards";
    await new Promise(r => setTimeout(r, 280));
    await fetchNext();
    if (panelRef.current) {
      panelRef.current.style.animation = "";
      void panelRef.current?.offsetWidth;
      panelRef.current.style.animation = "cardFlyIn 0.28s ease forwards";
      setTimeout(() => { if (panelRef.current) panelRef.current.style.animation = ""; }, 300);
    }
  }
 
  const year = resume?.year ? YEAR_CFG[resume.year] : null;
 
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0D1B2A; font-family: 'DM Sans', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes cardFlyOut { to { opacity: 0; transform: translateY(-14px) scale(0.97); } }
        @keyframes cardFlyIn  { from { opacity: 0; transform: translateY(14px) scale(0.97); } to { opacity: 1; transform: none; } }
        textarea::placeholder { color: #4A6070; }
        textarea { color: #8FA3B8 !important; }
        button { font-family: 'DM Sans', sans-serif; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.13); border-radius: 2px; }
      `}</style>
 
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: css.navy, color: css.text1, fontFamily: "'DM Sans', sans-serif", fontSize: 13, overflow: "hidden" }}>
        <Topbar reviewed={reviewed} total={total ?? reviewed + 1} onHistory={() => setDrawerOpen(true)} historyCount={history.length} />
 
        <div style={{ flex: 1, overflow: "hidden", padding: "14px 22px 0", display: "flex", flexDirection: "column", gap: 12 }}>
          <CandidateRow resume={resume} />
 
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.35fr", gap: 14, flex: 1, minHeight: 0, overflow: "hidden" }}>
            {/* ── Left: Resume panel ── */}
            <div ref={panelRef} style={{ background: css.surface, border: `1px solid ${css.border}`, borderTop: year ? `3px solid ${year.panelColor}` : `1px solid ${css.border}`, borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden", transition: "border-color 0.3s" }}>
              {/* Year banner */}
              {year && (
                <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 16px", borderBottom: `1px solid ${css.border}`, background: year.panelBg, flexShrink: 0 }}>
                  <span style={{ fontSize: 16 }}>{year.icon}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: year.panelColor, lineHeight: 1 }}>{year.label}</div>
                    <div style={{ fontSize: 10, color: css.text3, marginTop: 2 }}>{year.sub}</div>
                  </div>
                  <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 20, background: "rgba(127,119,221,0.1)", color: "#A8A3EE", border: "1px solid rgba(127,119,221,0.22)", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>🔒 REDACTED</span>
                </div>
              )}
 
              {/* PDF view */}
              {loading ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: css.text3, fontSize: 13 }}>
                  <div style={{ width: 36, height: 36, border: `3px solid ${css.border2}`, borderTopColor: css.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  Loading resume…
                </div>
              ) : resume?.file_url ? (
                <PdfViewer url={`http://localhost:3000/view/pdf?url=${encodeURIComponent(resume.file_url)}`} />
              ) : (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: css.text3, fontSize: 13 }}>No resume available</div>
              )}
            </div>
 
            {/* ── Right: Scoring panel ── */}
            <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {!loading && resume ? (
                <ScoringPanel
                  resume={resume}
                  scores={scores}
                  onScore={(metric, val) => setScores(s => ({ ...s, [metric]: val }))}
                  notes={notes}
                  onNotes={setNotes}
                  onAction={handleAction}
                />
              ) : (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: css.text3, fontSize: 13 }}>Loading…</div>
              )}
            </div>
          </div>
        </div>
 
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} reviews={history} />
      </div>
    </>
  );
}