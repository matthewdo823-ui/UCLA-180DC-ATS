import { useState } from "react";
import { css } from "../../theme/colors";
import { formatDate, formatScore, titleCase } from "../../utils/format";
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
  const max = scoring?.compositeMax ?? scoring?.resumeMax;

  return (
    <button type="button" onClick={onToggle} style={{ ...unstyledButton, padding: "4px 0 18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 30, fontWeight: 700, color: cardGreen, lineHeight: 1 }}>
            {formatScore(scoring.aggregateScore)}
            {max != null && <span style={{ fontSize: 16, fontWeight: 600, color: css.textGray }}>/{formatScore(max)}</span>}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: css.textGray }}>aggregate score</p>
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
          {formatScore(review.score)}{review.maxScore != null ? `/${formatScore(review.maxScore)}` : ""}
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
          {formatScore(review.score)}/4
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

export default function ApplicationRoundsSection({ scoring, roundDecision }) {
  const [totalExpanded, setTotalExpanded] = useState(false);
  const [expandedReviewId, setExpandedReviewId] = useState(null);

  const hasResumeReviews = (scoring?.numReviews ?? 0) > 0;
  const hasFrqReviews = (scoring?.numFrqReviews ?? scoring?.frqReviews?.length ?? 0) > 0;
  const hasScoring = hasResumeReviews || hasFrqReviews;
  const isOverridden = scoring?.adminOverride?.overrideScore != null;
  const resumeReviews = scoring?.reviews || [];
  const frqReviews = scoring?.frqReviews || [];

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

        {UPCOMING_EVALUATION_ROUNDS.map((round) => (
          <div key={round.id} style={{ borderTop: `1px solid ${css.borderLight}`, paddingTop: 20 }}>
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
                  background: "rgba(0,0,0,0.04)",
                  color: css.textGray,
                }}
              >
                Upcoming
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 14, color: css.textGray, lineHeight: 1.5 }}>
              Scoring and feedback for this round will appear here once evaluations begin.
            </p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
