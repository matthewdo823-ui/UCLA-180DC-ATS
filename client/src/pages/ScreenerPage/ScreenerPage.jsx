import { useState, useEffect, useRef } from "react";
import { css } from "../../theme/colors";
import { YEAR_CFG } from "../../constants/config";

import Topbar from "../../components/Topbar/Topbar";
import CandidateRow from "../../components/CandidateRow/CandidateRow";
import PdfViewer from "../../components/PdfViewer/PdfViewer";
import ScoringPanel from "../../components/ScoringPanel/ScoringPanel";
import Drawer from "../../components/Drawer/Drawer";

const API = "http://localhost:3000";

export default function ScreenerPage() {
  const [resume, setResume] = useState(null);
  const [scores, setScores] = useState({});
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(null);   // total resumes to review
  const [reviewed, setReviewed] = useState(0);
  const [history, setHistory] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  const rawYear = resume?.candidates?.year?.toLowerCase().replace(/\s/g, '');
  const year = rawYear ? YEAR_CFG[rawYear] : null;

  return (
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
  );
}
