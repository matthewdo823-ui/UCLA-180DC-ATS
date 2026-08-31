import { FRQ_METRIC } from "../../constants/frq";
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

function CoffeeChatEvaluationCard({ evaluation, index }) {
  const reviewerName = evaluation.reviewerName || evaluation.reviewerEmail || `Coffee Chat evaluator ${index + 1}`;
  const ratingLabel = COFFEE_RATING_LABELS[evaluation.rating] || "Submitted";
  const positive = Number(evaluation.weightedScore) > 0;
  const negative = Number(evaluation.weightedScore) < 0;
  const ratingColor = coffeeRatingColors[evaluation.rating]
    || (positive ? cardGreen : negative ? css.red : css.textGray);

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
              <span style={{ padding: "3px 7px", borderRadius: 20, background: cardPale, color: cardGreen, fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>Coffee Chat</span>
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
  const previousGrades = [
    ...reviews.map((review, index) => ({ type: "resume", review, index })),
    ...frqReviews.map((review, index) => ({ type: "frq", review, index })),
    ...coffeeChatEvaluations.map((review, index) => ({ type: "coffee", review, index })),
  ].sort((a, b) => new Date(b.review.submittedAt || 0) - new Date(a.review.submittedAt || 0));

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
          <h3 style={{ margin: 0, color: css.textDark, fontSize: 14, fontWeight: 700 }}>Previous grades</h3>
          <span style={{ color: css.textGray, fontSize: 12, lineHeight: 1.45, textAlign: "right", whiteSpace: "pre-line" }}>{formatReviewCountPairStacked(reviews.length, frqReviews.length)}{coffeeChatEvaluations.length || Number.isFinite(scoring?.coffeeChatExpectedEvaluationCount) ? `\n${coffeeChatEvaluations.length}${Number.isFinite(scoring?.coffeeChatExpectedEvaluationCount) ? ` / ${scoring.coffeeChatExpectedEvaluationCount}` : ""} Coffee Chat rating${coffeeChatEvaluations.length === 1 ? "" : "s"}` : ""}</span>
        </div>

        {previousGrades.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {previousGrades.map(({ type, review, index }) => (
              type === "resume"
                ? <ResumeReviewCard key={`resume-${review.id}`} review={review} index={index} metrics={resumeMetrics} maxPerCategory={maxPerCategory} />
                : type === "frq"
                  ? <FrqReviewCard key={`frq-${review.id}`} review={review} index={index} />
                  : <CoffeeChatEvaluationCard key={`coffee-${review.id}`} evaluation={review} index={index} />
            ))}
          </div>
        ) : (
          <div style={{ padding: "22px", borderRadius: 9, background: "#F8FAF6", border: `1px dashed ${css.borderLight}`, color: css.textGray, fontSize: 13, textAlign: "center" }}>No grades have been submitted for this candidate.</div>
        )}
      </div>
    </SectionCard>
  );
}
