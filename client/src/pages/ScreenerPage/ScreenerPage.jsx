import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth, useAuthedFetch } from "../../auth/AuthContext";
import { isAdminRole } from "../../utils/auth";
import { css } from "../../theme/colors";
import { API } from "../../constants/config";
import { invalidateAfterReview } from "../../lib/queryKeys";
import { useActiveCycle } from "../../hooks/useActiveCycle";
import { FRQ_MAX_SCORE } from "../../constants/frq";

import Topbar, { topbarGhostButtonStyle } from "../../components/Topbar/Topbar";
import CandidateRow from "../../components/CandidateRow/CandidateRow";
import PdfViewer from "../../components/PdfViewer/PdfViewer";
import ScoringPanel from "../../components/ScoringPanel/ScoringPanel";
import FrqResponsesPanel from "../../components/FrqScoringPanel/FrqResponsesPanel";
import FrqScoringPanel from "../../components/FrqScoringPanel/FrqScoringPanel";
import Drawer from "../../components/Drawer/Drawer";
import FrqDrawer from "../../components/FrqScoringPanel/FrqDrawer";
import GradeCelebration from "../../components/GradeCelebration/GradeCelebration";
import PastReviewDetailModal from "../../components/PastReviewDetailModal/PastReviewDetailModal";
import PageLoader from "../../components/PageLoader";

const GRADING_MODES = {
  RESUME: "resume",
  FRQ: "frq",
};

