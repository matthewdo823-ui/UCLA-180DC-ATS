import { useState } from "react";
import { coffeeRatingColors, css } from "../../theme/colors";
import { formatDate, formatScore, hasNumericScore, titleCase } from "../../utils/format";
import { hasText } from "./applicationUtils";
import CategoryRow from "./components/CategoryRow";
import DecisionBadge from "./components/DecisionBadge";
import SectionCard from "./components/SectionCard";
import { FRQ_METRIC } from "../../constants/frq";
import { cardGreen, ROUND_1_LABEL, UPCOMING_EVALUATION_ROUNDS } from "./constants";

const unstyledButton = {
  all: "unset",
  display: "block",
  width: "100%",
  cursor: "pointer",
  boxSizing: "border-box",
};

function Chevron({ expanded }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 12,
        color: css.textGray,
        transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.15s ease",
      }}
    >
      ›
    </span>
  );
}

function Tag({ label, color, bg }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 7px", borderRadius: 5, color, background: bg }}>
      {label}
    </span>
  );
}

function AggregateScoreRow({ scoring, expanded, onToggle }) {
  const hasResumeReviews = (scoring?.numReviews ?? 0) > 0;
  const hasFrqReviews = (scoring?.numFrqReviews ?? scoring?.frqReviews?.length ?? 0) > 0;

  return (
    <button type="button" onClick={onToggle} style={{ ...unstyledButton, padding: "4px 0 18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 30, fontWeight: 700, color: cardGreen, lineHeight: 1 }}>
            {hasNumericScore(scoring.normalizedScore) ? `${formatScore(scoring.normalizedScore)}%` : "—"}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: css.textGray }}>overall average</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <p style={{ margin: 0, fontSize: 13, color: css.textGray, textAlign: "right" }}>
            {hasResumeReviews ? `${scoring.numReviews} ${scoring.numReviews === 1 ? "review" : "reviews"}` : "No reviews"}
            {hasFrqReviews || scoring.frqPending ? ` + FRQ` : ""}
          </p>
          <Chevron expanded={expanded} />
        </div>
      </div>
    </button>
  );
}

function ReviewRow({ review, expanded, onToggle, maxPerCategory, isFirst }) {
  const reviewOverridden = review?.adminOverride?.overrideScore != null;
  const isFlagged = review.decision && review.decision !== "pass";
  const breakdown = Object.entries(review.scores || {});
  const hasBreakdown = breakdown.length > 0;

  const header = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, textAlign: "left" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: css.textDark, whiteSpace: "nowrap" }}>
          {review.reviewerName || review.reviewerEmail || "Reviewer"}
        </p>
        <span style={{ fontSize: 12, color: css.textGray, whiteSpace: "nowrap" }}>
          {formatDate(review.submittedAt, { style: "short" })}
        </span>
        {isFlagged && <Tag label={titleCase(review.decision)} color="#B45309" bg="rgba(239,159,39,0.14)" />}
        {reviewOverridden && <Tag label="Overridden" color="#E24B4A" bg="rgba(226,75,74,0.12)" />}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: reviewOverridden ? "#E24B4A" : cardGreen, whiteSpace: "nowrap" }}>
          {hasNumericScore(review.normalizedScore) ? `${formatScore(review.normalizedScore)}%` : "—"}
        </p>
        {hasBreakdown && <Chevron expanded={expanded} />}
      </div>
    </div>
  );

  return (
    <div style={{ borderTop: isFirst ? "none" : `1px solid ${css.borderLight}`, padding: "16px 0" }}>
      {hasBreakdown ? (
        <button type="button" onClick={onToggle} style={unstyledButton}>{header}</button>
      ) : (
        header
      )}
      {hasText(review.notes) && (
        <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.6, color: css.textDark, whiteSpace: "pre-wrap" }}>
          {review.notes.trim()}
        </p>
      )}
      {expanded && hasBreakdown && (
        <div style={{ marginTop: 14, paddingTop: 4 }}>
          {breakdown.map(([metric, value]) => (
            <CategoryRow key={metric} metric={metric} value={value} maxPerCategory={metric === FRQ_METRIC ? 4 : maxPerCategory} />
          ))}
        </div>
      )}
    </div>
  );
}

