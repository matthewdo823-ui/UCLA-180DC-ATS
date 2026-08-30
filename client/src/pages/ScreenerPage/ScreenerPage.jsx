import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth, useAuthedFetch } from "../../auth/AuthContext";
import { isAdminRole } from "../../utils/auth";
import { css } from "../../theme/colors";
import { API } from "../../constants/config";
import { invalidateAfterReview } from "../../lib/queryKeys";
import { useActiveCycle } from "../../hooks/useActiveCycle";
import { FRQ_MAX_SCORE } from "../../constants/frq";
import { formatReviewCount } from "../../utils/reviewCounts";
import { rubricFromSnapshot } from "../../utils/rubric";

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

function GradingModeToggle({ mode, onChange, disabled = false }) {
  const options = [
    { id: GRADING_MODES.RESUME, label: "Resume" },
    { id: GRADING_MODES.FRQ, label: "Free response" },
  ];

  return (
    <div
      style={{
        display: "inline-flex",
        alignSelf: "flex-start",
        width: "fit-content",
        maxWidth: "100%",
        padding: 3,
        gap: 2,
        borderRadius: 999,
        border: `1px solid ${css.borderLight}`,
        background: "rgba(40, 98, 65, 0.05)",
      }}
    >
      {options.map(({ id, label }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(id)}
            style={{
              ...topbarGhostButtonStyle,
              border: "none",
              borderRadius: 999,
              margin: 0,
              boxShadow: active ? "0 1px 3px rgba(40,98,65,0.14)" : "none",
              padding: "5px 10px",
              minHeight: 28,
              fontSize: 11,
              background: active ? css.cardWhite : "transparent",
              color: active ? css.greenDark : css.textGray,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.65 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              whiteSpace: "nowrap",
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
  const [resumeNotes, setResumeNotes] = useState("");
  const [resumeEditingReviewId, setResumeEditingReviewId] = useState(null);
  const [resumeRubricSnapshot, setResumeRubricSnapshot] = useState(null);
  const [frqScore, setFrqScore] = useState(null);
  const [frqNotes, setFrqNotes] = useState("");
  const [frqEditingReviewId, setFrqEditingReviewId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [myReviews, setMyReviews] = useState([]);
  const [myFrqReviews, setMyFrqReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pastReviewDetail, setPastReviewDetail] = useState(null);
  const [celebrationKey, setCelebrationKey] = useState(0);
  const [submittingAction, setSubmittingAction] = useState(null);
  const submittingRef = useRef(false);
  const panelRef = useRef(null);
  const gradingContextRef = useRef({
    resumeId: null,
    data: null,
    resumeHydrated: false,
    frqHydrated: false,
  });

  const graderName = `${user?.first_name || ""} ${user?.last_name || ""}`.trim();
  const specialCelebrationName = ["ryan chao", "matthew do"].includes(graderName.toLowerCase()) ? graderName : "";

  const location = useLocation();
  const navigate = useNavigate();

  // Open the past-reviews queue when navigated here from the dashboard's "Past reviews" link.
  useEffect(() => {
    if (location.state?.openPastQueue) {
      setDrawerOpen(true);
      // Clear the flag so the drawer doesn't reopen on re-render or back navigation.
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  const isFrqMode = gradingMode === GRADING_MODES.FRQ;

  const rubric = useMemo(
    () => rubricFromSnapshot(resumeRubricSnapshot) || getYearRubric(resume?.candidates?.year),
    [getYearRubric, resume?.candidates?.year, resumeRubricSnapshot]
  );

  const maxPerCategory = rubric?.maxPerCategory || 4;

  const resumeScoringComplete = useMemo(
    () =>
      Boolean(rubric?.metrics?.length) &&
      rubric.metrics.every(
        (m) => typeof scores[m] === "number" && scores[m] >= 0 && scores[m] <= maxPerCategory
      ),
    [scores, rubric, maxPerCategory]
  );

  const frqScoringComplete = useMemo(
    () => typeof frqScore === "number" && frqScore >= 0 && frqScore <= FRQ_MAX_SCORE,
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
        setResumeEditingReviewId(null);
        return;
      }
      const data = await res.json();
      setResume(data);
      setScores(review.scores || {});
      setResumeNotes(review.notes ?? "");
      setResumeEditingReviewId(data.reviewId || reviewId || null);
      setResumeRubricSnapshot(review.rubricSnapshot || null);
      setFrqScore(null);
      setFrqNotes("");
      setFrqEditingReviewId(null);
      gradingContextRef.current = {
        resumeId: data.id,
        data: null,
        resumeHydrated: true,
        frqHydrated: false,
      };
    } catch (e) {
      console.error("Load reviewed resume failed:", e);
      setFetchError("Could not load resume");
      setResume(null);
      setResumeEditingReviewId(null);
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
        setFrqEditingReviewId(null);
        return;
      }
      const data = await res.json();
      setResume(data);
      setFrqScore(typeof data.frqScore === "number" ? data.frqScore : null);
      setFrqNotes(data.notes ?? "");
      setFrqEditingReviewId(data.reviewId || reviewId);
      setScores({});
      setResumeNotes("");
      setResumeEditingReviewId(null);
      setResumeRubricSnapshot(null);
      gradingContextRef.current = {
        resumeId: data.id,
        data: null,
        resumeHydrated: false,
        frqHydrated: true,
      };
    } catch (e) {
      console.error("Load FRQ review failed:", e);
      setFetchError("Could not load candidate");
      setResume(null);
      setFrqEditingReviewId(null);
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
      setResumeNotes("");
      setResumeEditingReviewId(null);
      setResumeRubricSnapshot(null);
      setFrqScore(null);
      setFrqNotes("");
      setFrqEditingReviewId(null);
      gradingContextRef.current = {
        resumeId: data.id,
        data: null,
        resumeHydrated: true,
        frqHydrated: false,
      };
    } catch (e) {
      console.error("Fetch failed:", e);
      setFetchError("Could not load next resume");
      setResume(null);
      setResumeEditingReviewId(null);
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
      setFrqNotes("");
      setFrqEditingReviewId(null);
      setScores({});
      setResumeNotes("");
      setResumeEditingReviewId(null);
      setResumeRubricSnapshot(null);
      gradingContextRef.current = {
        resumeId: data.id,
        data: null,
        resumeHydrated: false,
        frqHydrated: true,
      };
    } catch (e) {
      console.error("Fetch FRQ failed:", e);
      setFetchError("Could not load next candidate");
      setResume(null);
      setFrqEditingReviewId(null);
    } finally {
      setLoading(false);
    }
  }, [authedFetch, activeRound]);

  useEffect(() => {
    if (!cycleLoading) fetchNextResume();
  }, [fetchNextResume, cycleLoading]);

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
    if (submittingRef.current) return;

    if (!resumeScoringComplete) {
      setShowValidationErrors(true);
      setSubmitError("Complete every resume rubric category before submitting.");
      return;
    }

    setShowValidationErrors(false);
    setSubmitError("");
    submittingRef.current = true;
    setSubmittingAction(type);

    const payload = { scores, notes: resumeNotes, decision: type };

    try {
      const res = resumeEditingReviewId
        ? await authedFetch(`${API}/reviews/${encodeURIComponent(resumeEditingReviewId)}`, {
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
      // The API only responds successfully after Supabase has accepted the
      // review. Celebrate that confirmed result, never the click itself.
      setCelebrationKey((key) => key + 1);
      setResumeEditingReviewId(null);
      await fetchMyReviews({ showLoading: false });
      // This review changes the scoreboard, the dashboard counts and this
      // grader's coverage — expire them so those pages don't serve a cached
      // number that's now one review out of date.
      invalidateAfterReview(queryClient);

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
    } catch (e) {
      console.warn("Could not save review:", e);
    } finally {
      submittingRef.current = false;
      setSubmittingAction(null);
    }
  }

  async function handleFrqComplete() {
    if (submittingRef.current) return;

    if (!frqScoringComplete) {
      setShowValidationErrors(true);
      setSubmitError("Complete the free-response grade before submitting.");
      return;
    }
    setShowValidationErrors(false);
    setSubmitError("");
    submittingRef.current = true;
    setSubmittingAction("frq");

    const payload = { score: frqScore, notes: frqNotes };

    try {
      const res = frqEditingReviewId
        ? await authedFetch(`${API}/frq-reviews/${encodeURIComponent(frqEditingReviewId)}`, {
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
      // Keep both grading modes consistent: celebrate exactly once, and only
      // after the API confirms that Supabase accepted the awaited write.
      setCelebrationKey((key) => key + 1);
      setFrqEditingReviewId(null);
      await fetchMyFrqReviews({ showLoading: false });
      invalidateAfterReview(queryClient);

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
    } catch (e) {
      console.warn("Could not save FRQ grade:", e);
    } finally {
      submittingRef.current = false;
      setSubmittingAction(null);
    }
  }

  function handleResumeReset() {
    setScores({});
    setResumeNotes("");
    setSubmitError("");
    setShowValidationErrors(false);
  }

  async function handleGradingModeChange(nextMode) {
    if (nextMode === gradingMode) return true;
    setFetchError("");
    setSubmitError("");
    setShowValidationErrors(false);
    setDrawerOpen(false);
    setPastReviewDetail(null);

    if (!resume?.id) {
      setGradingMode(nextMode);
      return true;
    }

    const resumeId = resume.id;
    const previousMode = gradingMode;
    setLoading(true);

    try {
      let context = gradingContextRef.current;
      let data = context.resumeId === resumeId ? context.data : null;

      if (!data) {
        const res = await authedFetch(`${API}/resume/${encodeURIComponent(resumeId)}/grading-context`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Could not load this candidate's grading details");
        }
        data = await res.json();
        context = context.resumeId === resumeId
          ? { ...context, data }
          : { resumeId, data, resumeHydrated: false, frqHydrated: false };
      }

      if (nextMode === GRADING_MODES.RESUME && !context.resumeHydrated) {
        const review = data.resumeReview;
        setScores(review?.scores || {});
        setResumeNotes(review?.notes || "");
        setResumeEditingReviewId(review?.reviewId || null);
        setResumeRubricSnapshot(review?.rubricSnapshot || null);
        context = { ...context, resumeHydrated: true };
      }

      if (nextMode === GRADING_MODES.FRQ && !context.frqHydrated) {
        const review = data.frqReview;
        setFrqScore(typeof review?.score === "number" ? review.score : null);
        setFrqNotes(review?.notes || "");
        setFrqEditingReviewId(review?.reviewId || null);
        context = { ...context, frqHydrated: true };
      }

      gradingContextRef.current = context;
      setResume(data);
      setGradingMode(nextMode);
      return true;
    } catch (error) {
      setGradingMode(previousMode);
      setFetchError(error.message || "Could not switch grading modes");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function openPastReviews(nextMode) {
    const switched = await handleGradingModeChange(nextMode);
    if (switched) setDrawerOpen(true);
  }

  const screeningBlocked = !cycleLoading && (!activeRound || cycleError || !isResumeRound);
  const topbarRightSlot = (
    <>
      <button type="button" onClick={() => { void openPastReviews(GRADING_MODES.RESUME); }} style={topbarGhostButtonStyle}>
        📋 {formatReviewCount(myReviews.length, "resume")}
      </button>
      {isAdmin ? (
        <button type="button" onClick={() => { void openPastReviews(GRADING_MODES.FRQ); }} style={topbarGhostButtonStyle}>
          📝 {formatReviewCount(myFrqReviews.length, "free response")}
        </button>
      ) : null}
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
        {isAdmin && isResumeRound && !screeningBlocked ? (
          <GradingModeToggle
            mode={gradingMode}
            onChange={handleGradingModeChange}
            disabled={loading || Boolean(submittingAction)}
          />
        ) : null}
        {showValidationErrors && submitError ? (
          <div
            role="alert"
            style={{
              padding: "10px 14px",
              borderRadius: 9,
              border: `1px solid ${css.red}`,
              background: "rgba(197,48,48,0.07)",
              color: css.red,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {submitError}
          </div>
        ) : null}

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
                      notes={frqNotes}
                      onNotes={setFrqNotes}
                      onComplete={handleFrqComplete}
                      scoringComplete={frqScoringComplete}
                      submitError={submitError}
                      submitting={Boolean(submittingAction)}
                    />
                  ) : (
                    <ScoringPanel
                      rubric={rubric}
                      scores={scores}
                      onScore={(metric, val) => setScores((s) => ({ ...s, [metric]: val }))}
                      notes={resumeNotes}
                      onNotes={setResumeNotes}
                      onAction={handleResumeAction}
                      onReset={handleResumeReset}
                      scoringComplete={resumeScoringComplete}
                      submitError={submitError}
                      submittingAction={submittingAction}
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
