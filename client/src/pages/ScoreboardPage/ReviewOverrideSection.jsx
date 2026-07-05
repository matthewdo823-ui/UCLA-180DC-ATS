import { useEffect, useMemo, useState } from "react";
import { css } from "../../theme/colors";
import MetricRow from "../../components/ScoringPanel/MetricRow";
import { formatScore } from "../../utils/format";
import useReviewOverrides from "./useReviewOverrides";

const cardGreen = "#085041";
const cardPale = "#EAF3DE";

function getReviewerLabel(review, index) {
  return review?.reviewerName || review?.reviewerEmail || `Reviewer ${index + 1}`;
}

function getReviewRawTotal(review) {
  return Object.values(review?.scores ?? {}).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0
  );
}

function getReviewScoreLabel(review) {
  const total = getReviewRawTotal(review);
  const max = review?.maxScore || Object.keys(review?.scores || {}).length * 4 || 24;
  return `${formatScore(total)}/${max} pts`;
}

function scoresMatch(a = {}, b = {}) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (String(Number(a[key])) !== String(Number(b[key]))) return false;
  }
  return true;
}

function getBaselineScores(review) {
  return review?.sourceScores || review?.scores || {};
}

function getEffectiveScores(review, override) {
  if (override?.overrideScores) return override.overrideScores;
  if (review?.adminOverride?.overrideScores) return review.adminOverride.overrideScores;
  return review?.scores || {};
}

