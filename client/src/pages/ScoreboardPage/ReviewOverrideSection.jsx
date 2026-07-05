import { useEffect, useMemo, useState } from "react";
import { css } from "../../theme/colors";
import { formatScore, hasNumericScore } from "../../utils/format";
import useReviewOverrides from "./useReviewOverrides";

const cardGreen = "#085041";
const cardPale = "#EAF3DE";

function getReviewerLabel(review, index) {
  return review?.reviewerName || review?.reviewerEmail || `Reviewer ${index + 1}`;
}

function getReviewScoreLabel(review, equalized) {
  if (equalized && hasNumericScore(review?.normalizedScore)) {
    return `${formatScore(review.normalizedScore)}%`;
  }
  const total = Object.values(review?.scores ?? {}).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0
  );
  const max = review?.maxScore || Object.keys(review?.scores || {}).length * 4 || 24;
  return `${formatScore(total)}/${max}`;
}

export default function ReviewOverrideSection({
  resumeId,
  reviews = [],
  equalized = false,
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
  const [scoreStr, setScoreStr] = useState("");
  const [notes, setNotes] = useState("");

  const reviewOptions = useMemo(
    () => (reviews || []).map((review, index) => ({
      review,
      index,
      label: getReviewerLabel(review, index),
      scoreLabel: getReviewScoreLabel(review, equalized),
      hasOverride: Boolean(
        review?.adminOverride?.overrideScore != null || overrideByReviewId[review.id]?.overrideScore != null
      ),
    })),
    [reviews, equalized, overrideByReviewId]
  );

  useEffect(() => {
    if (loading) return;
    if (!reviewOptions.length) {
      setSelectedReviewId("");
      setScoreStr("");
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
    setScoreStr(
      override?.overrideScore != null
        ? String(override.overrideScore)
        : hasNumericScore(review?.normalizedScore)
          ? String(review.normalizedScore)
          : ""
    );
  }, [selectedReviewId, reviews, overrideByReviewId]);

  const selectedReview = reviews.find(row => row.id === selectedReviewId);
  const activeOverride = selectedReviewId
    ? overrideByReviewId[selectedReviewId] || selectedReview?.adminOverride
    : null;
  const isOverridden = activeOverride?.overrideScore != null;

  const baselineScore = selectedReview?.sourceNormalizedScore ?? selectedReview?.normalizedScore;
  const hasChanges =
    notes !== (activeOverride?.adminNotes || "") ||
    (scoreStr !== "" ? String(Number(scoreStr)) : "") !== (
      activeOverride?.overrideScore != null
        ? String(activeOverride.overrideScore)
        : hasNumericScore(baselineScore)
          ? String(baselineScore)
          : ""
    );

  const handleSave = async () => {
    if (!selectedReviewId) return;
    const scoreNum = scoreStr.trim() !== "" ? Number(scoreStr) : null;
    const result = await save({
      reviewId: selectedReviewId,
      adminNotes: notes,
      overrideScore: scoreNum,
    });
    if (result !== null && onOverrideSaved) {
      onOverrideSaved(result);
    }
  };

  const handleUndo = async () => {
    if (!selectedReviewId) return;
    setNotes("");
    setScoreStr(hasNumericScore(baselineScore) ? String(baselineScore) : "");
    const result = await save({
      reviewId: selectedReviewId,
      adminNotes: "",
      overrideScore: null,
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

        <div>
          <label
            htmlFor="review-override-score"
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
            Override score (0–100%)
          </label>
          <input
            id="review-override-score"
            type="number"
            min={0}
            max={100}
            step="any"
            value={scoreStr}
            onChange={(e) => setScoreStr(e.target.value)}
            placeholder="Normalized score"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${isOverridden ? "rgba(226,75,74,0.35)" : css.borderLight}`,
              background: isOverridden ? "#FFF8F8" : "#FFF",
              fontSize: 14,
              fontWeight: 600,
              color: isOverridden ? "#E24B4A" : css.textDark,
              outline: "none",
              boxSizing: "border-box",
              fontFamily: "'DM Mono', monospace",
            }}
          />
          {isOverridden && hasNumericScore(baselineScore) ? (
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#E24B4A", fontWeight: 600 }}>
              Original: {formatScore(baselineScore)}%
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