function FrqReviewRow({ review, isFirst }) {
  return (
    <div style={{ borderTop: isFirst ? "none" : `1px solid ${css.borderLight}`, padding: "16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: css.textDark, whiteSpace: "nowrap" }}>
            {review.reviewerName || review.reviewerEmail || "FRQ grader"}
          </p>
          <span style={{ fontSize: 12, color: css.textGray, whiteSpace: "nowrap" }}>
            {formatDate(review.submittedAt, { style: "short" })} · Free response
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: cardGreen, whiteSpace: "nowrap" }}>
          {hasNumericScore(review.normalizedScore)
            ? formatScore(review.normalizedScore)
            : formatScore(Number(review.score) / 4 * 100)}%
        </p>
      </div>
      {hasText(review.notes) && (
        <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.6, color: css.textDark, whiteSpace: "pre-wrap" }}>
          {review.notes.trim()}
        </p>
      )}
    </div>
  );
}

const COFFEE_RATING_LABELS = {
  strong_yes: "Strong yes",
  yes: "Yes",
  no: "No",
  strong_no: "Strong no",
};

function InterviewEvaluationRow({ evaluation, isFirst, round }) {
  const score = Number(evaluation.weightedScore);
  const isCoffeeChat = round?.roundType === "coffee_chat" || Boolean(COFFEE_RATING_LABELS[evaluation.rating]);
  const scoreColor = isCoffeeChat
    ? coffeeRatingColors[evaluation.rating] || (score > 0 ? cardGreen : score < 0 ? css.red : css.textGray)
    : evaluation.decision === "pass" ? cardGreen : evaluation.decision === "fail" ? css.red : evaluation.decision === "hold" ? css.amber : css.textGray;
  const resultLabel = isCoffeeChat
    ? COFFEE_RATING_LABELS[evaluation.rating] || "Submitted"
    : titleCase(evaluation.decision || "submitted");

  return (
    <div style={{ borderTop: isFirst ? "none" : `1px solid ${css.borderLight}`, padding: "16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: css.textDark }}>
            {evaluation.reviewerName || evaluation.reviewerEmail || `${round?.roundName || "Interview"} evaluator`}
          </p>
          <span style={{ fontSize: 12, color: css.textGray }}>
            {formatDate(evaluation.submittedAt, { style: "short" })}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: scoreColor, whiteSpace: "nowrap" }}>
          {resultLabel}
        </p>
      </div>
      {hasText(evaluation.notes) && (
        <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.6, color: css.textDark, whiteSpace: "pre-wrap" }}>
          {evaluation.notes.trim()}
        </p>
      )}
    </div>
  );
}

