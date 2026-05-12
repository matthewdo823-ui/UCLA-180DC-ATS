import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth, useAuthedFetch } from "../../auth/AuthContext";
import { css } from "../../theme/colors";

import Topbar from "../../components/Topbar/Topbar";
import CandidateRow from "../../components/CandidateRow/CandidateRow";
import PdfViewer from "../../components/PdfViewer/PdfViewer";
import ScoringPanel from "../../components/ScoringPanel/ScoringPanel";
import Drawer from "../../components/Drawer/Drawer";

const API = "http://localhost:3000";

export default function ScreenerPage() {
  const { token } = useAuth();
  const authedFetch = useAuthedFetch();
  const [resume, setResume] = useState(null);
  const [scores, setScores] = useState({});
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [reviewed, setReviewed] = useState(0);
  const [history, setHistory] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const panelRef = useRef(null);

  const fetchNext = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authedFetch(`${API}/next-resume`);
      if (!res.ok) { setResume(null); return; }
      const data = await res.json();
      setResume(data);
      setScores({});
      setNotes("");
    } catch (e) {
      console.error("Fetch failed:", e);
      setResume(null);
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => { fetchNext(); }, [fetchNext]);

  async function handleAction(type) {
    const total_score = Object.values(scores).reduce((a, b) => a + b, 0);

    // Save review to history
    setHistory(h => [{ id: resume.id, year: resume.candidates?.year, scores: { ...scores }, total: total_score, decision: type, notes: notes || "No notes added." }, ...h]);
    setReviewed(r => r + 1);

    // Post to server
    try {
      const res = await authedFetch(`${API}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume_id: resume.id, scores, notes, decision: type }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Could not save review");
      }
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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: css.bgLight, color: css.textDark, fontFamily: "'DM Sans', sans-serif", fontSize: 13, overflow: "hidden" }}>
      <Topbar reviewed={reviewed} onHistory={() => setDrawerOpen(true)} historyCount={history.length} />

      <div style={{ flex: 1, overflow: "hidden", padding: "14px 22px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        <CandidateRow resume={resume} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.35fr", gap: 14, flex: 1, minHeight: 0, overflow: "hidden" }}>
          {/* ── Left: Resume panel ── */}
          <div ref={panelRef} style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* PDF view */}
            {loading ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: css.textGray, fontSize: 13 }}>
                <div style={{ width: 36, height: 36, border: `3px solid ${css.borderLight}`, borderTopColor: css.greenDark, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                Loading resume…
              </div>
            ) : resume?.file_url ? (
              <PdfViewer url={`http://localhost:3000/view/pdf?url=${encodeURIComponent(resume.file_url)}`} authToken={token} />
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: css.textGray, fontSize: 13 }}>No resume available</div>
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
