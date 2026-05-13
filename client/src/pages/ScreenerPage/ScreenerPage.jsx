import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, useAuthedFetch } from "../../auth/AuthContext";
import { css } from "../../theme/colors";
import { METRICS } from "../../constants/config";

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
  const [myReviews, setMyReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const panelRef = useRef(null);

  const scoringComplete = useMemo(
    () =>
      METRICS.every(
        (m) => typeof scores[m] === "number" && scores[m] >= 1 && scores[m] <= 6
      ),
    [scores]
  );

  const fetchMyReviews = useCallback(async (opts = {}) => {
    const showLoading = opts.showLoading !== false;
    if (showLoading) setReviewsLoading(true);
    try {
      const res = await authedFetch(`${API}/reviews`);
      if (!res.ok) {
        setMyReviews([]);
        return;
      }
      const data = await res.json();
      setMyReviews(Array.isArray(data.reviews) ? data.reviews : []);
    } catch (e) {
      console.error("Could not load my reviews:", e);
      setMyReviews([]);
    } finally {
      if (showLoading) setReviewsLoading(false);
    }
  }, [authedFetch]);

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
  useEffect(() => { fetchMyReviews({ showLoading: false }); }, [fetchMyReviews]);

  useEffect(() => {
    if (!drawerOpen) return;
    fetchMyReviews({ showLoading: true });
  }, [drawerOpen, fetchMyReviews]);

  async function handleAction(type) {
    if (!scoringComplete) return;

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
      await fetchMyReviews({ showLoading: false });
    } catch (e) {
      console.warn("Could not get reviews:", e);
      return;
    }

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
      <Topbar
        reviewed={myReviews.length}
        onHistory={() => setDrawerOpen(true)}
        historyCount={myReviews.length}
      />

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
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", gap: 8, minHeight: 0 }}>
            {!loading && resume ? (
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <ScoringPanel
                  resume={resume}
                  scores={scores}
                  onScore={(metric, val) => setScores(s => ({ ...s, [metric]: val }))}
                  notes={notes}
                  onNotes={setNotes}
                  onAction={handleAction}
                  scoringComplete={scoringComplete}
                />
              </div>
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: css.text3, fontSize: 13 }}>Loading…</div>
            )}
          </div>
        </div>
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        reviews={myReviews}
        loading={reviewsLoading}
      />
    </div>
  );
}
