import { useEffect, useMemo, useState } from "react";
import { FRQ_METRIC } from "../../constants/frq";
import { ROUND_TYPES } from "../../constants/rounds";
import { coffeeRatingColors, css } from "../../theme/colors";
import { formatDate, formatScore, getInitials, hasNumericScore, titleCase } from "../../utils/format";
import { formatReviewCount, formatReviewCountPairStacked } from "../../utils/reviewCounts";
import { hasText } from "./applicationUtils";
import CategoryRow from "./components/CategoryRow";
import SectionCard from "./components/SectionCard";
import { cardGreen, cardPale } from "./constants";

function StatTile({ label, value, detail, accent = false }) {
  return (
    <div style={{ minWidth: 0, padding: "18px 20px", borderRadius: 10, border: `1px solid ${accent ? "rgba(40, 98, 65, 0.22)" : css.borderLight}`, background: accent ? cardPale : "#F8FAF6" }}>
      <p style={{ margin: "0 0 7px", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", color: css.textGray, textTransform: "uppercase" }}>{label}</p>
      <p style={{ margin: 0, color: cardGreen, fontSize: 30, fontWeight: 700, lineHeight: 1 }}>{value}</p>
      <p style={{ margin: "7px 0 0", color: css.textGray, fontSize: 12, lineHeight: 1.4 }}>{detail}</p>
    </div>
  );
}

function ReviewCategoryScores({ review, metrics, maxPerCategory }) {
  const displayScores = review.displayScores || review.scores || {};
  const reviewMetrics = Object.keys(displayScores).filter((metric) => metric !== FRQ_METRIC);
  const scoredMetrics = [...new Set([...metrics, ...reviewMetrics])]
    .filter((metric) => hasNumericScore(displayScores[metric]));
  const categoryMax = review.displayMaxPerCategory || review.maxPerCategory || maxPerCategory;
  if (!scoredMetrics.length) return null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 14 }}>
      {scoredMetrics.map((metric) => (
        <div key={metric} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 10px", borderRadius: 7, background: css.cardWhite, border: `1px solid ${css.borderLight}` }}>
          <span style={{ minWidth: 0, color: css.textGray, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={titleCase(metric)}>
            {titleCase(metric)}
          </span>
          <span style={{ flexShrink: 0, color: cardGreen, fontSize: 11, fontWeight: 700 }}>
            {formatScore(displayScores[metric])}/{categoryMax}
          </span>
        </div>
      ))}
    </div>
  );
}

function ResumeReviewCard({ review, index, metrics, maxPerCategory }) {
  const reviewOverridden = review?.adminOverride?.overrideScore != null;
  const reviewerName = review.reviewerName || review.reviewerEmail || `Reviewer ${index + 1}`;

  return (
    <article style={{ padding: "16px 18px", background: "#F8FAF6", borderRadius: 10, border: `1px solid ${css.borderLight}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
          <div style={{ width: 36, height: 36, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: "50%", background: cardGreen, color: "#FFF", fontSize: 11, fontWeight: 700 }}>
            {getInitials(reviewerName)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              <p style={{ margin: 0, color: css.textDark, fontSize: 14, fontWeight: 700 }}>{reviewerName}</p>
              <span style={{ padding: "3px 7px", borderRadius: 20, background: cardPale, color: cardGreen, fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>Resume</span>
            </div>
            <p style={{ margin: "3px 0 0", color: css.textGray, fontSize: 11 }}>
              {[review.reviewerEmail && review.reviewerEmail !== reviewerName ? review.reviewerEmail : null, formatDate(review.submittedAt, { style: "datetime" })].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <p style={{ margin: 0, color: reviewOverridden ? "#E24B4A" : cardGreen, fontSize: 17, fontWeight: 700 }}>
            {formatScore(review.normalizedScore)}%
          </p>
          <p style={{ margin: "3px 0 0", color: css.textGray, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            {review.decision && review.decision !== "pass" ? titleCase(review.decision) : "Submitted"}{reviewOverridden ? " · overridden" : ""}
          </p>
        </div>
      </div>

      <ReviewCategoryScores review={review} metrics={metrics} maxPerCategory={maxPerCategory} />

      {hasText(review.notes) && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${css.borderLight}` }}>
          <p style={{ margin: "0 0 5px", color: css.textGray, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Reviewer notes</p>
          <p style={{ margin: 0, color: css.textDark, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{review.notes.trim()}</p>
        </div>
      )}
    </article>
  );
}

function FrqReviewCard({ review, index }) {
  const reviewerName = review.reviewerName || review.reviewerEmail || `Free-response grader ${index + 1}`;

  return (
    <article style={{ padding: "16px 18px", background: "#F8FAF6", borderRadius: 10, border: `1px solid ${css.borderLight}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
          <div style={{ width: 36, height: 36, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: "50%", background: cardGreen, color: "#FFF", fontSize: 11, fontWeight: 700 }}>
            {getInitials(reviewerName)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              <p style={{ margin: 0, color: css.textDark, fontSize: 14, fontWeight: 700 }}>{reviewerName}</p>
              <span style={{ padding: "3px 7px", borderRadius: 20, background: cardPale, color: cardGreen, fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>Free response</span>
            </div>
            <p style={{ margin: "3px 0 0", color: css.textGray, fontSize: 11 }}>
              {[review.reviewerEmail && review.reviewerEmail !== reviewerName ? review.reviewerEmail : null, formatDate(review.submittedAt, { style: "datetime" })].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        <p style={{ margin: 0, color: cardGreen, fontSize: 17, fontWeight: 700 }}>
          {hasNumericScore(review.normalizedScore)
            ? formatScore(review.normalizedScore)
            : formatScore(Number(review.score) / 4 * 100)}%
        </p>
      </div>

      {hasText(review.notes) && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${css.borderLight}` }}>
          <p style={{ margin: "0 0 5px", color: css.textGray, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Grader notes</p>
          <p style={{ margin: 0, color: css.textDark, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{review.notes.trim()}</p>
        </div>
      )}
    </article>
  );
}

const COFFEE_RATING_LABELS = {
  strong_yes: "Strong yes",
  yes: "Yes",
  no: "No",
  strong_no: "Strong no",
};

function InterviewEvaluationCard({ evaluation, index, round }) {
  const coffeeChat = round?.roundType === ROUND_TYPES.COFFEE_CHAT || Boolean(COFFEE_RATING_LABELS[evaluation.rating]);
  const reviewerName = evaluation.reviewerName || evaluation.reviewerEmail || `${round?.roundName || "Interview"} evaluator ${index + 1}`;
  const ratingLabel = coffeeChat
    ? COFFEE_RATING_LABELS[evaluation.rating] || "Submitted"
    : titleCase(evaluation.decision || "submitted");
  const positive = Number(evaluation.weightedScore) > 0;
  const negative = Number(evaluation.weightedScore) < 0;
  const ratingColor = coffeeChat
    ? coffeeRatingColors[evaluation.rating] || (positive ? cardGreen : negative ? css.red : css.textGray)
    : evaluation.decision === "pass" ? cardGreen : evaluation.decision === "fail" ? css.red : evaluation.decision === "hold" ? css.amber : css.textGray;

  return (
    <article style={{ padding: "16px 18px", background: "#F8FAF6", borderRadius: 10, border: `1px solid ${css.borderLight}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
          <div style={{ width: 36, height: 36, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: "50%", background: cardGreen, color: "#FFF", fontSize: 11, fontWeight: 700 }}>
            {getInitials(reviewerName)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              <p style={{ margin: 0, color: css.textDark, fontSize: 14, fontWeight: 700 }}>{reviewerName}</p>
              <span style={{ padding: "3px 7px", borderRadius: 20, background: cardPale, color: cardGreen, fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>{round?.roundName || (coffeeChat ? "Coffee Chat" : "Interview")}</span>
            </div>
            <p style={{ margin: "3px 0 0", color: css.textGray, fontSize: 11 }}>
              {[evaluation.reviewerEmail && evaluation.reviewerEmail !== reviewerName ? evaluation.reviewerEmail : null, formatDate(evaluation.submittedAt, { style: "datetime" })].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <p style={{ margin: 0, color: ratingColor, fontSize: 15, fontWeight: 700 }}>
          {ratingLabel}
        </p>
      </div>

      {hasText(evaluation.notes) && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${css.borderLight}` }}>
          <p style={{ margin: "0 0 5px", color: css.textGray, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Evaluator notes</p>
          <p style={{ margin: 0, color: css.textDark, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{evaluation.notes.trim()}</p>
        </div>
      )}
    </article>
  );
}

export default function ApplicationEvaluationsSection({ scoring }) {
  const reviews = scoring?.reviews || [];
  const frqReviews = scoring?.frqReviews || [];
  const coffeeChatEvaluations = scoring?.coffeeChatEvaluations || [];
  const allMetrics = [...new Set([
    ...(scoring?.metrics || []),
    ...Object.entries(scoring?.categoryScores || {})
      .filter(([, value]) => hasNumericScore(value))
      .map(([metric]) => metric),
  ])];
  const resumeMetrics = (scoring?.metrics || []).filter(
    (metric) => metric !== FRQ_METRIC
  );
  const averageScore = scoring?.resumeNormalizedScore ?? scoring?.normalizedScore;
  const frqAverage = scoring?.frqScore;
  const maxPerCategory = scoring?.maxPerCategory || 4;
  const freeResponsePercent = hasNumericScore(frqAverage) ? Number(frqAverage) / 4 * 100 : null;
  const overallDetail = hasNumericScore(averageScore) && hasNumericScore(freeResponsePercent)
    ? `Resume ${formatScore(averageScore)}% + free response ${formatScore(freeResponsePercent)}% · weighted by rubric`
    : hasNumericScore(averageScore)
      ? `Resume ${formatScore(averageScore)}% · free response pending`
      : "Waiting for submitted grades";
  const roundGrades = useMemo(() => scoring?.roundGrades?.length ? scoring.roundGrades : [
    {
      roundId: "resume-screen",
      roundName: "Resume Screen",
      roundType: ROUND_TYPES.RESUME_SCREEN,
      reviews,
      frqReviews,
      evaluations: [],
    },
    ...(coffeeChatEvaluations.length ? [{
      roundId: "coffee-chat",
      roundName: "Coffee Chats",
      roundType: ROUND_TYPES.COFFEE_CHAT,
      reviews: [],
      frqReviews: [],
      evaluations: coffeeChatEvaluations,
    }] : []),
  ], [coffeeChatEvaluations, frqReviews, reviews, scoring]);
  const [selectedRoundId, setSelectedRoundId] = useState(() => roundGrades[0]?.roundId || "");
  useEffect(() => {
    if (!roundGrades.some((round) => String(round.roundId) === String(selectedRoundId))) {
      setSelectedRoundId(roundGrades[0]?.roundId || "");
    }
  }, [roundGrades, selectedRoundId]);
  const selectedRound = roundGrades.find((round) => String(round.roundId) === String(selectedRoundId)) || roundGrades[0] || null;
  const selectedGrades = useMemo(() => [
    ...(selectedRound?.reviews || []).map((review, index) => ({ type: "resume", review, index })),
    ...(selectedRound?.frqReviews || []).map((review, index) => ({ type: "frq", review, index })),
    ...(selectedRound?.evaluations || []).map((review, index) => ({ type: "interview", review, index })),
  ].sort((a, b) => new Date(b.review.submittedAt || 0) - new Date(a.review.submittedAt || 0)), [selectedRound]);

  return (
    <SectionCard title="Grading overview">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, color: css.textDark, fontSize: 20, fontWeight: 700 }}>Candidate scorecard</h3>
          <p style={{ margin: "5px 0 0", color: css.textGray, fontSize: 13, lineHeight: 1.45 }}>Average rubric performance and every submitted grader score for this candidate.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        <StatTile label="Overall average" value={hasNumericScore(scoring?.normalizedScore) ? `${formatScore(scoring.normalizedScore)}%` : "—"} detail={overallDetail} accent />
        <StatTile label="Average resume" value={hasNumericScore(averageScore) ? `${formatScore(averageScore)}%` : "—"} detail={formatReviewCount(reviews.length, "resume")} />
        <StatTile label="Average free response" value={hasNumericScore(freeResponsePercent) ? `${formatScore(freeResponsePercent)}%` : "—"} detail={formatReviewCount(frqReviews.length, "free response")} />
        <StatTile label="Reviews" value={reviews.length + frqReviews.length} detail={<span style={{ whiteSpace: "pre-line" }}>{formatReviewCountPairStacked(reviews.length, frqReviews.length)}</span>} />
        <StatTile label="Coffee Chat points" value={`${scoring?.coffeeChatScore || 0} pts`} detail={`${coffeeChatEvaluations.length}${Number.isFinite(scoring?.coffeeChatExpectedEvaluationCount) ? ` / ${scoring.coffeeChatExpectedEvaluationCount}` : ""} submitted rating${coffeeChatEvaluations.length === 1 ? "" : "s"}`} />
      </div>

      {allMetrics.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${css.borderLight}` }}>
          <h3 style={{ margin: "0 0 12px", color: css.textDark, fontSize: 14, fontWeight: 700 }}>Average by category</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", columnGap: 24 }}>
            {allMetrics.map((metric) => (
              <CategoryRow
                key={metric}
                metric={metric}
                label={metric === FRQ_METRIC ? "Free response" : undefined}
                value={scoring.categoryScores?.[metric]}
                maxPerCategory={scoring.categoryMaxScores?.[metric] || (metric === FRQ_METRIC ? 4 : maxPerCategory)}
              />
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${css.borderLight}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, color: css.textDark, fontSize: 14, fontWeight: 700 }}>Previous grades</h3>
          {roundGrades.length ? (
            <select
              aria-label="Previous grades round"
              value={selectedRoundId}
              onChange={(event) => setSelectedRoundId(event.target.value)}
              style={{ minWidth: 220, padding: "9px 34px 9px 11px", borderRadius: 8, border: `1px solid ${css.borderLight}`, background: css.cardWhite, color: css.textDark, fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
            >
              {roundGrades.map((round) => {
                const count = (round.reviews?.length || 0) + (round.frqReviews?.length || 0) + (round.evaluations?.length || 0);
                return <option key={round.roundId} value={round.roundId}>{round.roundName} · {count} grade{count === 1 ? "" : "s"}</option>;
              })}
            </select>
          ) : null}
        </div>

        {selectedGrades.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {selectedGrades.map(({ type, review, index }) => (
              type === "resume"
                ? <ResumeReviewCard key={`resume-${review.id}`} review={review} index={index} metrics={resumeMetrics} maxPerCategory={maxPerCategory} />
                : type === "frq"
                  ? <FrqReviewCard key={`frq-${review.id}`} review={review} index={index} />
                  : <InterviewEvaluationCard key={`interview-${review.id}`} evaluation={review} index={index} round={selectedRound} />
            ))}
          </div>
        ) : (
          <div style={{ padding: "22px", borderRadius: 9, background: "#F8FAF6", border: `1px dashed ${css.borderLight}`, color: css.textGray, fontSize: 13, textAlign: "center" }}>No grades were submitted for this candidate in {selectedRound?.roundName || "this round"}.</div>
        )}
      </div>
    </SectionCard>
  );
}