function GradingModeToggle({ mode, onChange }) {
  const options = [
    { id: GRADING_MODES.RESUME, label: "Resume" },
    { id: GRADING_MODES.FRQ, label: "Free response" },
  ];

  return (
    <div
      style={{
        display: "inline-flex",
        borderRadius: 20,
        border: `1px solid ${css.borderLight}`,
        overflow: "hidden",
        background: css.cardWhite,
        marginRight: 8,
      }}
    >
      {options.map(({ id, label }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            style={{
              ...topbarGhostButtonStyle,
              border: "none",
              borderRadius: 0,
              margin: 0,
              boxShadow: "none",
              padding: "6px 12px",
              fontSize: 11,
              background: active ? css.greenDark : css.cardWhite,
              color: active ? css.cardWhite : css.textGray,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default function ScreenerPage() {
  const { token, user } = useAuth();
  const authedFetch = useAuthedFetch();
  const queryClient = useQueryClient();
  const isAdmin = isAdminRole(user?.role);
  const { activeRound, loading: cycleLoading, error: cycleError, getYearRubric, phaseLabel, isResumeRound } = useActiveCycle();

  const [gradingMode, setGradingMode] = useState(GRADING_MODES.RESUME);
  const [resume, setResume] = useState(null);
  const [scores, setScores] = useState({});
  const [frqScore, setFrqScore] = useState(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [myReviews, setMyReviews] = useState([]);
  const [myFrqReviews, setMyFrqReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pastReviewDetail, setPastReviewDetail] = useState(null);
  const [editingReviewId, setEditingReviewId] = useState(null);
  const [celebrationKey, setCelebrationKey] = useState(0);
  const panelRef = useRef(null);

  const graderName = `${user?.first_name || ""} ${user?.last_name || ""}`.trim();
  const specialCelebrationName = ["ryan chao", "matthew do"].includes(graderName.toLowerCase()) ? graderName : "";

  const isFrqMode = gradingMode === GRADING_MODES.FRQ;

  const rubric = useMemo(
    () => getYearRubric(resume?.candidates?.year),
    [getYearRubric, resume?.candidates?.year]
  );

  const maxPerCategory = rubric?.maxPerCategory || 4;

  const resumeScoringComplete = useMemo(
    () =>
      Boolean(rubric?.metrics?.length) &&
      rubric.metrics.every(
        (m) => typeof scores[m] === "number" && scores[m] >= 1 && scores[m] <= maxPerCategory
      ),
    [scores, rubric, maxPerCategory]
  );

  const frqScoringComplete = useMemo(
    () => typeof frqScore === "number" && frqScore >= 1 && frqScore <= FRQ_MAX_SCORE,
    [frqScore]
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

  const fetchMyFrqReviews = useCallback(async (opts = {}) => {
    const showLoading = opts.showLoading !== false;
    if (showLoading) setReviewsLoading(true);
    try {
      const res = await authedFetch(`${API}/frq-reviews`);
      if (!res.ok) {
        setMyFrqReviews([]);
        return;
      }
      const data = await res.json();
      setMyFrqReviews(Array.isArray(data.reviews) ? data.reviews : []);
    } catch (e) {
      console.error("Could not load FRQ reviews:", e);
      setMyFrqReviews([]);
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

  const loadReviewedFrq = useCallback(async (review) => {
    const reviewId = review?.reviewId ? String(review.reviewId).trim() : "";
    if (!reviewId) return;

    try {
      setLoading(true);
      setFetchError("");
      setSubmitError("");
      const res = await authedFetch(`${API}/frq-reviews/${encodeURIComponent(reviewId)}/candidate`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFetchError(body.error || "Could not load candidate");
        setResume(null);
        setEditingReviewId(null);
        return;
      }
      const data = await res.json();
      setResume(data);
      setFrqScore(typeof data.frqScore === "number" ? data.frqScore : null);
      setNotes(data.notes ?? "");
      setEditingReviewId(data.reviewId || reviewId);
    } catch (e) {
      console.error("Load FRQ review failed:", e);
      setFetchError("Could not load candidate");
      setResume(null);
      setEditingReviewId(null);
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  const fetchNextResume = useCallback(async () => {
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

  const fetchNextFrq = useCallback(async () => {
    if (!activeRound) {
      setResume(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setFetchError("");
      setSubmitError("");
      const res = await authedFetch(`${API}/next-frq`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFetchError(body.error || "No candidates available");
        setResume(null);
        return;
      }
      const data = await res.json();
      setResume(data);
      setFrqScore(null);
      setNotes("");
      setEditingReviewId(null);
    } catch (e) {
      console.error("Fetch FRQ failed:", e);
      setFetchError("Could not load next candidate");
      setResume(null);
      setEditingReviewId(null);
    } finally {
      setLoading(false);
    }
  }, [authedFetch, activeRound]);

  const fetchNext = isFrqMode ? fetchNextFrq : fetchNextResume;

  useEffect(() => {
    if (!cycleLoading) fetchNext();
  }, [fetchNext, cycleLoading]);

  useEffect(() => {
    fetchMyReviews({ showLoading: false });
    if (isAdmin) fetchMyFrqReviews({ showLoading: false });
  }, [fetchMyReviews, fetchMyFrqReviews, isAdmin]);

  useEffect(() => {
    if (!drawerOpen) return;
    if (isFrqMode) fetchMyFrqReviews({ showLoading: true });
    else fetchMyReviews({ showLoading: true });
  }, [drawerOpen, isFrqMode, fetchMyFrqReviews, fetchMyReviews]);

  useEffect(() => {
    if (!isAdmin && gradingMode === GRADING_MODES.FRQ) {
      setGradingMode(GRADING_MODES.RESUME);
    }
  }, [isAdmin, gradingMode]);

  useEffect(() => {
    if (!celebrationKey) return undefined;
    const timeout = setTimeout(() => setCelebrationKey(0), specialCelebrationName ? 2600 : 1800);
    return () => clearTimeout(timeout);
  }, [celebrationKey, specialCelebrationName]);

  async function handleResumeAction(type) {
    if (!resumeScoringComplete) return;
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
      // This review changes the scoreboard, the dashboard counts and this
      // grader's coverage — expire them so those pages don't serve a cached
      // number that's now one review out of date.
      invalidateAfterReview(queryClient);
      setCelebrationKey((key) => key + 1);
    } catch (e) {
      console.warn("Could not save review:", e);
      return;
    }

    if (panelRef.current) panelRef.current.style.animation = "cardFlyOut 0.28s ease forwards";
    await new Promise((r) => setTimeout(r, 280));
    await fetchNextResume();
    if (panelRef.current) {
      panelRef.current.style.animation = "";
      void panelRef.current?.offsetWidth;
      panelRef.current.style.animation = "cardFlyIn 0.28s ease forwards";
      setTimeout(() => {
        if (panelRef.current) panelRef.current.style.animation = "";
      }, 300);
    }
  }

  async function handleFrqComplete() {
    if (!frqScoringComplete) return;
    setSubmitError("");

    const payload = { score: frqScore, notes };

    try {
      const res = editingReviewId
        ? await authedFetch(`${API}/frq-reviews/${encodeURIComponent(editingReviewId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await authedFetch(`${API}/frq-reviews`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resume_id: resume.id, ...payload }),
          });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        const message = error.error || "Could not save FRQ grade";
        setSubmitError(message);
        throw new Error(message);
      }
      setEditingReviewId(null);
      await fetchMyFrqReviews({ showLoading: false });
      invalidateAfterReview(queryClient);
    } catch (e) {
      console.warn("Could not save FRQ grade:", e);
      return;
    }

    if (panelRef.current) panelRef.current.style.animation = "cardFlyOut 0.28s ease forwards";
    await new Promise((r) => setTimeout(r, 280));
    await fetchNextFrq();
    if (panelRef.current) {
      panelRef.current.style.animation = "";
      void panelRef.current?.offsetWidth;
      panelRef.current.style.animation = "cardFlyIn 0.28s ease forwards";
      setTimeout(() => {
        if (panelRef.current) panelRef.current.style.animation = "";
      }, 300);
    }
  }

  function handleGradingModeChange(nextMode) {
    if (nextMode === gradingMode) return;
    setGradingMode(nextMode);
    setResume(null);
    setScores({});
    setFrqScore(null);
    setNotes("");
    setEditingReviewId(null);
    setFetchError("");
    setSubmitError("");
    setDrawerOpen(false);
    setPastReviewDetail(null);
  }

  const screeningBlocked = !cycleLoading && (!activeRound || cycleError || !isResumeRound);
  const doneCount = isFrqMode ? myFrqReviews.length : myReviews.length;

  const topbarRightSlot = (
    <>
      {isAdmin && isResumeRound && !screeningBlocked ? (
        <GradingModeToggle mode={gradingMode} onChange={handleGradingModeChange} />
      ) : null}
      <button type="button" onClick={() => setDrawerOpen(true)} style={topbarGhostButtonStyle}>
        📋 {isFrqMode ? "Past FRQ Grades" : "Past Reviews"}
        <span style={{ background: css.greenDark, color: css.cardWhite, borderRadius: 20, fontSize: 10, fontWeight: 700, padding: "2px 7px" }}>
          {doneCount}
        </span>
      </button>
      <div style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        border: `1px solid ${css.greenDark}`,
        background: "rgba(40, 98, 65, 0.08)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        marginLeft: 8,
      }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: css.greenDark, lineHeight: 1 }}>{doneCount}</span>
        <span style={{ fontSize: 7, fontWeight: 700, color: css.greenDark, textTransform: "uppercase", letterSpacing: "0.02em", marginTop: 1 }}>done</span>
      </div>
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: css.bgLight, color: css.textDark, fontFamily: "'DM Sans', sans-serif", fontSize: 13, overflow: "hidden" }}>
      <GradeCelebration key={celebrationKey} active={Boolean(celebrationKey)} specialCelebrationName={specialCelebrationName} />
      <Topbar
        phaseLabel={phaseLabel}
        activeLabel={isFrqMode ? "FRQ grading" : "Resume grading"}
        rightSlot={topbarRightSlot}
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
                <PageLoader />
              ) : isFrqMode ? (
                resume ? (
                  <FrqResponsesPanel candidate={resume} />
                ) : (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: css.textGray, fontSize: 13, padding: 24, textAlign: "center" }}>
                    {fetchError || "No candidates available"}
                  </div>
                )
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
                  {isFrqMode ? (
                    <FrqScoringPanel
                      score={frqScore}
                      onScore={setFrqScore}
                      notes={notes}
                      onNotes={setNotes}
                      onComplete={handleFrqComplete}
                      scoringComplete={frqScoringComplete}
                      submitError={submitError}
                    />
                  ) : (
                    <ScoringPanel
                      rubric={rubric}
                      scores={scores}
                      onScore={(metric, val) => setScores((s) => ({ ...s, [metric]: val }))}
                      notes={notes}
                      onNotes={setNotes}
                      onAction={handleResumeAction}
                      scoringComplete={resumeScoringComplete}
                      submitError={submitError}
                    />
                  )}
                </div>
              ) : (
                <PageLoader />
              )}
            </div>
          </div>
        )}
      </div>

      {isFrqMode ? (
        <FrqDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          reviews={myFrqReviews}
          loading={reviewsLoading}
          onReviewClick={(r) => {
            setDrawerOpen(false);
            loadReviewedFrq(r);
          }}
        />
      ) : (
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          reviews={myReviews}
          loading={reviewsLoading}
          onReviewClick={(r) => setPastReviewDetail(r)}
        />
      )}

      {!isFrqMode && pastReviewDetail ? (
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
