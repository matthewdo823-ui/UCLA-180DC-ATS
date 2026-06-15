import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, useAuthedFetch } from "../../auth/AuthContext";
import { css } from "../../theme/colors";
import { API } from "../../constants/config";
import { useActiveCycle } from "../../hooks/useActiveCycle";

import Topbar from "../../components/Topbar/Topbar";
import CandidateRow from "../../components/CandidateRow/CandidateRow";
import PdfViewer from "../../components/PdfViewer/PdfViewer";
import ScoringPanel from "../../components/ScoringPanel/ScoringPanel";
import Drawer from "../../components/Drawer/Drawer";
import PastReviewDetailModal from "../../components/PastReviewDetailModal/PastReviewDetailModal";

export default function ScreenerPage() {
  const { token } = useAuth();
  const authedFetch = useAuthedFetch();
  const { activeRound, loading: cycleLoading, error: cycleError, getYearRubric, phaseLabel, isResumeRound } = useActiveCycle();
  const [resume, setResume] = useState(null);
  const [scores, setScores] = useState({});
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [myReviews, setMyReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pastReviewDetail, setPastReviewDetail] = useState(null);
  const [editingReviewId, setEditingReviewId] = useState(null);
  const panelRef = useRef(null);

  const rubric = useMemo(
    () => getYearRubric(resume?.candidates?.year),
    [getYearRubric, resume?.candidates?.year]
  );

  const maxPerCategory = rubric?.maxPerCategory || 4;

  const scoringComplete = useMemo(
    () =>
      Boolean(rubric?.metrics?.length) &&
      rubric.metrics.every(
        (m) => typeof scores[m] === "number" && scores[m] >= 1 && scores[m] <= maxPerCategory
      ),
    [scores, rubric, maxPerCategory]
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

  const loadReviewedResume = useCallback(async (review) => {
    const reviewId = review?.reviewId ? String(review.reviewId).trim() : "";
    const resumeId = review?.resumeId || review?.id;
    if (!reviewId && !resumeId) return;

    try {
      setLoading(true);
      setFetchError("");
      setSubmitError("");
      const url = reviewId
        ? `${API}/reviews/${encodeURIComponent(reviewId)}/resume`
        : `${API}/resume/${encodeURIComponent(String(resumeId).trim())}`;
      const res = await authedFetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFetchError(body.error || "Could not load resume");
        setResume(null);
        setEditingReviewId(null);
        return;
      }
      const data = await res.json();
      setResume(data);
      setScores(review.scores || {});
      setNotes(review.notes ?? "");
      setEditingReviewId(data.reviewId || reviewId || null);
    } catch (e) {
      console.error("Load reviewed resume failed:", e);
      setFetchError("Could not load resume");
      setResume(null);
      setEditingReviewId(null);
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  const fetchNext = useCallback(async () => {
    if (!activeRound) {
      setResume(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setFetchError("");
      setSubmitError("");
      const res = await authedFetch(`${API}/next-resume`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFetchError(body.error || "No resumes available");
        setResume(null);
        return;
      }
      const data = await res.json();
      setResume(data);
      setScores({});
      setNotes("");
      setEditingReviewId(null);
    } catch (e) {
      console.error("Fetch failed:", e);
      setFetchError("Could not load next resume");
      setResume(null);
      setEditingReviewId(null);
    } finally {
      setLoading(false);
    }
  }, [authedFetch, activeRound]);

  useEffect(() => { if (!cycleLoading) fetchNext(); }, [fetchNext, cycleLoading]);
  useEffect(() => { fetchMyReviews({ showLoading: false }); }, [fetchMyReviews]);

  useEffect(() => {
    if (!drawerOpen) return;
    fetchMyReviews({ showLoading: true });
  }, [drawerOpen, fetchMyReviews]);

  async function handleAction(type) {
    if (!scoringComplete) return;
    setSubmitError("");

    const payload = { scores, notes, decision: type };

    try {
      const res = editingReviewId
        ? await authedFetch(`${API}/reviews/${encodeURIComponent(editingReviewId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await authedFetch(`${API}/reviews`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resume_id: resume.id, ...payload }),
          });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        const message = error.error || "Could not save review";
        setSubmitError(message);
        throw new Error(message);
      }
      setEditingReviewId(null);
      await fetchMyReviews({ showLoading: false });
    } catch (e) {
      console.warn("Could not save review:", e);
      return;
    }

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

  const screeningBlocked = !cycleLoading && (!activeRound || cycleError || !isResumeRound);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: css.bgLight, color: css.textDark, fontFamily: "'DM Sans', sans-serif", fontSize: 13, overflow: "hidden" }}>
      <Topbar
        phaseLabel={phaseLabel}
        reviewed={myReviews.length}
        onHistory={() => setDrawerOpen(true)}
        historyCount={myReviews.length}
      />

      <div style={{ flex: 1, overflow: "hidden", padding: "14px 22px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        <CandidateRow resume={resume} />

        {screeningBlocked ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div style={{ maxWidth: 420, textAlign: "center", color: css.textGray, fontSize: 14, lineHeight: 1.5 }}>
              {cycleError || (activeRound && !isResumeRound
                ? `Resume screening is closed. The active round is ${activeRound?.name || "interviews"} — use Grading in the sidebar.`
                : "Resume screening is not open. An admin must activate a cycle and its resume round.")}
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.35fr", gap: 14, flex: 1, minHeight: 0, overflow: "hidden" }}>
            <div ref={panelRef} style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {loading || cycleLoading ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: css.textGray, fontSize: 13 }}>
                  <div style={{ width: 36, height: 36, border: `3px solid ${css.borderLight}`, borderTopColor: css.greenDark, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  Loading resume…
                </div>
              ) : resume?.file_url ? (
                <PdfViewer url={`${API}/view/pdf?url=${encodeURIComponent(resume.file_url)}`} authToken={token} />
              ) : (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: css.textGray, fontSize: 13, padding: 24, textAlign: "center" }}>
                  {fetchError || "No resume available"}
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", gap: 8, minHeight: 0 }}>
              {!loading && !cycleLoading && resume ? (
                <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <ScoringPanel
                    rubric={rubric}
                    scores={scores}
                    onScore={(metric, val) => setScores(s => ({ ...s, [metric]: val }))}
                    notes={notes}
                    onNotes={setNotes}
                    onAction={handleAction}
                    scoringComplete={scoringComplete}
                    submitError={submitError}
                  />
                </div>
              ) : (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: css.text3, fontSize: 13 }}>Loading…</div>
              )}
            </div>
          </div>
        )}
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        reviews={myReviews}
        loading={reviewsLoading}
        onReviewClick={(r) => setPastReviewDetail(r)}
      />

      {pastReviewDetail ? (
        <PastReviewDetailModal
          review={pastReviewDetail}
          onClose={() => setPastReviewDetail(null)}
          onSaved={(updated) => {
            setMyReviews((prev) => prev.map((x) => (x.reviewId === updated.reviewId ? updated : x)));
            setPastReviewDetail(updated);
          }}
          onOpenInScreener={(review) => {
            setPastReviewDetail(null);
            setDrawerOpen(false);
            loadReviewedResume(review);
          }}
        />
      ) : null}
    </div>
  );
}
