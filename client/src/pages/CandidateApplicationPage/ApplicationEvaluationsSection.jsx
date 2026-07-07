import { css } from "../../theme/colors";
import { formatDate, formatScore, titleCase } from "../../utils/format";
import { hasText } from "./applicationUtils";
import CategoryRow from "./components/CategoryRow";
import RoundEvaluationPanel from "./components/RoundEvaluationPanel";
import SectionCard from "./components/SectionCard";
import { FRQ_METRIC } from "../../constants/frq";
import { cardGreen, ROUND_1_LABEL, UPCOMING_EVALUATION_ROUNDS } from "./constants";

export default function ApplicationEvaluationsSection({ scoring }) {
  const hasResumeReviews = (scoring?.numReviews ?? 0) > 0;
  const hasFrqReviews = (scoring?.numFrqReviews ?? scoring?.frqReviews?.length ?? 0) > 0;
  const hasScoring = hasResumeReviews || hasFrqReviews;

  return (
    <SectionCard title="Evaluations">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <RoundEvaluationPanel title={ROUND_1_LABEL} status="active">
          {hasScoring ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
                <div>
                  <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color: css.textGray, textTransform: "uppercase" }}>
                    Normalized score
                  </p>
                  <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: cardGreen, lineHeight: 1 }}>
                    {formatScore(scoring.normalizedScore)}<span style={{ fontSize: 14 }}>%</span>
                  </p>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: css.textGray, paddingTop: 14 }}>
                  {formatScore(scoring.aggregateScore)} raw pts
                  {hasResumeReviews ? ` · ${scoring.numReviews} ${scoring.numReviews === 1 ? "review" : "reviews"}` : ""}
                  {scoring.frqPending ? " · FRQ pending" : hasFrqReviews ? ` · ${scoring.numFrqReviews} FRQ ${scoring.numFrqReviews === 1 ? "grade" : "grades"}` : ""}
                </p>
              </div>

              {(scoring.metrics || []).map(metric => (
                <CategoryRow
                  key={metric}
                  metric={metric}
                  value={scoring.categoryScores?.[metric]}
                  maxPerCategory={metric === FRQ_METRIC ? 4 : scoring.maxPerCategory}
                />
              ))}

              <div style={{ marginTop: 18, borderTop: `1px solid ${css.borderLight}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                {(scoring.reviews || []).map((review, index) => {
                  const reviewOverridden = review?.adminOverride?.overrideScore != null;
                  return (
                  <div key={review.id} style={{ padding: "12px 14px", background: "#F8FAF6", borderRadius: 8, border: `1px solid ${css.borderLight}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: review.notes ? 8 : 0 }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: css.textDark }}>
                          {review.reviewerName || review.reviewerEmail || `Reviewer ${index + 1}`}
                        </p>
                        <p style={{ margin: "2px 0 0", fontSize: 12, color: css.textGray }}>
                          {formatDate(review.submittedAt, { style: "datetime" })}
                          {review.decision && review.decision !== "pass" ? ` · ${titleCase(review.decision)}` : ""}
                          {reviewOverridden ? " · overridden" : ""}
                        </p>
                      </div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: reviewOverridden ? "#E24B4A" : cardGreen }}>
                        {formatScore(review.normalizedScore)}% · {formatScore(review.score)} raw
                      </p>
                    </div>
                    {hasText(review.notes) && (
                      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: css.textDark, whiteSpace: "pre-wrap" }}>
                        {review.notes.trim()}
                      </p>
                    )}
                  </div>
                  );
                })}
                {(scoring.frqReviews || []).map((review, index) => (
                  <div key={review.id} style={{ padding: "12px 14px", background: "#F8FAF6", borderRadius: 8, border: `1px solid ${css.borderLight}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: review.notes ? 8 : 0 }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: css.textDark }}>
                          {review.reviewerName || review.reviewerEmail || `FRQ grader ${index + 1}`}
                        </p>
                        <p style={{ margin: "2px 0 0", fontSize: 12, color: css.textGray }}>
                          {formatDate(review.submittedAt, { style: "datetime" })} · Application responses
                        </p>
                      </div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: cardGreen }}>
                        {formatScore(review.score)}/4
                      </p>
                    </div>
                    {hasText(review.notes) && (
                      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: css.textDark, whiteSpace: "pre-wrap" }}>
                        {review.notes.trim()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 14, color: css.textGray }}>No resume screen reviews yet.</p>
          )}
        </RoundEvaluationPanel>

        {UPCOMING_EVALUATION_ROUNDS.map(round => (
          <RoundEvaluationPanel key={round.id} title={round.label} status="upcoming">
            <p style={{ margin: 0, fontSize: 14, color: css.textGray, lineHeight: 1.5 }}>
              Scoring and feedback for this round will appear here once evaluations begin.
            </p>
          </RoundEvaluationPanel>
        ))}
      </div>
    </SectionCard>
  );
}