export default function ReviewOverrideSection({
  resumeId,
  reviews = [],
  metrics = [],
  maxPerCategory = 4,
  onOverrideSaved,
}) {
  const {
    overrideByReviewId,
    loading,
    savingReviewId,
    saveError,
    save,
  } = useReviewOverrides(resumeId);

  const [selectedReviewId, setSelectedReviewId] = useState("");
  const [scores, setScores] = useState({});
  const [notes, setNotes] = useState("");

  const reviewMetrics = useMemo(() => {
    if (metrics.length) return metrics;
    const selected = reviews.find(row => row.id === selectedReviewId);
    return Object.keys(selected?.scores || {});
  }, [metrics, reviews, selectedReviewId]);

  const reviewOptions = useMemo(
    () => (reviews || []).map((review, index) => {
      const override = overrideByReviewId[review.id] || review?.adminOverride;
      const hasOverride = Boolean(override?.overrideScores);
      return {
        review,
        index,
        label: getReviewerLabel(review, index),
        scoreLabel: getReviewScoreLabel(hasOverride ? { ...review, scores: override.overrideScores } : review),
        hasOverride,
      };
    }),
    [reviews, overrideByReviewId]
  );

  useEffect(() => {
    if (loading) return;
    if (!reviewOptions.length) {
      setSelectedReviewId("");
      setScores({});
      setNotes("");
      return;
    }

    const stillValid = reviewOptions.some(opt => opt.review.id === selectedReviewId);
    const nextId = stillValid ? selectedReviewId : reviewOptions[0].review.id;
    if (nextId !== selectedReviewId) {
      setSelectedReviewId(nextId);
    }
  }, [loading, reviewOptions, selectedReviewId]);

  useEffect(() => {
    if (!selectedReviewId) return;
    const review = reviews.find(row => row.id === selectedReviewId);
    const override = overrideByReviewId[selectedReviewId] || review?.adminOverride;
    setNotes(override?.adminNotes || "");
    setScores(getEffectiveScores(review, override));
  }, [selectedReviewId, reviews, overrideByReviewId]);

  const selectedReview = reviews.find(row => row.id === selectedReviewId);
  const activeOverride = selectedReviewId
    ? overrideByReviewId[selectedReviewId] || selectedReview?.adminOverride
    : null;
  const isOverridden = Boolean(activeOverride?.overrideScores);
  const baselineScores = selectedReview ? getBaselineScores(selectedReview) : {};

  const hasChanges =
    notes !== (activeOverride?.adminNotes || "") ||
    !scoresMatch(scores, getEffectiveScores(selectedReview, activeOverride));

  const handleMetricScore = (metric, value) => {
    setScores(prev => ({ ...prev, [metric]: value }));
  };

  const handleSave = async () => {
    if (!selectedReviewId) return;
    const result = await save({
      reviewId: selectedReviewId,
      adminNotes: notes,
      overrideScores: scores,
    });
    if (result !== null && onOverrideSaved) {
      onOverrideSaved(result);
    }
  };

  const handleUndo = async () => {
    if (!selectedReviewId) return;
    setNotes("");
    setScores(baselineScores);
    const result = await save({
      reviewId: selectedReviewId,
      adminNotes: "",
      overrideScores: null,
    });
    if (result === null && onOverrideSaved) {
      onOverrideSaved(null);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "12px 18px 18px", borderTop: "1px solid #EAEAEA" }}>
        <p style={{ margin: 0, fontSize: 13, color: css.textGray }}>Loading override controls…</p>
      </div>
    );
  }

  if (!reviewOptions.length) {
    return (
      <div style={{ padding: "12px 18px 18px", borderTop: "1px solid #EAEAEA" }}>
        <p style={{ margin: 0, fontSize: 13, color: css.textGray }}>No grades to override yet.</p>
      </div>
    );
  }

  const baselineTotal = getReviewRawTotal({ scores: baselineScores });
  const currentTotal = getReviewRawTotal({ scores });
  const maxScore = selectedReview?.maxScore || reviewMetrics.length * maxPerCategory;

  return (
    <div style={{ padding: "12px 18px 18px", borderTop: "1px solid #EAEAEA", background: "#FAFCF8" }}>
      <p style={{ fontSize: 10, color: css.textGray, letterSpacing: "0.06em", margin: "0 0 10px", fontWeight: 800 }}>
        ADMIN · OVERRIDE GRADE
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label
            htmlFor="review-override-select"
            style={{
              display: "block",
              margin: "0 0 6px",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: css.textGray,
            }}
          >
            Select grader
          </label>
          <select
            id="review-override-select"
            value={selectedReviewId}
            onChange={(e) => setSelectedReviewId(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${css.borderLight}`,
              background: "#FFF",
              fontSize: 13,
              color: css.textDark,
              cursor: "pointer",
            }}
          >
            {reviewOptions.map(({ review, label, scoreLabel, hasOverride }) => (
              <option key={review.id} value={review.id}>
                {label} — {scoreLabel}{hasOverride ? " (overridden)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div style={{
          padding: "12px 14px",
          borderRadius: 8,
          border: `1px solid ${isOverridden ? "rgba(226,75,74,0.35)" : css.borderLight}`,
          background: isOverridden ? "#FFF8F8" : "#FFF",
        }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: css.textGray }}>
              Rubric scores (1–{maxPerCategory})
            </p>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: isOverridden ? "#E24B4A" : cardGreen, fontFamily: "'DM Mono', monospace" }}>
              {formatScore(currentTotal)}/{maxScore} pts
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {reviewMetrics.map(metric => (
              <MetricRow
                key={metric}
                metric={metric}
                value={scores[metric]}
                onScore={handleMetricScore}
                maxScore={maxPerCategory}
              />
            ))}
          </div>

          {isOverridden ? (
            <p style={{ margin: "10px 0 0", fontSize: 11, color: "#E24B4A", fontWeight: 600 }}>
              Original: {formatScore(baselineTotal)}/{maxScore} pts
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="review-override-notes"
            style={{
              display: "block",
              margin: "0 0 6px",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: css.textGray,
            }}
          >
            Admin notes
          </label>
          <textarea
            id="review-override-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 5000))}
            placeholder="Why this grade was adjusted…"
            rows={3}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${css.borderLight}`,
              background: "#FFF",
              fontSize: 13,
              lineHeight: 1.5,
              color: css.textDark,
              outline: "none",
              resize: "vertical",
              boxSizing: "border-box",
              fontFamily: "'DM Sans', sans-serif",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || Boolean(savingReviewId)}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              background: hasChanges && !savingReviewId ? cardGreen : css.borderLight,
              color: hasChanges && !savingReviewId ? cardPale : css.textGray,
              fontSize: 13,
              fontWeight: 700,
              cursor: hasChanges && !savingReviewId ? "pointer" : "default",
            }}
          >
            {savingReviewId === selectedReviewId ? "Saving…" : "Save override"}
          </button>
          {isOverridden ? (
            <button
              type="button"
              onClick={handleUndo}
              disabled={Boolean(savingReviewId)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #E24B4A",
                background: "transparent",
                color: "#E24B4A",
                fontSize: 12,
                fontWeight: 600,
                cursor: savingReviewId ? "default" : "pointer",
              }}
            >
              Undo override
            </button>
          ) : null}
        </div>

        {saveError ? (
          <p style={{ margin: 0, fontSize: 12, color: "#E24B4A" }}>{saveError}</p>
        ) : null}
      </div>
    </div>
  );
}
