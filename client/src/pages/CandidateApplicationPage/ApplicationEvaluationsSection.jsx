import { FRQ_METRIC } from "../../constants/frq";
import { css } from "../../theme/colors";
import { formatDate, formatPoints, formatScore, getInitials, hasNumericScore, titleCase } from "../../utils/format";
import { getCurrentResumeMaxScore, resolveReviewMaxScore } from "../../utils/rubric";
import { hasText } from "./applicationUtils";
import CategoryRow from "./components/CategoryRow";
import SectionCard from "./components/SectionCard";
import { cardGreen, cardMint, cardPale } from "./constants";

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
  const scoredMetrics = metrics.filter((metric) => hasNumericScore(review.scores?.[metric]));
  if (!scoredMetrics.length) return null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 14 }}>
      {scoredMetrics.map((metric) => (
        <div key={metric} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 10px", borderRadius: 7, background: css.cardWhite, border: `1px solid ${css.borderLight}` }}>
          <span style={{ minWidth: 0, color: css.textGray, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={titleCase(metric)}>
            {titleCase(metric)}
          </span>
          <span style={{ flexShrink: 0, color: cardGreen, fontSize: 11, fontWeight: 700 }}>
            {formatScore(review.scores[metric])}/{maxPerCategory}
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
            <p style={{ margin: 0, color: css.textDark, fontSize: 14, fontWeight: 700 }}>{reviewerName}</p>
            <p style={{ margin: "3px 0 0", color: css.textGray, fontSize: 11 }}>
              {[review.reviewerEmail && review.reviewerEmail !== reviewerName ? review.reviewerEmail : null, formatDate(review.submittedAt, { style: "datetime" })].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <p style={{ margin: 0, color: reviewOverridden ? "#E24B4A" : cardGreen, fontSize: 17, fontWeight: 700 }}>
            {formatPoints(review.score, resolveReviewMaxScore(review, { metrics, maxPerCategory }))} <span style={{ color: css.textGray, fontSize: 12, fontWeight: 500 }}>points</span>
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

export default function ApplicationEvaluationsSection({ candidate, scoring }) {
  const reviews = scoring?.reviews || [];
  const frqReviews = scoring?.frqReviews || [];
  const resumeMetrics = (scoring?.metrics || []).filter(
    (metric) => metric !== FRQ_METRIC && hasNumericScore(scoring?.categoryScores?.[metric])
  );
  const averageScore = scoring?.resumeAggregateScore ?? scoring?.aggregateScore;
  const averageMaxScore = scoring?.resumeMaxScore
    ?? scoring?.maxScore
    ?? getCurrentResumeMaxScore(candidate?.year);
  const maxPerCategory = scoring?.maxPerCategory || 4;
  const distinctGraders = new Set(reviews.map((review) => review.reviewerEmail || review.reviewerName || review.id).filter(Boolean)).size;

  return (
    <SectionCard title="Admin grading overview">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, color: css.textDark, fontSize: 20, fontWeight: 700 }}>Candidate scorecard</h3>
          <p style={{ margin: "5px 0 0", color: css.textGray, fontSize: 13, lineHeight: 1.45 }}>Average rubric performance and every submitted grader score for this candidate.</p>
        </div>
        <span style={{ padding: "5px 9px", borderRadius: 20, background: "rgba(40, 98, 65, 0.1)", color: cardGreen, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Admin only</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        <StatTile label="Average score" value={formatPoints(averageScore, averageMaxScore)} detail={hasNumericScore(averageScore) ? "Average points earned per resume review" : "No score submitted yet"} accent />
        <StatTile label="Resume grades" value={reviews.length} detail={`${reviews.length} completed resume ${reviews.length === 1 ? "grade" : "grades"}`} />
        <StatTile label="Free-response grades" value={frqReviews.length} detail={`${frqReviews.length} completed free-response ${frqReviews.length === 1 ? "grade" : "grades"}`} />
        <StatTile label="Distinct graders" value={distinctGraders} detail="People who submitted a resume score" />
      </div>

      {reviews.length > 0 && resumeMetrics.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${css.borderLight}` }}>
          <h3 style={{ margin: "0 0 12px", color: css.textDark, fontSize: 14, fontWeight: 700 }}>Average by category</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", columnGap: 24 }}>
            {resumeMetrics.map((metric) => <CategoryRow key={metric} metric={metric} value={scoring.categoryScores?.[metric]} maxPerCategory={maxPerCategory} />)}
          </div>
        </div>
      )}

      <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${css.borderLight}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
          <h3 style={{ margin: 0, color: css.textDark, fontSize: 14, fontWeight: 700 }}>Previous grades</h3>
          <span style={{ color: css.textGray, fontSize: 12 }}>{reviews.length} resume · {frqReviews.length} free response</span>
        </div>

        {reviews.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {reviews.map((review, index) => <ResumeReviewCard key={review.id} review={review} index={index} metrics={resumeMetrics} maxPerCategory={maxPerCategory} />)}
          </div>
        ) : (
          <div style={{ padding: "22px", borderRadius: 9, background: "#F8FAF6", border: `1px dashed ${css.borderLight}`, color: css.textGray, fontSize: 13, textAlign: "center" }}>No resume grades have been submitted for this candidate.</div>
        )}
      </div>

      {frqReviews.length > 0 && (
        <details style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${css.borderLight}` }}>
          <summary style={{ color: cardGreen, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Free-response grades ({frqReviews.length})</summary>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginTop: 10 }}>
            {frqReviews.map((review, index) => (
              <div key={review.id} style={{ padding: "11px 12px", borderRadius: 8, background: "#F8FAF6", border: `1px solid ${css.borderLight}` }}>
                <p style={{ margin: 0, color: css.textDark, fontSize: 12, fontWeight: 700 }}>{review.reviewerName || review.reviewerEmail || `FRQ grader ${index + 1}`}</p>
                <p style={{ margin: "4px 0 0", color: cardMint, fontSize: 12, fontWeight: 700 }}>
                  {formatScore(review.score)}/4 <span style={{ color: css.textGray, fontWeight: 400 }}>· {formatDate(review.submittedAt, { style: "short" })}</span>
                </p>
              </div>
            ))}
          </div>
        </details>
      )}
    </SectionCard>
  );
}