export default function ApplicationRoundsSection({ scoring, roundDecision }) {
  const [totalExpanded, setTotalExpanded] = useState(false);
  const [expandedReviewId, setExpandedReviewId] = useState(null);

  const hasResumeReviews = (scoring?.numReviews ?? 0) > 0;
  const hasFrqReviews = (scoring?.numFrqReviews ?? scoring?.frqReviews?.length ?? 0) > 0;
  const hasScoring = hasResumeReviews || hasFrqReviews;
  const isOverridden = scoring?.adminOverride?.overrideScore != null;
  const resumeReviews = scoring?.reviews || [];
  const frqReviews = scoring?.frqReviews || [];
  const coffeeChatEvaluations = scoring?.coffeeChatEvaluations || [];
  const roundGrades = scoring?.roundGrades || [];

  return (
    <SectionCard title="Rounds">
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: css.textDark }}>{ROUND_1_LABEL}</p>
            <DecisionBadge status={roundDecision?.status} />
          </div>

          {hasScoring ? (
            <>
              <AggregateScoreRow scoring={scoring} expanded={totalExpanded} onToggle={() => setTotalExpanded((v) => !v)} />
              {totalExpanded && (
                <div style={{ marginTop: -10, marginBottom: 18 }}>
                  {(scoring.metrics || []).map((metric) => (
                    <CategoryRow
                      key={metric}
                      metric={metric}
                      value={scoring.categoryScores?.[metric]}
                      maxPerCategory={metric === FRQ_METRIC ? 4 : scoring.maxPerCategory}
                    />
                  ))}
                </div>
              )}

              {(isOverridden || hasText(roundDecision?.notes)) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
                  {isOverridden && (
                    <div>
                      <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: "#E24B4A" }}>
                        Admin override — {formatScore(scoring.adminOverride.overrideScore)}%
                      </p>
                      {hasText(scoring.adminOverride.adminNotes) && (
                        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: css.textDark }}>
                          {scoring.adminOverride.adminNotes.trim()}
                        </p>
                      )}
                    </div>
                  )}
                  {hasText(roundDecision?.notes) && (
                    <div>
                      <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: css.textGray }}>
                        Deliberation notes
                      </p>
                      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: css.textDark }}>
                        {roundDecision.notes.trim()}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: css.textDark, borderTop: `1px solid ${css.borderLight}`, paddingTop: 16 }}>
                {resumeReviews.length + frqReviews.length} {resumeReviews.length + frqReviews.length === 1 ? "reviewer" : "reviewers"}
              </p>
              <div>
                {resumeReviews.map((review, index) => (
                  <ReviewRow
                    key={review.id}
                    review={review}
                    isFirst={index === 0}
                    maxPerCategory={scoring.maxPerCategory}
                    expanded={expandedReviewId === review.id}
                    onToggle={() => setExpandedReviewId((id) => (id === review.id ? null : review.id))}
                  />
                ))}
                {frqReviews.map((review, index) => (
                  <FrqReviewRow key={review.id} review={review} isFirst={resumeReviews.length === 0 && index === 0} />
                ))}
              </div>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 14, color: css.textGray }}>No resume screen reviews yet.</p>
          )}
        </div>

        {UPCOMING_EVALUATION_ROUNDS.map((round, roundIndex) => {
          const roundGrade = roundGrades.find((entry) => entry.roundType === round.type);
          const evaluations = roundGrade?.evaluations || (roundIndex === 0 ? coffeeChatEvaluations : []);
          return (
          <div key={roundGrade?.roundId || round.id} style={{ borderTop: `1px solid ${css.borderLight}`, paddingTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: css.textDark }}>{round.label}</p>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  padding: "4px 9px",
                  borderRadius: 20,
                  background: css.surfaceMuted,
                  color: css.textGray,
                }}
              >
                {evaluations.length ? titleCase(roundGrade?.roundStatus || "in progress") : "Upcoming"}
              </span>
            </div>
            {evaluations.length ? (
              <>
                <p style={{ margin: "0 0 2px", fontSize: 13, color: css.textGray }}>
                  {roundIndex === 0 ? `${formatScore(scoring.coffeeChatScore || 0)} points from ` : ""}{evaluations.length}
                  {roundIndex === 0 && Number.isFinite(scoring.coffeeChatExpectedEvaluationCount) ? ` / ${scoring.coffeeChatExpectedEvaluationCount}` : ""} {evaluations.length === 1 ? "rating" : "ratings"}
                </p>
                <div>
                  {evaluations.map((evaluation, index) => (
                    <InterviewEvaluationRow key={evaluation.id} evaluation={evaluation} isFirst={index === 0} round={roundGrade} />
                  ))}
                </div>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 14, color: css.textGray, lineHeight: 1.5 }}>
                Scoring and feedback for this round will appear here once evaluations begin.
              </p>
            )}
          </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
