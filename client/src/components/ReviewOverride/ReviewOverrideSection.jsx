import { useEffect, useMemo, useState } from "react";
import { css } from "../../theme/colors";
import { formatScore } from "../../utils/format";
import { resolveReviewMaxScore } from "../../utils/rubric";
import useReviewOverrides from "./useReviewOverrides";

const cardGreen = "#085041";
const cardPale = "#EAF3DE";

function getReviewerLabel(review, index) {
  return review?.reviewerName || review?.reviewerEmail || `Reviewer ${index + 1}`;
}

function getReviewRawTotal(review) {
  if (Number.isFinite(Number(review?.score))) return Number(review.score);
  return Object.values(review?.scores ?? {}).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0
  );
}

function getReviewScoreLabel(review, maxScore) {
  const total = getReviewRawTotal(review);
  const max = maxScore || resolveReviewMaxScore(review);
  return `${formatScore(total)}/${max} pts`;
}

function getBaselineTotal(review) {
  const sourceScores = review?.sourceScores || review?.scores || {};
  return Object.values(sourceScores).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function getEffectiveOverrideScore(review, override) {
  if (override?.overrideScore != null) return Number(override.overrideScore);
  if (review?.adminOverride?.overrideScore != null) return Number(review.adminOverride.overrideScore);
  return getBaselineTotal(review);
}

export default function ReviewOverrideSection({
  resumeId,
  reviews = [],
  metrics = [],
  maxPerCategory = 4,
  onOverrideSaved,
  embedded = false,
}) {
  const embeddedOverrides = useMemo(() => {
    if (!embedded) return {};
    return Object.fromEntries(
      (reviews || [])
        .filter((review) => review?.id && review?.adminOverride)
        .map((review) => [review.id, review.adminOverride])
    );
  }, [embedded, reviews]);

  const {
    overrideByReviewId,
    loading,
    savingReviewId,
    saveError,
    save,
  } = useReviewOverrides(resumeId, true, {
    initialOverrides: embeddedOverrides,
    skipInitialLoad: embedded,
  });

  const [selectedReviewId, setSelectedReviewId] = useState("");
  const [overrideScore, setOverrideScore] = useState("");
  const [notes, setNotes] = useState("");

  const reviewOptions = useMemo(
    () => (reviews || []).map((review, index) => {
      const override = overrideByReviewId[review.id] || review?.adminOverride;
      const hasOverride = override?.overrideScore != null;
      const maxScore = resolveReviewMaxScore(review, { metrics, maxPerCategory });
      const displayReview = hasOverride
        ? { ...review, score: override.overrideScore }
        : review;

      return {
        review,
        index,
        label: getReviewerLabel(review, index),
        scoreLabel: getReviewScoreLabel(displayReview, maxScore),
        hasOverride,
        maxScore,
      };
    }),
    [reviews, overrideByReviewId, metrics, maxPerCategory]
  );

  useEffect(() => {
    if (loading) return;
    if (!reviewOptions.length) {
      setSelectedReviewId("");
      setOverrideScore("");
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
    setOverrideScore(String(getEffectiveOverrideScore(review, override)));
  }, [selectedReviewId, reviews, overrideByReviewId]);

  const selectedReview = reviews.find(row => row.id === selectedReviewId);
  const selectedOption = reviewOptions.find(opt => opt.review.id === selectedReviewId);
  const activeOverride = selectedReviewId
    ? overrideByReviewId[selectedReviewId] || selectedReview?.adminOverride
    : null;
  const isOverridden = activeOverride?.overrideScore != null;
  const baselineTotal = selectedReview ? getBaselineTotal(selectedReview) : 0;
  const maxScore = selectedOption?.maxScore
    || resolveReviewMaxScore(selectedReview, { metrics, maxPerCategory });
  const parsedOverrideScore = Number(overrideScore);
  const effectiveOverrideScore = getEffectiveOverrideScore(selectedReview, activeOverride);

  const hasChanges =
    notes !== (activeOverride?.adminNotes || "") ||
    (Number.isFinite(parsedOverrideScore) && parsedOverrideScore !== effectiveOverrideScore);

  const handleSave = async () => {
    if (!selectedReviewId || !Number.isFinite(parsedOverrideScore)) return;
    const result = await save({
      reviewId: selectedReviewId,
      adminNotes: notes,
      overrideScore: parsedOverrideScore,
    });
    if (result !== null && onOverrideSaved) {
      onOverrideSaved(result);
    }
  };

  const handleUndo = async () => {
    if (!selectedReviewId) return;
    setNotes("");
    setOverrideScore(String(baselineTotal));
    const result = await save({
      reviewId: selectedReviewId,
      adminNotes: "",
      overrideScore: null,
    });
    if (result === null && onOverrideSaved) {
      onOverrideSaved(null);
    }
  };

  const shellStyle = embedded
    ? { display: "flex", flexDirection: "column", gap: 12 }
    : {
        padding: "12px 18px 18px",
        borderTop: "1px solid #EAEAEA",
        background: "#FAFCF8",
      };

  if (loading) {
    return (
      <div style={shellStyle}>
        <p style={{ margin: 0, fontSize: 13, color: css.textGray }}>Loading override controls…</p>
      </div>
    );
  }

  if (!reviewOptions.length) {
    return (
      <div style={shellStyle}>
        <p style={{ margin: 0, fontSize: 13, color: css.textGray }}>No grades to override yet.</p>
      </div>
    );
  }

  const selectId = embedded ? "app-review-override-select" : "review-override-select";
  const scoreId = embedded ? "app-review-override-score" : "review-override-score";
  const notesId = embedded ? "app-review-override-notes" : "review-override-notes";

  return (
    <div style={shellStyle}>
      {!embedded ? (
        <p style={{ fontSize: 10, color: css.textGray, letterSpacing: "0.06em", margin: "0 0 10px", fontWeight: 700 }}>
          ADMIN · OVERRIDE GRADE
        </p>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label
            htmlFor={selectId}
            style={{
              display: "block",
              margin: "0 0 6px",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: css.textGray,
            }}
          >
            Select grader
          </label>
          <select
            id={selectId}
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
          <label
            htmlFor={scoreId}
            style={{
              display: "block",
              margin: "0 0 8px",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: css.textGray,
            }}
          >
            Total score (0–{maxScore} pts)
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              id={scoreId}
              type="number"
              min={0}
              max={maxScore}
              step={0.5}
              value={overrideScore}
              onChange={(e) => setOverrideScore(e.target.value)}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 8,
                border: `1px solid ${isOverridden ? "rgba(226,75,74,0.35)" : css.borderLight}`,
                background: "#FFF",
                fontSize: 16,
                fontWeight: 700,
                color: isOverridden ? "#E24B4A" : cardGreen,
                fontFamily: "'DM Mono', monospace",
                outline: "none",
              }}
            />
            <span style={{ fontSize: 13, color: css.textGray, fontWeight: 600, whiteSpace: "nowrap" }}>
              / {maxScore} pts
            </span>
          </div>

          {isOverridden ? (
            <p style={{ margin: "10px 0 0", fontSize: 11, color: "#E24B4A", fontWeight: 600 }}>
              Original: {formatScore(baselineTotal)}/{maxScore} pts
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor={notesId}
            style={{
              display: "block",
              margin: "0 0 6px",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: css.textGray,
            }}
          >
            Admin notes
          </label>
          <textarea
            id={notesId}
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
            disabled={!hasChanges || Boolean(savingReviewId) || !Number.isFinite(parsedOverrideScore)}
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
