import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth, useAuthedFetch } from "../../auth/AuthContext";
import { API } from "../../constants/config";
import { qk } from "../../lib/queryKeys";
import { scoreboardQueryOptions } from "../../lib/scoreboardQuery";
import { candidateProfileQueryOptions } from "../../lib/candidateApplicationQuery";
import { css, coffeeRatingColors } from "../../theme/colors";
import CandidateAvatar from "../../components/CandidateAvatar/CandidateAvatar";
import CandidateProfileButton from "../../components/CandidateProfileButton/CandidateProfileButton";
import Topbar from "../../components/Topbar/Topbar";
import PageLoader from "../../components/PageLoader";
import ErrorBanner from "../../components/ErrorBanner/ErrorBanner";
import { UserFriendlyError, formatResponseError } from "../../utils/errors";
import { pageTitleStyle, sansFont } from "../../theme/typography";
import { formatScore, hasNumericScore, titleCase } from "../../utils/format";
import { isAdminRole } from "../../utils/auth";
import { formatReviewCountPairStacked, formatReviewCountsStacked, getFreeResponseReviewCount, getResumeReviewCount } from "../../utils/reviewCounts";
import { FRQ_METRIC, FRQ_MAX_SCORE } from "../../constants/frq";
import {
  buildDecisionPayload,
  canRecordCommitteeDecision,
  confirmsDecisionReload,
  confirmsDecisionSave,
  DECISION_STYLE,
  exportCandidatesDecisionCsv,
  getCandidateDecisionStatus,
  getCommitteeLinkWarning,
  patchScoreboardWithDecision,
  recomputeDecisionStats,
} from "./decisionUtils";
import { equalizeCandidateScores, recomputeEqualizedStats } from "./equalizeUtils";
import { useBiasAdjustPreference } from "./useBiasAdjustPreference";
import {
  applyOptimisticDeliberationVote,
  confirmsDeliberationVoteReload,
  patchScoreboardWithDeliberationVote,
} from "./deliberationVoteUtils";
import AdvanceEmailModal from "./AdvanceEmailModal";
import ReviewOverrideSection from "../../components/ReviewOverride/ReviewOverrideSection";
import CandidateSignalActions, { CandidateSignalBadges } from "../../components/CandidateSignalActions/CandidateSignalActions";
import { isInterviewRoundType } from "../../constants/rounds";
import {
  compareCandidates,
  computeScoreCutoffs,
  countActiveFilters,
  defaultFilters,
  filterCandidates,
  formatRoundBanner,
  formatRoundStatus,
  getHeadlineScore,
  getReviewerInitials,
  getReviewerLabel,
  getReviewTotal,
  getSourceNormalizedScore,
  normalizeMetricScore,
  scoreColor,
  SORT_TABS,
  uniqueSortedStrings,
  sortYears,
} from "./scoreboardViewModel";
const cardGreen = "#085041";
const cardMint = "#1D9E75";
const cardPale = "#EAF3DE";
const cardLime = "#C0DD97";

const SCOREBOARD_THEME = {
  pageBg: css.bgLight,
  text: css.textDark,
  textMuted: css.textGray,
  cardBg: css.cardWhite,
  border: css.borderLight,
  accent: css.greenDark,
  titleAccent: css.greenDark,
  rowBg: css.cardWhite,
  rowFocus: "rgba(128, 128, 128, 0.18)",
  statValue: css.textDark,
  btnGhostBg: css.cardWhite,
  btnGhostText: css.textDark,
  selectBg: css.cardWhite,
  selectText: css.textDark,
  chipActiveBg: "rgba(40, 98, 65, 0.1)",
  infoBg: "rgba(40, 98, 65, 0.06)",
  infoBorder: "rgba(40, 98, 65, 0.18)",
};

function DecisionReadonlyBadge({ status, dark, label }) {
  const style = DECISION_STYLE[status] || DECISION_STYLE.pending;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "7px 12px",
        borderRadius: 8,
        border: `1px solid ${style.bd}`,
        background: style.bg,
        color: style.color,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
        opacity: dark ? 0.95 : 1,
      }}
    >
      {label || style.label}
    </span>
  );
}

function DecisionButtons({ status, disabled, saving, onSelect, dark }) {
  const options = ["advance", "hold", "reject"];
  const shellBorder = dark ? "rgba(255,255,255,0.14)" : css.borderLight;
  const shellBg = dark ? "#1C2A42" : "var(--color-surface-muted)";
  const divider = dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
  const idleColor = dark ? "#8FA3B8" : css.textGray;

  return (
    <div
      style={{
        display: "inline-flex",
        borderRadius: 8,
        border: `1px solid ${shellBorder}`,
        overflow: "hidden",
        background: shellBg,
      }}
    >
      {options.map((decision, index) => {
        const selected = status === decision;
        const style = DECISION_STYLE[decision];
        return (
          <button
            key={decision}
            type="button"
            title={selected ? `Clear ${style.label}` : style.label}
            aria-pressed={selected}
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(selected ? "pending" : decision);
            }}
            style={{
              border: "none",
              borderRight: index < options.length - 1 ? `1px solid ${divider}` : "none",
              background: selected ? style.color : "transparent",
              color: selected ? style.selectedText || "#FFF" : idleColor,
              padding: "7px 12px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.02em",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.45 : saving ? 0.8 : 1,
              minWidth: 68,
              whiteSpace: "nowrap",
              transition: "background 0.15s ease, color 0.15s ease",
            }}
          >
            {style.label}
          </button>
        );
      })}
    </div>
  );
}

// Same scale as Coffee Chat grading, laid out worst → best left to right.
const DELIBERATION_VOTE_OPTIONS = [
  { id: "strong_no", label: "Strong no", color: coffeeRatingColors.strong_no, bg: "rgba(226,75,74,0.10)" },
  { id: "no", label: "No", color: coffeeRatingColors.no, bg: "rgba(239,159,39,0.12)" },
  { id: "yes", label: "Yes", color: coffeeRatingColors.yes, bg: "rgba(83,164,125,0.12)" },
  { id: "strong_yes", label: "Strong yes", color: coffeeRatingColors.strong_yes, bg: "rgba(6,78,59,0.16)" },
];

// Open, live committee vote shown to everyone during deliberation. The voter's
// own pick highlights; the tally underneath reflects the whole committee.
function DeliberationVotePanel({ vote, canVote, votingAvailable, saving, onSelect }) {
  const breakdown = vote?.breakdown || { strong_yes: 0, yes: 0, no: 0, strong_no: 0 };
  const count = vote?.count || 0;
  const net = vote?.net || 0;
  const myRating = vote?.myRating || null;
  const maxCount = Math.max(1, ...DELIBERATION_VOTE_OPTIONS.map((option) => breakdown[option.id] || 0));
  const netColor = net > 0 ? coffeeRatingColors.strong_yes : net < 0 ? coffeeRatingColors.strong_no : css.textGray;

  return (
    <div style={{ padding: "18px", background: "#FAFBFA" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: css.textGray }}>
          Committee vote
        </p>
        <span style={{ fontSize: 12, color: css.textGray }}>
          <strong style={{ color: netColor, fontSize: 14 }}>{net > 0 ? `+${net}` : net}</strong>
          {" · "}{count} vote{count === 1 ? "" : "s"}
        </span>
      </div>

      {votingAvailable === false ? (
        <p style={{ margin: 0, fontSize: 12, color: css.textGray }}>
          Voting needs database migration #41 before it can open.
        </p>
      ) : (
        <>
          <div role="group" aria-label="Your deliberation vote" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6, marginBottom: 12 }}>
            {DELIBERATION_VOTE_OPTIONS.map((option) => {
              const selected = myRating === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={!canVote}
                  aria-pressed={selected}
                  title={!canVote ? "Voting opens once this round reaches Deliberation" : selected ? `Clear ${option.label}` : `Change vote to ${option.label}`}
                  onClick={() => onSelect(selected ? "" : option.id)}
                  style={{
                    display: "flex", justifyContent: "center", alignItems: "center", minHeight: 40,
                    border: `1px solid ${selected ? option.color : css.borderLight}`,
                    borderRadius: 8, padding: "9px 6px",
                    background: selected ? option.bg : "#FFF",
                    color: selected ? option.color : css.textGray,
                    fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                    cursor: !canVote ? "not-allowed" : "pointer",
                    opacity: !canVote ? 0.6 : 1,
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <p aria-live="polite" style={{ margin: "10px 0 12px", fontSize: 11, color: css.textGray }}>
            {saving
              ? "Saving your vote… You can change it again while this saves."
              : myRating
                ? "Saved automatically. Choose another option to recast, or click your selection to clear it."
                : "Choose an option to vote. Your selection saves automatically."}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {DELIBERATION_VOTE_OPTIONS.map((option) => {
              const optionCount = breakdown[option.id] || 0;
              return (
                <div key={option.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 72, flexShrink: 0, fontSize: 11, color: css.textGray }}>{option.label}</span>
                  <div style={{ flex: 1, height: 10, borderRadius: 6, background: "#ECEEEC", overflow: "hidden" }}>
                    <div style={{ width: "100%", height: "100%", borderRadius: 6, background: option.color, transformOrigin: "left", transform: `scaleX(${optionCount / maxCount})`, transition: "transform 0.2s ease" }} />
                  </div>
                  <span style={{ width: 18, flexShrink: 0, textAlign: "right", fontSize: 11, fontWeight: 700, color: css.greenDark }}>{optionCount}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function DeliberationVoteModal({ candidate, canVote, votingAvailable, saving, onSelect, onClose }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!candidate) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Vote on ${candidate.name}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        background: "rgba(17, 24, 39, 0.58)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "min(420px, 100%)", overflow: "hidden", borderRadius: 14, border: `1px solid ${css.borderLight}`, background: "#FAFBFA", boxShadow: "0 24px 70px rgba(0,0,0,0.26)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "16px 18px", borderBottom: `1px solid ${css.borderLight}`, background: "#FFF" }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: "0 0 3px", color: css.textGray, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Cast your vote
            </p>
            <h2 style={{ margin: 0, color: css.textDark, fontFamily: sansFont, fontSize: 19, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {candidate.name}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close voting popup"
            onClick={onClose}
            style={{ width: 32, height: 32, flexShrink: 0, borderRadius: "50%", border: `1px solid ${css.borderLight}`, background: "#FFF", color: css.textDark, cursor: "pointer", fontSize: 20, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        <DeliberationVotePanel
          vote={candidate.deliberationVote}
          canVote={canVote}
          votingAvailable={votingAvailable}
          saving={saving}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}

function FilterField({ label, theme, fillRow = false, children }) {
  return (
    <label style={{
      display: "flex",
      flexDirection: "column",
      flex: fillRow ? "1 1 0" : undefined,
      minWidth: fillRow ? 0 : undefined,
      gap: 4,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: theme.textMuted,
    }}
    >
      {label}
      {children}
    </label>
  );
}

function buildActiveFilterPills(filters, deliberationMode) {
  const pills = [];
  const effective = deliberationMode ? filters : { ...filters, decision: "all" };

  if (effective.major !== "all") {
    pills.push({ key: "major", label: `Major: ${effective.major}`, clear: { major: "all" } });
  }
  if (effective.year !== "all") {
    pills.push({ key: "year", label: `Year: ${effective.year}`, clear: { year: "all" } });
  }
  if (effective.reviews !== "all") {
    const reviewLabels = { 0: "No resume reviews", 1: "1 resume review", "1+": "Resume reviewed", "2+": "2+ resume reviews" };
    pills.push({ key: "reviews", label: reviewLabels[effective.reviews] || effective.reviews, clear: { reviews: "all" } });
  }
  if (effective.scoreBand !== "all") {
    const bandLabels = { top: "Top 20%", strong: "Top 30%", low: "Low <60%", pending: "No score" };
    pills.push({ key: "scoreBand", label: bandLabels[effective.scoreBand] || effective.scoreBand, clear: { scoreBand: "all" } });
  }
  if (effective.signals !== "all") {
    pills.push({
      key: "signals",
      label: effective.signals === "referred" ? "Referred" : "Flagged",
      clear: { signals: "all" },
    });
  }
  if (deliberationMode && effective.decision !== "all") {
    const decisionLabels = {
      undecided: "Undecided",
      pending: "Pending",
      advance: "Advanced",
      hold: "Hold",
      reject: "Rejected",
      not_advanced: "Cut this round",
    };
    pills.push({
      key: "decision",
      label: decisionLabels[effective.decision] || effective.decision,
      clear: { decision: "all" },
    });
  }

  return pills;
}

function ReviewerStack({ reviews }) {
  const palette = [
    { bg: "var(--color-info-bg)", color: "var(--color-info-text)" },
    { bg: "var(--color-warning-bg)", color: "var(--color-warning-text)" },
    { bg: "var(--color-danger-bg)", color: "var(--color-danger-text)" },
    { bg: "var(--color-success-bg)", color: "var(--color-success-text)" },
  ];

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {reviews.slice(0, 4).map((review, index) => (
        <div
          key={review.id ?? index}
          title={`Review ${index + 1}`}
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: palette[index % palette.length].bg,
            color: palette[index % palette.length].color,
            border: "1.5px solid #FFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 8,
            fontWeight: 700,
            marginLeft: index ? -5 : 0,
          }}
        >
          {getReviewerInitials(review, index)}
        </div>
      ))}
    </div>
  );
}

function ScoreTiles({ score, maxScore }) {
  const filled = hasNumericScore(score) ? Math.round(Number(score)) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 2 }}>
      {Array.from({ length: maxScore }).map((_, index) => (
        <div
          key={index}
          style={{
            width: 9,
            height: 9,
            borderRadius: 2,
            background: index < filled ? cardMint : cardLime,
          }}
        />
      ))}
    </div>
  );
}

function CategoryRow({ metric, value, maxPerCategory = 4, equalized = false }) {
  const pct = hasNumericScore(value) ? Math.max(0, Math.min(100, (Number(value) / maxPerCategory) * 100)) : 0;

  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: css.textDark }}>{titleCase(metric)}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-card-ink)" }}>
          {equalized ? (
            <>{formatScore(pct)}%</>
          ) : (
            <>
              {formatScore(value)} <span style={{ color: css.textGray, fontWeight: 400 }}>/ {maxPerCategory}</span>
            </>
          )}
        </span>
      </div>
      <div style={{ height: 5, background: "var(--color-track)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: "100%", background: cardMint, transformOrigin: "left", transform: `scaleX(${Math.max(0, Math.min(100, pct)) / 100})`, transition: "transform 0.35s ease" }} />
      </div>
    </div>
  );
}

function ScorecardModal({
  candidate,
  onClose,
  onOpenProfile,
  round = null,
  metrics = [],
  maxPerCategory = 4,
  equalized = false,
  isAdmin = false,
  onOverrideSaved,
}) {
  const [reviewersOpen, setReviewersOpen] = useState(false);
  // Prefer this candidate's own (year-specific) rubric categories; fall back to the
  // cross-year union only for older payloads that don't carry rubricMetrics.
  const displayMetrics = candidate?.rubricMetrics ?? metrics;
  const headlineScore = getHeadlineScore(candidate);
  const sourceNormalizedScore = getSourceNormalizedScore(candidate);
  const reviews = candidate?.reviews ?? [];
  const frqReviews = candidate?.frqReviews ?? [];
  const latestNote = [...reviews, ...frqReviews].reverse().find(review => review.notes)?.notes;

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!candidate) return null;

  const roundBanner = formatRoundBanner(round);
  const roundStatus = formatRoundStatus(round);

  return (
    <div
      className="scorecard-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${candidate.name} ${round?.name || "scorecard"}`}
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        background: "rgba(17, 24, 39, 0.58)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div className="scorecard-shell" style={{ width: "min(440px, 100%)", position: "relative", perspective: 900 }}>
        <button
          aria-label="Close scorecard"
          onClick={onClose}
          style={{
            position: "absolute",
            right: -12,
            top: -12,
            width: 34,
            height: 34,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.75)",
            background: "var(--color-surface)",
            color: "var(--color-card-ink)",
            cursor: "pointer",
            fontSize: 22,
            lineHeight: "30px",
            boxShadow: "0 12px 28px rgba(0,0,0,0.18)",
            zIndex: 1,
          }}
        >
          ×
        </button>

        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#FFF", textAlign: "center", margin: "0 0 10px", flexShrink: 0 }}>
          {roundBanner}
        </p>

        <div className="scorecard-body" style={{ borderRadius: 16, border: `2px solid ${cardGreen}`, background: "var(--color-surface)", boxShadow: "0 24px 70px rgba(0,0,0,0.26)" }}>
          <div style={{ background: cardGreen, padding: "18px 18px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
              <span style={{ background: "#04342C", color: "#9FE1CB", fontSize: 10, fontWeight: 700, padding: "4px 9px", borderRadius: 20, letterSpacing: "0.04em" }}>
                {roundBanner}
              </span>
              <span style={{ background: "rgba(255,255,255,0.1)", color: cardLime, fontSize: 10, fontWeight: 700, padding: "4px 9px", borderRadius: 20, border: `1px solid ${cardMint}` }}>
                {roundStatus}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <CandidateProfileButton resumeId={candidate.id} candidateName={candidate.name} onOpen={onOpenProfile} style={{ borderRadius: "50%", flexShrink: 0 }}>
                <CandidateAvatar
                  name={candidate.name}
                  headshot={candidate.headshot}
                  candidateId={candidate.candidateId}
                  size={56}
                  background={cardMint}
                  color={cardPale}
                  border="2px solid #5DCAA5"
                  fontSize={17}
                />
              </CandidateProfileButton>
              <div style={{ minWidth: 0 }}>
                <button
                  type="button"
                  onClick={() => onOpenProfile?.(candidate.id)}
                  style={{ display: "block", border: "none", background: "transparent", color: cardPale, fontSize: 18, fontFamily: sansFont, fontWeight: 600, margin: "0 0 3px", padding: 0, lineHeight: 1.15, cursor: onOpenProfile ? "pointer" : "default", textAlign: "left" }}
                >
                  {candidate.name}
                </button>
                <p style={{ color: "#9FE1CB", fontSize: 12, margin: "0 0 2px" }}>{candidate.major || "Undeclared"}</p>
                <p style={{ color: "#5DCAA5", fontSize: 11, margin: 0 }}>
                  {[candidate.email, candidate.phoneNumber].filter(Boolean).join(" · ") || "Contact not recorded"}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
              {candidate.year && <span style={chipStyle}>{candidate.year}</span>}
              {candidate.gpa && <span style={chipStyle}>GPA {candidate.gpa}</span>}
              {candidate.gm && <span style={chipStyle}>GM {candidate.gm}</span>}
            </div>
            {candidate.interestEvents?.length ? (
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ color: "#9FE1CB", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em" }}>ATTENDED</span>
                {candidate.interestEvents.map((event) => <span key={event.id} style={chipStyle}>{event.name}</span>)}
              </div>
            ) : null}
          </div>

          <div style={{ background: "var(--color-card-pale)", padding: "11px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--color-border)" }}>
            <div>
              <p style={{ fontSize: 10, color: "var(--color-card-pale-text)", margin: "0 0 2px", fontWeight: 700, letterSpacing: "0.05em" }}>
                {equalized ? "BIAS-ADJUSTED" : "NORMALIZED"} SCORE
              </p>
              <p style={{ fontSize: 30, fontWeight: 700, color: "var(--color-card-ink)", margin: 0, lineHeight: 1 }}>
                {formatScore(headlineScore)}<span style={{ fontSize: 14, color: "var(--color-card-pale-text)" }}>%</span>
              </p>
              {equalized && sourceNormalizedScore != null ? (
                <p style={{ fontSize: 11, color: "var(--color-card-pale-text)", margin: "4px 0 0" }}>
                  Unadjusted: {formatScore(sourceNormalizedScore)}%
                </p>
              ) : hasNumericScore(headlineScore) ? (
                <p style={{ fontSize: 11, color: "var(--color-card-pale-text)", margin: "4px 0 0" }}>
                  Average across submitted reviews
                  {candidate.frqPending ? " · FRQ pending" : ""}
                </p>
              ) : null}
              {hasNumericScore(candidate.baseNormalizedScore) && Number(candidate.interestMultiplier) !== 1 ? (
                <p style={{ fontSize: 11, color: "var(--color-card-pale-text)", margin: "4px 0 0", fontWeight: 600 }}>
                  {formatScore(candidate.baseNormalizedScore)}% × {Number(candidate.interestMultiplier).toFixed(3).replace(/0$/, "")} Demonstrated Interest
                </p>
              ) : null}
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 10, color: "var(--color-card-pale-text)", margin: "0 0 6px", fontWeight: 700, letterSpacing: "0.05em" }}>{displayMetrics.length} CATEGORIES</p>
              <ScoreTiles score={headlineScore} maxScore={100} />
            </div>
          </div>

          <div style={{ padding: "14px 18px 4px" }}>
            <p style={{ fontSize: 10, color: css.textGray, letterSpacing: "0.06em", margin: "0 0 10px", fontWeight: 700 }}>CATEGORY BREAKDOWN</p>
            {displayMetrics.map(metric => (
              <CategoryRow
                key={metric}
                metric={metric}
                maxPerCategory={metric === FRQ_METRIC ? FRQ_MAX_SCORE : maxPerCategory}
                equalized={equalized}
                value={normalizeMetricScore(candidate, metric)}
              />
            ))}
          </div>

          {latestNote && (
            <div style={{ margin: "6px 18px 0", padding: "10px 12px", background: "var(--color-surface-subtle)", border: "1px solid var(--color-border)", borderRadius: 8 }}>
              <p style={{ fontSize: 10, color: css.textGray, letterSpacing: "0.05em", margin: "0 0 5px", fontWeight: 700 }}>LATEST NOTE</p>
              <p style={{ fontSize: 12, lineHeight: 1.45, color: css.textDark, margin: 0 }}>{latestNote}</p>
            </div>
          )}

          <div style={{ padding: "12px 18px 18px", borderTop: "1px solid var(--color-border)", marginTop: 12 }}>
            <button
              onClick={() => setReviewersOpen(open => !open)}
              aria-expanded={reviewersOpen}
              style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", padding: 0 }}
            >
              <span style={{ fontSize: 11, color: css.textGray, fontWeight: 700, letterSpacing: "0.05em" }}>
                <span style={{ display: "block" }}>REVIEWS</span>
                <span style={{ display: "block", marginTop: 3, fontWeight: 500, letterSpacing: 0, lineHeight: 1.45, textTransform: "none", whiteSpace: "pre-line" }}>
                  {formatReviewCountPairStacked(reviews.length, frqReviews.length)}
                </span>
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ReviewerStack reviews={reviews} />
                <span style={{ color: css.textGray, transform: reviewersOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>⌄</span>
              </div>
            </button>

            {reviewersOpen && (
              <div style={{ marginTop: 10 }}>
                {reviews.map((review, index) => {
                  const reviewOverridden = review?.adminOverride?.overrideScore != null;
                  const reviewMax = Number(review?.maxScore)
                    || Math.max(Object.keys(review?.scores || {}).length * maxPerCategory, maxPerCategory);
                  const normalizedReviewScore = hasNumericScore(review.normalizedScore)
                    ? Number(review.normalizedScore)
                    : Number(getReviewTotal(review)) / reviewMax * 100;
                  const displayScore = `${formatScore(Math.min(100, normalizedReviewScore))}%`;

                  return (
                  <div key={review.id ?? index} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid var(--color-border)" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--color-info-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "var(--color-info-text)", flexShrink: 0 }}>
                      {getReviewerInitials(review, index)}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 12, color: css.textDark, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{getReviewerLabel(review, index)}</p>
                      <p style={{ fontSize: 11, color: css.textGray, margin: 0 }}>
                        {review.submittedAt ? new Date(review.submittedAt).toLocaleDateString() : "Submitted"}
                        {reviewOverridden ? " · overridden" : " · Resume"}
                      </p>
                    </div>
                    <div style={{ fontSize: 12, color: reviewOverridden ? "#E24B4A" : cardGreen, fontWeight: 700 }}>
                      {displayScore}
                    </div>
                  </div>
                  );
                })}
                {frqReviews.map((review, index) => {
                  const normalizedReviewScore = hasNumericScore(review.normalizedScore)
                    ? Number(review.normalizedScore)
                    : Number(review.score ?? getReviewTotal(review)) / FRQ_MAX_SCORE * 100;
                  const displayScore = `${formatScore(Math.min(100, normalizedReviewScore))}%`;

                  return (
                    <div key={review.id ?? `frq-${index}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid var(--color-border)" }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--color-purple-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "var(--color-purple-text)", flexShrink: 0 }}>
                        {getReviewerInitials(review, index)}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: 12, color: css.textDark, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {getReviewerLabel(review, index)}
                        </p>
                        <p style={{ fontSize: 11, color: css.textGray, margin: 0 }}>
                          {review.submittedAt ? new Date(review.submittedAt).toLocaleDateString() : "Submitted"}
                          {" · Application responses"}
                        </p>
                        {review.notes ? (
                          <p style={{ fontSize: 11, color: css.textDark, margin: "4px 0 0", lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
                            {review.notes}
                          </p>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--color-card-ink)", fontWeight: 700 }}>
                        {displayScore}
                      </div>
                    </div>
                  );
                })}
                {reviews.length === 0 && frqReviews.length === 0 ? (
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: css.textGray }}>No resume or free response reviews yet.</p>
                ) : null}
              </div>
            )}
          </div>

          {isAdmin ? (
            <ReviewOverrideSection
              resumeId={candidate.id}
              reviews={reviews}
              metrics={displayMetrics}
              maxPerCategory={maxPerCategory}
              onOverrideSaved={onOverrideSaved}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

const chipStyle = {
  background: "#04342C",
  color: "#9FE1CB",
  fontSize: 10,
  padding: "4px 9px",
  borderRadius: 20,
  fontWeight: 700,
};

const selectStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 6,
  border: `1px solid ${css.borderLight}`,
  fontSize: 13,
  fontFamily: "'DM Sans', sans-serif",
  color: css.textDark,
  background: "var(--color-surface)",
  cursor: "pointer",
};

function adminMenuItemStyle(theme) {
  return {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "9px 12px",
    borderRadius: 6,
    border: "none",
    background: "transparent",
    color: theme.btnGhostText,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
  };
}

function kbdStyle(theme) {
  return {
    display: "inline-block",
    padding: "2px 6px",
    borderRadius: 4,
    border: `1px solid ${theme.border}`,
    background: theme.btnGhostBg,
    color: theme.text,
    fontSize: 11,
    fontWeight: 700,
    fontFamily: "ui-monospace, monospace",
  };
}

function rowIconBtnStyle(theme, primary) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    padding: 0,
    borderRadius: 6,
    background: primary ? theme.accent : theme.btnGhostBg,
    color: primary ? "var(--color-on-primary)" : theme.text,
    border: primary ? "none" : `1px solid ${theme.border}`,
    cursor: "pointer",
    flexShrink: 0,
  };
}

// Stable identity matters: it's the fallback for `data` before the first fetch
// resolves, and the memos below key off `data.candidates`.
const EMPTY_SCOREBOARD = { stats: null, candidates: [], metrics: [], maxPerCategory: 4, context: null };

export default function ScoreboardPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cycleId = searchParams.get("cycleId") || null;
  const { user, isStaff, token } = useAuth();
  const authedFetch = useAuthedFetch();
  const queryClient = useQueryClient();
  const isAdmin = isAdminRole(user?.role);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [voteCandidate, setVoteCandidate] = useState(null);
  const [filters, setFilters] = useState(() => ({ ...defaultFilters }));
  const [sortBy, setSortBy] = useState("performance_desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [deliberationMode, setDeliberationMode] = useState(false);
  const [equalizeActive, setEqualizeActive] = useBiasAdjustPreference();
  const [savingDecisionIds, setSavingDecisionIds] = useState(() => new Set());
  const [savingVoteIds, setSavingVoteIds] = useState(() => new Set());
  const [decisionError, setDecisionError] = useState("");
  const [decisionNotice, setDecisionNotice] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [advanceRoundBusy, setAdvanceRoundBusy] = useState(false);
  const [bulkDecisionBusy, setBulkDecisionBusy] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [viewingRoundId, setViewingRoundId] = useState(null);
  const [focusedCandidateId, setFocusedCandidateId] = useState(location.state?.selectedCandidateId ?? null);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const adminMenuRef = useRef(null);
  const pendingVoteIdsRef = useRef(new Set());
  // The list is window-scrolled, so the virtualizer needs the list's distance
  // from the top of the document (its scrollMargin) to place rows correctly.
  const listRef = useRef(null);
  const [listOffset, setListOffset] = useState(0);
  const pendingDecisionIdsRef = useRef(new Set());
  const voteSaveQueuesRef = useRef(new Map());
  const latestOptimisticVotesRef = useRef(new Map());

  const scoreboardKey = useMemo(() => qk.scoreboard(viewingRoundId, cycleId), [cycleId, viewingRoundId]);

  // A background refresh can land while a decision or vote is still saving.
  // Preserve the optimistic fields until their own requests finish so controls
  // never snap backward to the server's not-yet-updated row.
  const mergeWithCached = useCallback((json) => {
    if (pendingDecisionIdsRef.current.size === 0 && pendingVoteIdsRef.current.size === 0) return json;
    const prev = queryClient.getQueryData(scoreboardKey);
    const localById = new Map((prev?.candidates || []).map((candidate) => [candidate.id, candidate]));
    const mergedCandidates = (json.candidates || []).map(c => {
      const local = localById.get(c.id);
      if (!local) return c;
      return {
        ...c,
        ...(pendingDecisionIdsRef.current.has(c.id) ? { decision: local.decision } : {}),
        ...(pendingVoteIdsRef.current.has(c.id) ? { deliberationVote: local.deliberationVote } : {}),
      };
    });
    const counts = recomputeDecisionStats(mergedCandidates);
    return {
      ...json,
      candidates: mergedCandidates,
      stats: {
        ...json.stats,
        advanced: counts.advance,
        hold: counts.hold,
        rejected: counts.reject,
        pending: counts.pending,
      },
    };
  }, [queryClient, scoreboardKey]);

  const scoreboardQuery = useQuery({
    ...scoreboardQueryOptions(authedFetch, { roundId: viewingRoundId, cycleId, mergeWithCached }),
    // Never fire without a token. authedFetch omits the Authorization header when
    // the token is gone, so an ungated request lands as "Missing bearer token" —
    // and the deliberation poll below would keep re-sending it. When the token is
    // cleared (e.g. a 401 triggers logout), stop sending and let ProtectedRoute
    // redirect to /login instead.
    enabled: Boolean(token),
    // Deliberation is live committee activity — everyone needs to see decisions
    // and votes as they land, even from the default scoreboard view.
    // A closed historical round can't change, so there's nothing to poll for.
    refetchInterval: (query) => {
      if (!token) return false;
      const context = query.state.data?.context;
      if ((!deliberationMode && context?.canDeliberate !== true) || !isStaff) return false;
      if (context?.viewingHistorical === true) return false;
      return 5000;
    },
  });

  const data = scoreboardQuery.data ?? EMPTY_SCOREBOARD;
  // Only a first load blocks the table; background revalidation keeps the
  // existing rows on screen instead of flashing "Loading candidates…".
  const loading = scoreboardQuery.isPending;
  const viewingHistorical = data.context?.viewingHistorical === true;

  // Shim so the existing optimistic-update call sites keep their `setData(prev => …)`
  // shape — the cache is now the source of truth instead of component state.
  const setData = useCallback((updater) => {
    queryClient.setQueryData(scoreboardKey, (prev) => (
      typeof updater === "function" ? updater(prev ?? EMPTY_SCOREBOARD) : updater
    ));
  }, [queryClient, scoreboardKey]);

  const fetchScoreboard = useCallback((opts = {}) => {
    if (opts.silent !== true) setDecisionError("");
    return queryClient.invalidateQueries({ queryKey: scoreboardKey });
  }, [queryClient, scoreboardKey]);

  const profileCycleId = cycleId || data.context?.cycle?.id || null;
  const prefetchCandidateApplication = useCallback((resumeId) => {
    queryClient.prefetchQuery(candidateProfileQueryOptions(authedFetch, resumeId, profileCycleId));
  }, [authedFetch, profileCycleId, queryClient]);

  const openCandidateWorkspace = useCallback((candidate) => {
    setFocusedCandidateId(candidate.id);
    const cycleQuery = profileCycleId ? `?cycleId=${encodeURIComponent(profileCycleId)}` : "";
    navigate(`/candidates/${candidate.id}${cycleQuery}`, {
      state: {
        returnTo: `${location.pathname}${location.search}`,
        returnLabel: "scoreboard",
        candidateRank: candidate.rank,
        candidateCount: data.stats?.applicants,
        resumeScreenRank: candidate.resumeScreenRank,
        coffeeChatScore: candidate.coffeeChatScore,
        coffeeChatEvaluationCount: candidate.coffeeChatEvaluationCount,
      },
    });
  }, [profileCycleId, data.stats?.applicants, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (scoreboardQuery.error) {
      setDecisionError(scoreboardQuery.error);
    }
  }, [scoreboardQuery.error]);

  useEffect(() => {
    const candidates = scoreboardQuery.data?.candidates;
    if (!candidates) return;
    const hasDecisionSupport = candidates.length === 0
      || Object.prototype.hasOwnProperty.call(candidates[0], "decision");
    if (!hasDecisionSupport) {
      setDecisionError(
        new UserFriendlyError({
          title: "Deliberation Unavailable",
          explanation: "Deliberation decision support is not enabled for this dataset.",
          action: "Please refresh the page or contact an administrator.",
          devDetails: "Candidates array is missing the 'decision' field.",
        })
      );
    }
  }, [scoreboardQuery.data]);

  useEffect(() => {
    if (!adminMenuOpen) return;
    function onPointerDown(event) {
      if (adminMenuRef.current && !adminMenuRef.current.contains(event.target)) {
        setAdminMenuOpen(false);
      }
    }
    function onKeyDown(event) {
      if (event.key === "Escape") setAdminMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [adminMenuOpen]);

  // Keeping the focused candidate in view is handled by a virtualizer-aware
  // effect declared after `rowVirtualizer` (a row may be unmounted when it is
  // off-screen, so we scroll by index rather than by a cached DOM ref).

  const equalizedCandidates = useMemo(() => (
    equalizeCandidateScores(data.candidates ?? [], {
      metrics: data.metrics ?? [],
      maxPerCategory: data.maxPerCategory ?? 4,
    })
  ), [data.candidates, data.metrics, data.maxPerCategory]);

  const candidates = useMemo(() => {
    const base = data.candidates ?? [];
    if (!equalizeActive) return base;
    return equalizedCandidates;
  }, [data.candidates, equalizedCandidates, equalizeActive]);

  const displayStats = useMemo(() => {
    const base = data.stats ?? {};
    if (!equalizeActive || data.context?.rankingMode === "coffee_chat") return base;
    const { avgScore } = recomputeEqualizedStats(candidates);
    return { ...base, avgScore };
  }, [data.context?.rankingMode, data.stats, candidates, equalizeActive]);
  const metrics = useMemo(() => data.metrics ?? [], [data.metrics]);
  const maxPerCategory = data.maxPerCategory ?? 4;
  const activeRound = data.context?.round;
  const isCoffeeChatRanking = data.context?.rankingMode === "coffee_chat";
  const viewingFinalizedRound = viewingHistorical && activeRound?.status === "closed";
  const historicalCutLabel = `Cut at ${activeRound?.name || "this round"}`;
  const liveActiveRound = data.context?.activeRound;
  const nextRound = data.context?.nextRound;
  const allRounds = data.context?.allRounds ?? [];
  const canDeliberate = data.context?.canDeliberate === true;
  const canEditDeliberations = isAdmin && canDeliberate && !viewingHistorical;
  // Voting is open to every staff role while the round sits in Deliberation —
  // it shares that window with decisions but not the admin-only gate.
  const deliberationVotingAvailable = data.context?.deliberationVotingAvailable !== false;
  const canVote = isStaff && canDeliberate && !viewingHistorical && deliberationVotingAvailable;
  // When the round itself is in Deliberation, expose voting from the default
  // scoreboard too; staff should not have to discover a second page-mode toggle.
  const showDeliberationVoting = (deliberationMode || canDeliberate) && !viewingHistorical;
  const canCloseRound = data.context?.canCloseRound === true;
  const undecidedCount = data.context?.undecidedCount ?? 0;
  const advanceNotification = data.context?.notification;
  const pastRounds = useMemo(
    () => allRounds.filter((round) => round.id !== liveActiveRound?.id),
    [allRounds, liveActiveRound?.id]
  );
  const scoreboardLabel = data.context?.cycle && activeRound
    ? `${data.context.cycle.name} · ${activeRound.name}${activeRound.status === "closed" ? " (closed)" : ""}`
    : "Candidate scoreboard";

  const majorOptions = useMemo(
    () => uniqueSortedStrings(candidates.map(c => c.major || "Undeclared")),
    [candidates]
  );

  const yearOptions = useMemo(
    () => sortYears(candidates.map(c => c.year)),
    [candidates]
  );

  const scoreCutoffs = useMemo(() => computeScoreCutoffs(candidates), [candidates]);

  const filteredCandidates = useMemo(() => {
    const effectiveFilters = {
      ...filters,
      ...(!deliberationMode ? { decision: "all" } : {}),
      ...(isCoffeeChatRanking ? { reviews: "all" } : {}),
    };
    const filtered = filterCandidates(candidates, effectiveFilters, searchQuery, scoreCutoffs);
    return [...filtered].sort((a, b) => compareCandidates(a, b, sortBy));
  }, [candidates, filters, searchQuery, sortBy, deliberationMode, isCoffeeChatRanking, scoreCutoffs]);

  // Only the on-screen candidate rows are mounted; the rest of the cycle exists
  // purely as reserved height. This is the Tier 2 render win — a 500-row
  // scoreboard mounts ~15 rows instead of 500. Rows vary in height
  // (deliberation padding, wrapping interest chips), so heights are measured
  // dynamically via measureElement rather than assumed from estimateSize.
  const rowVirtualizer = useWindowVirtualizer({
    count: filteredCandidates.length,
    estimateSize: () => 72,
    overscan: 8,
    scrollMargin: listOffset,
    getItemKey: (index) => filteredCandidates[index]?.id ?? index,
  });

  // The list sits below a variable-height header (filter pills wrap, the
  // deliberation progress bar appears and disappears), so re-measure its
  // document offset whenever that layout can change, and on window resize.
  useLayoutEffect(() => {
    const measure = () => {
      if (!listRef.current) return;
      const rect = listRef.current.getBoundingClientRect();
      setListOffset(rect.top + window.scrollY);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [deliberationMode, isCoffeeChatRanking, loading, filteredCandidates.length]);

  // Keep the focused candidate (arrow-key navigation, deep-linked selection) in
  // view. An off-screen row is unmounted, so there is no DOM node to
  // scrollIntoView — we scroll by index through the virtualizer instead.
  useEffect(() => {
    if (focusedCandidateId == null) return;
    const index = filteredCandidates.findIndex(
      (c) => String(c.id) === String(focusedCandidateId)
    );
    if (index < 0) return;
    // "auto" only scrolls when the row is outside the viewport: arrow-key steps
    // to an already-visible neighbor stay put, while a deep-linked candidate far
    // off-screen is brought into view.
    rowVirtualizer.scrollToIndex(index, { align: "auto" });
  }, [focusedCandidateId, filteredCandidates, rowVirtualizer]);

  useEffect(() => {
    if (!isCoffeeChatRanking) return;
    setFilters(current => (
      current.reviews === "all" ? current : { ...current, reviews: "all" }
    ));
  }, [isCoffeeChatRanking]);

  const loadScoreboardVerificationSnapshot = useCallback(async () => {
    const params = new URLSearchParams();
    if (viewingRoundId) params.set("roundId", viewingRoundId);
    if (cycleId) params.set("cycleId", cycleId);
    const query = params.size ? `?${params.toString()}` : "";
    const res = await authedFetch(`${API}/scoreboard${query}`);
    if (!res.ok) {
      throw await formatResponseError(
        res,
        "verifying the saved scoreboard update",
        "Check GET /scoreboard in server/src/routes/resumeRoutes.js"
      );
    }
    return res.json();
  }, [authedFetch, cycleId, viewingRoundId]);

  const saveDecision = useCallback(async (candidate, decision) => {
    if (!canEditDeliberations || !deliberationMode || pendingDecisionIdsRef.current.has(candidate.id)) return;

    const previousDecision = candidate.decision;
    const requestedNotes = String(candidate.decision?.notes || "").slice(0, 1000);
    const optimisticDecision = buildDecisionPayload(decision, requestedNotes);
    const expected = {
      resumeId: candidate.id,
      candidateId: candidate.candidateId || null,
      cycleId: data.context?.cycle?.id,
      roundId: activeRound?.id,
      status: decision,
      notes: requestedNotes,
    };

    pendingDecisionIdsRef.current.add(candidate.id);
    setData(prev => patchScoreboardWithDecision(prev, candidate.id, optimisticDecision));
    setSelectedCandidate(prev => (prev?.id === candidate.id ? { ...prev, decision: optimisticDecision } : prev));
    setSavingDecisionIds(prev => new Set(prev).add(candidate.id));
    setDecisionError("");
    setDecisionNotice("");

    try {
      const res = await authedFetch(`${API}/scoreboard/decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_id: candidate.id,
          candidate_id: candidate.candidateId || undefined,
          decision,
          notes: requestedNotes,
        }),
      });
      if (!res.ok) {
        throw await formatResponseError(
          res,
          "saving candidate decision",
          "Check POST /scoreboard/decisions endpoint in server/src/routes/dashboardRoutes.js"
        );
      }
      const body = await res.json();
      if (!confirmsDecisionSave(body, expected)) {
        throw new Error("The server did not confirm the exact candidate, round, and decision that were submitted.");
      }

      const snapshot = await loadScoreboardVerificationSnapshot();
      if (!confirmsDecisionReload(snapshot, expected)) {
        throw new Error("The saved decision could not be verified in a fresh scoreboard read.");
      }

      pendingDecisionIdsRef.current.delete(candidate.id);
      setData(mergeWithCached(snapshot));
      const confirmed = snapshot.candidates.find(row => row.id === candidate.id)?.decision || body.decision;
      setSelectedCandidate(prev => (prev?.id === candidate.id ? { ...prev, decision: confirmed } : prev));
      setDecisionNotice(`${candidate.name} is saved as ${DECISION_STYLE[decision]?.label || decision}.`);
    } catch (err) {
      pendingDecisionIdsRef.current.delete(candidate.id);
      setData(prev => patchScoreboardWithDecision(prev, candidate.id, previousDecision || buildDecisionPayload("pending")));
      setSelectedCandidate(prev => (
        prev?.id === candidate.id ? { ...prev, decision: previousDecision || buildDecisionPayload("pending") } : prev
      ));
      setDecisionError(err);
      try {
        await fetchScoreboard({ silent: true });
      } catch {
        // Keep the original save/verification error visible. The next live poll
        // will reconcile the scoreboard if this recovery refresh also fails.
      }
    } finally {
      pendingDecisionIdsRef.current.delete(candidate.id);
      setSavingDecisionIds(prev => {
        const next = new Set(prev);
        next.delete(candidate.id);
        return next;
      });
    }
  }, [activeRound?.id, authedFetch, canEditDeliberations, data.context?.cycle?.id, deliberationMode, fetchScoreboard, loadScoreboardVerificationSnapshot, mergeWithCached, setData]);

  const saveVote = useCallback((candidate, rating) => {
    if (!canVote) return;

    const requestedRating = rating || "";
    const previousOptimisticVote = latestOptimisticVotesRef.current.get(candidate.id)
      ?? candidate.deliberationVote
      ?? null;
    const optimisticVote = applyOptimisticDeliberationVote(previousOptimisticVote, requestedRating);
    latestOptimisticVotesRef.current.set(candidate.id, optimisticVote);
    pendingVoteIdsRef.current.add(candidate.id);

    // Every click updates immediately. Requests for the same candidate are then
    // serialized so a slow earlier response can never overwrite a newer recast.
    setData(prev => patchScoreboardWithDeliberationVote(prev, candidate.id, optimisticVote));
    setSelectedCandidate(prev => (
      prev?.id === candidate.id
        ? { ...prev, deliberationVote: optimisticVote }
        : prev
    ));
    setVoteCandidate(prev => (
      prev?.id === candidate.id
        ? { ...prev, deliberationVote: optimisticVote }
        : prev
    ));
    setSavingVoteIds(prev => new Set(prev).add(candidate.id));
    setDecisionError("");

    const previousSave = voteSaveQueuesRef.current.get(candidate.id) || Promise.resolve();
    const currentSave = previousSave.catch(() => {}).then(async () => {
      const res = await authedFetch(`${API}/scoreboard/deliberation-votes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_id: candidate.id,
          candidate_id: candidate.candidateId || undefined,
          rating: requestedRating,
          notes: "",
        }),
      });
      if (!res.ok) {
        throw await formatResponseError(
          res,
          "saving your deliberation vote",
          "Check POST /scoreboard/deliberation-votes endpoint in server/src/routes/resumeRoutes.js"
        );
      }
      const body = await res.json();
      const acknowledgedRating = body?.vote?.rating || "";
      if (acknowledgedRating !== requestedRating) {
        throw new Error("The server did not confirm the selected deliberation vote.");
      }

      // If another choice is already queued, let that final request perform the
      // authoritative reload. This keeps rapid recasts responsive and ordered.
      if (voteSaveQueuesRef.current.get(candidate.id) !== currentSave) return null;
      const snapshot = await loadScoreboardVerificationSnapshot();
      if (!confirmsDeliberationVoteReload(snapshot, candidate.id, requestedRating)) {
        throw new Error("Your saved vote could not be verified in a fresh scoreboard read.");
      }
      return snapshot;
    });

    voteSaveQueuesRef.current.set(candidate.id, currentSave);
    void currentSave.then((snapshot) => {
      if (voteSaveQueuesRef.current.get(candidate.id) !== currentSave) return;
      voteSaveQueuesRef.current.delete(candidate.id);
      latestOptimisticVotesRef.current.delete(candidate.id);
      pendingVoteIdsRef.current.delete(candidate.id);
      if (snapshot) setData(mergeWithCached(snapshot));
      setSavingVoteIds(prev => {
        const next = new Set(prev);
        next.delete(candidate.id);
        return next;
      });
    }).catch(async (err) => {
      if (voteSaveQueuesRef.current.get(candidate.id) !== currentSave) return;
      voteSaveQueuesRef.current.delete(candidate.id);
      latestOptimisticVotesRef.current.delete(candidate.id);
      pendingVoteIdsRef.current.delete(candidate.id);
      setDecisionError(err);
      setSavingVoteIds(prev => {
        const next = new Set(prev);
        next.delete(candidate.id);
        return next;
      });
      try {
        await fetchScoreboard({ silent: true });
      } catch {
        // Keep the original save/verification error visible. The normal live
        // poll will reconcile the vote if this recovery refresh also fails.
      }
    });
  }, [authedFetch, canVote, fetchScoreboard, loadScoreboardVerificationSnapshot, mergeWithCached, setData]);

  const automaticDecisionPlan = useMemo(() => {
    const advancePercent = Number(activeRound?.autoAdvancePercent) || 0;
    const rejectPercent = Number(activeRound?.autoRejectPercent) || 0;
    if (!deliberationMode || !canEditDeliberations || viewingHistorical || (advancePercent <= 0 && rejectPercent <= 0)) {
      return { advancePercent, rejectPercent, advanceCount: 0, rejectCount: 0, decisions: [] };
    }

    const ranked = equalizedCandidates
      .filter((candidate) => canRecordCommitteeDecision(candidate) && hasNumericScore(candidate.normalizedScore ?? candidate.score))
      .sort((a, b) => {
        const scoreDifference = Number(b.normalizedScore ?? b.score) - Number(a.normalizedScore ?? a.score);
        return scoreDifference || String(a.id).localeCompare(String(b.id));
      });
    if (!ranked.length) {
      return { advancePercent, rejectPercent, advanceCount: 0, rejectCount: 0, decisions: [] };
    }

    const advanceCount = Math.ceil((ranked.length * advancePercent) / 100);
    const rejectCount = Math.ceil((ranked.length * rejectPercent) / 100);
    const selected = new Map();
    ranked.slice(0, advanceCount).forEach((candidate) => selected.set(candidate.id, { candidate, decision: "advance" }));
    ranked.slice(Math.max(advanceCount, ranked.length - rejectCount)).forEach((candidate) => {
      if (!selected.has(candidate.id)) selected.set(candidate.id, { candidate, decision: "reject" });
    });

    const decisions = [...selected.values()]
      .filter(({ candidate }) => getCandidateDecisionStatus(candidate) === "pending");
    return {
      advancePercent,
      rejectPercent,
      advanceCount: decisions.filter((item) => item.decision === "advance").length,
      rejectCount: decisions.filter((item) => item.decision === "reject").length,
      decisions,
    };
  }, [activeRound?.autoAdvancePercent, activeRound?.autoRejectPercent, canEditDeliberations, deliberationMode, equalizedCandidates, viewingHistorical]);

  const handleApplyAutomaticDecisions = useCallback(async () => {
    if (!isAdmin || !automaticDecisionPlan.decisions.length || bulkDecisionBusy) return;
    const confirmed = window.confirm(
      `Apply the configured rank cutoffs?\n\n${automaticDecisionPlan.advanceCount} pending candidate(s) will be advanced and ${automaticDecisionPlan.rejectCount} will be rejected. Existing manual decisions will not be changed.`
    );
    if (!confirmed) return;

    setBulkDecisionBusy(true);
    setDecisionError("");
    setDecisionNotice("");
    try {
      const res = await authedFetch(`${API}/scoreboard/decisions/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisions: automaticDecisionPlan.decisions.map(({ candidate, decision }) => ({
            resume_id: candidate.id,
            candidate_id: candidate.candidateId,
            decision,
          })),
        }),
      });
      if (!res.ok) throw await formatResponseError(res, "applying rank cutoffs");
      const body = await res.json();
      await fetchScoreboard({ silent: true });
      setDecisionNotice(
        `Applied ${body.appliedCount || 0} rank-based decision(s)${body.skippedCount ? `; ${body.skippedCount} existing or ineligible decision(s) were left unchanged` : ""}.`
      );
    } catch (err) {
      setDecisionError(err);
    } finally {
      setBulkDecisionBusy(false);
    }
  }, [automaticDecisionPlan, authedFetch, bulkDecisionBusy, fetchScoreboard, isAdmin]);

  const handleSignalUpdated = useCallback((update) => {
    setData(prev => ({
      ...prev,
      candidates: (prev.candidates || []).map((c) => {
        if (c.id !== update.resumeId) return c;
        const next = { ...c };
        if (update.type === "flag") {
          next.flagCount = typeof update.flagCount === "number" ? update.flagCount : (c.flagCount || 0) + 1;
          next.flaggedByMe = true;
        } else {
          next.referralCount = typeof update.referralCount === "number" ? update.referralCount : (c.referralCount || 0) + 1;
          next.referredByMe = true;
        }
        return next;
      }),
    }));
    setSelectedCandidate(prev => {
      if (!prev || prev.id !== update.resumeId) return prev;
      if (update.type === "flag") {
        return {
          ...prev,
          flagCount: typeof update.flagCount === "number" ? update.flagCount : (prev.flagCount || 0) + 1,
          flaggedByMe: true,
        };
      }
      return {
        ...prev,
        referralCount: typeof update.referralCount === "number" ? update.referralCount : (prev.referralCount || 0) + 1,
        referredByMe: true,
      };
    });
  }, [setData]);

  const handleAdvanceRound = useCallback(async () => {
    if (!isAdmin || !activeRound?.id || !canDeliberate) return;

    if (!canCloseRound) {
      setDecisionError(
        undecidedCount > 0
          ? `Mark every candidate Advance or Reject before closing the round (${undecidedCount} still undecided).`
          : "Mark every candidate Advance or Reject before closing the round."
      );
      return;
    }

    const nextLabel = nextRound?.name || "the next stage";
    const confirmed = window.confirm(
      `Close "${activeRound.name}" and open "${nextLabel}"?\n\nCandidates marked Advance will move to the next round. Deliberation decisions are saved and will remain available in past round views.`
    );
    if (!confirmed) return;

    setAdvanceRoundBusy(true);
    setDecisionError(null);
    try {
      const res = await authedFetch(`${API}/rounds/${activeRound.id}/advance-to-next`, { method: "POST" });
      if (!res.ok) {
        throw await formatResponseError(res, "advancing to the next round");
      }
      setViewingRoundId(null);
      setDeliberationMode(false);
      // Advancing a round moves every candidate — every round's scoreboard and
      // the dashboard counts are now wrong, so expire the whole family.
      await queryClient.invalidateQueries({ queryKey: qk.scoreboardRoot() });
      queryClient.invalidateQueries({ queryKey: qk.dashboardRoot() });
    } catch (err) {
      setDecisionError(err);
    } finally {
      setAdvanceRoundBusy(false);
    }
  }, [activeRound?.id, activeRound?.name, authedFetch, canCloseRound, canDeliberate, isAdmin, nextRound?.name, queryClient, undecidedCount]);

  const handleExport = useCallback((decision) => {
    setExportBusy(true);
    setDecisionError(null);
    try {
      exportCandidatesDecisionCsv(candidates, decision);
    } catch (err) {
      setDecisionError(err);
    } finally {
      setExportBusy(false);
    }
  }, [candidates]);

  useEffect(() => {
    function onKeyDown(event) {
      const tag = event.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || event.target?.isContentEditable || event.target?.closest?.('[role="dialog"]') || event.metaKey || event.ctrlKey || event.altKey) return;

      const list = filteredCandidates;
      if (!list.length) return;

      let index = list.findIndex(c => String(c.id) === String(focusedCandidateId));

      if (event.key === "ArrowDown") {
        event.preventDefault();
        const next = list[Math.min(index + 1, list.length - 1)];
        setFocusedCandidateId(next.id);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        const next = list[Math.max(index - 1, 0)];
        setFocusedCandidateId(next.id);
        return;
      }

      if (!deliberationMode || !canEditDeliberations) return;
      const focused = list[Math.max(index, 0)];
      if (!canRecordCommitteeDecision(focused)) return;

      const key = event.key.toLowerCase();
      const currentStatus = getCandidateDecisionStatus(focused);
      if (key === "y") {
        event.preventDefault();
        saveDecision(focused, currentStatus === "advance" ? "pending" : "advance");
      } else if (key === "n") {
        event.preventDefault();
        saveDecision(focused, currentStatus === "reject" ? "pending" : "reject");
      } else if (key === "h") {
        event.preventDefault();
        saveDecision(focused, currentStatus === "hold" ? "pending" : "hold");
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [canEditDeliberations, deliberationMode, filteredCandidates, focusedCandidateId, saveDecision]);

  useEffect(() => {
    if (loading) return;
    if (!filteredCandidates.length) {
      setFocusedCandidateId(null);
      return;
    }
    if (
      focusedCandidateId != null
      && !filteredCandidates.some(c => String(c.id) === String(focusedCandidateId))
    ) {
      setFocusedCandidateId(null);
    }
  }, [loading, filteredCandidates, focusedCandidateId]);

  const effectiveSummaryFilters = {
    ...filters,
    ...(!deliberationMode ? { decision: "all" } : {}),
    ...(isCoffeeChatRanking ? { reviews: "all" } : {}),
  };
  const activeFilterCount = countActiveFilters(effectiveSummaryFilters);
  const hasActiveSearch = searchQuery.trim().length > 0;
  const hasActiveNarrowing = activeFilterCount > 0 || hasActiveSearch;
  const activeFilterPills = useMemo(
    () => buildActiveFilterPills(
      { ...filters, ...(isCoffeeChatRanking ? { reviews: "all" } : {}) },
      deliberationMode
    ),
    [filters, deliberationMode, isCoffeeChatRanking]
  );
  const summaryCandidates = hasActiveNarrowing ? filteredCandidates : candidates;
  const scopedDecisionStats = useMemo(
    () => recomputeDecisionStats(summaryCandidates),
    [summaryCandidates]
  );
  const summaryStats = useMemo(() => {
    if (!hasActiveNarrowing) return displayStats;

    const { avgScore } = recomputeEqualizedStats(summaryCandidates);
    const coffeeChatAverage = summaryCandidates.length
      ? Number((summaryCandidates.reduce((sum, candidate) => sum + Number(candidate.coffeeChatScore || 0), 0) / summaryCandidates.length).toFixed(1))
      : null;

    return {
      ...displayStats,
      applicants: summaryCandidates.length,
      advanced: scopedDecisionStats.advance,
      hold: scopedDecisionStats.hold,
      rejected: scopedDecisionStats.reject,
      pending: scopedDecisionStats.pending,
      avgScore,
      coffeeChatAverage,
    };
  }, [displayStats, hasActiveNarrowing, scopedDecisionStats, summaryCandidates]);
  const t = SCOREBOARD_THEME;
  const showingLiveDeliberation = deliberationMode && !viewingHistorical && !cycleId;
  const gridColumns = deliberationMode
    ? `16px 36px minmax(180px, 2.2fr) ${isCoffeeChatRanking ? "165px" : "100px"} minmax(196px, 0.9fr) minmax(108px, auto)`
    : `48px minmax(220px, 2.2fr) ${isCoffeeChatRanking ? "165px" : "108px"} minmax(100px, auto)`;

  function statCount(value) {
    if (value === undefined || value === null || value === "") return "—";
    return value;
  }

  function applyStatFilter(label) {
    if (deliberationMode) {
      switch (label) {
        case "PENDING":
          setFilters(f => ({ ...f, decision: "pending" }));
          break;
        case "ADVANCED":
          setFilters(f => ({ ...f, decision: "advance" }));
          break;
        case "HOLD":
          setFilters(f => ({ ...f, decision: "hold" }));
          break;
        case "REJECTED":
          setFilters(f => ({ ...f, decision: "reject" }));
          break;
        case "RESUME REVIEWED":
          setFilters(f => ({ ...f, reviews: "1+" }));
          break;
        case "APPLICANTS":
          setFilters({ ...defaultFilters });
          setSearchQuery("");
          break;
        default:
          break;
      }
      return;
    }
    switch (label) {
      case "RESUME REVIEWED":
        setFilters(f => ({ ...f, reviews: "1+" }));
        break;
      case "ADVANCED":
        setFilters(f => ({ ...f, scoreBand: "top" }));
        break;
      case "APPLICANTS":
        setFilters({ ...defaultFilters });
        setSearchQuery("");
        break;
      default:
        break;
    }
  }

  function toggleDeliberationMode() {
    if (viewingHistorical || !isAdmin) return;
    setDeliberationMode(on => {
      if (on) {
        setFilters(f => ({ ...f, decision: "all" }));
        setFocusedCandidateId(null);
        setDecisionError("");
      } else {
        setEqualizeActive(true);
        fetchScoreboard();
      }
      return !on;
    });
  }

  // No explicit refetch on either of these: the round id is part of the query
  // key, so changing it swaps to that round's cache entry automatically — and a
  // round already viewed this session comes back instantly instead of refetching.
  const handleViewPastRound = useCallback((roundId) => {
    if (!roundId) return;
    setViewingRoundId(roundId);
    setDeliberationMode(true);
    setFilters(f => ({ ...f, decision: "all" }));
    setFocusedCandidateId(null);
    setDecisionError("");
  }, []);

  const handleReturnToCurrentRound = useCallback(() => {
    setViewingRoundId(null);
    setDeliberationMode(false);
    setFilters(f => ({ ...f, decision: "all" }));
    setFocusedCandidateId(null);
    setDecisionError("");
  }, []);

  useEffect(() => {
    if (viewingHistorical && !deliberationMode) {
      setDeliberationMode(true);
    }
  }, [viewingHistorical, deliberationMode]);

  const resumeReviewedApplicants = summaryCandidates.filter((candidate) => getResumeReviewCount(candidate) > 0).length;
  const freeResponseReviewedApplicants = summaryCandidates.filter((candidate) => getFreeResponseReviewCount(candidate) > 0).length;
  const coffeeChatEvaluatedApplicants = summaryCandidates.filter((candidate) => (candidate.coffeeChatEvaluationCount || 0) > 0).length;
  const coffeeChatRatings = summaryCandidates.reduce((total, candidate) => total + (candidate.coffeeChatEvaluationCount || 0), 0);

  const historicalCutCount = (summaryStats?.pending ?? 0) + (summaryStats?.hold ?? 0) + (summaryStats?.rejected ?? 0);

  const statRows = !deliberationMode && isCoffeeChatRanking
    ? [
        { label: "CANDIDATES", value: statCount(summaryStats?.applicants), clickable: false },
        { label: "EVALUATED", value: statCount(coffeeChatEvaluatedApplicants), clickable: false },
        { label: "RATINGS SUBMITTED", value: statCount(coffeeChatRatings), clickable: false },
        { label: "AWAITING A RATING", value: statCount(Math.max(0, (summaryStats?.applicants || 0) - coffeeChatEvaluatedApplicants)), clickable: false },
      ]
    : deliberationMode && viewingFinalizedRound
    ? [
        { label: "ADVANCED", value: statCount(summaryStats?.advanced ?? 0), clickable: true, color: DECISION_STYLE.advance.color },
        { label: historicalCutLabel.toUpperCase(), value: statCount(historicalCutCount), clickable: false, color: DECISION_STYLE.reject.color },
        ...(!isCoffeeChatRanking ? [
          { label: "RESUME REVIEWED", value: statCount(resumeReviewedApplicants), clickable: true },
          { label: "FREE RESPONSE REVIEWED", value: statCount(freeResponseReviewedApplicants), clickable: false },
        ] : []),
        { label: "APPLICANTS", value: statCount(summaryStats?.applicants), clickable: true },
      ]
    : deliberationMode
    ? [
        { label: "PENDING", value: statCount(summaryStats?.pending ?? (summaryStats?.applicants != null ? summaryStats?.applicants : null)), clickable: true, color: DECISION_STYLE.pending.color },
        { label: "ADVANCED", value: statCount(summaryStats?.advanced ?? 0), clickable: true, color: DECISION_STYLE.advance.color },
        { label: "HOLD", value: statCount(summaryStats?.hold ?? 0), clickable: true, color: DECISION_STYLE.hold.color },
        { label: "REJECTED", value: statCount(summaryStats?.rejected ?? 0), clickable: true, color: DECISION_STYLE.reject.color },
        ...(!isCoffeeChatRanking ? [
          { label: "RESUME REVIEWED", value: statCount(resumeReviewedApplicants), clickable: true },
          { label: "FREE RESPONSE REVIEWED", value: statCount(freeResponseReviewedApplicants), clickable: false },
        ] : []),
        { label: "APPLICANTS", value: statCount(summaryStats?.applicants), clickable: true },
      ]
    : [
        { label: "APPLICANTS", value: statCount(summaryStats?.applicants), clickable: true },
        { label: "RESUME REVIEWED", value: statCount(resumeReviewedApplicants), clickable: true },
        { label: "FREE RESPONSE REVIEWED", value: statCount(freeResponseReviewedApplicants), clickable: false },
        { label: "ADVANCED", value: statCount(summaryStats?.advanced), clickable: true },
        { label: isCoffeeChatRanking ? "AVG COFFEE CHAT" : "AVG SCORE", value: statCount(isCoffeeChatRanking ? summaryStats?.coffeeChatAverage : summaryStats?.avgScore), clickable: false },
      ];

  const decidedCount = deliberationMode
    ? viewingFinalizedRound
      ? (summaryStats?.applicants ?? 0)
      : (summaryStats?.advanced ?? 0) + (summaryStats?.hold ?? 0) + (summaryStats?.rejected ?? 0)
    : 0;
  const totalApplicants = summaryStats?.applicants ?? 0;
  const decisionProgress = totalApplicants > 0 ? Math.round((decidedCount / totalApplicants) * 100) : 0;
  const decisionMix = viewingFinalizedRound
    ? [
        { label: "Advanced", value: Number(summaryStats?.advanced) || 0, color: DECISION_STYLE.advance.color },
        { label: historicalCutLabel, value: historicalCutCount, color: DECISION_STYLE.reject.color },
      ]
    : [
        { label: "Advanced", value: Number(summaryStats?.advanced) || 0, color: DECISION_STYLE.advance.color },
        { label: "Hold", value: Number(summaryStats?.hold) || 0, color: DECISION_STYLE.hold.color },
        { label: "Rejected", value: Number(summaryStats?.rejected) || 0, color: DECISION_STYLE.reject.color },
        { label: "Pending", value: Number(summaryStats?.pending) || 0, color: "#D1D5DB" },
      ];

  const barSelectStyle = {
    ...selectStyle,
    width: "auto",
    minWidth: 132,
    background: t.selectBg,
    color: t.selectText,
    border: `1px solid ${t.border}`,
    fontWeight: 600,
    textTransform: "none",
    letterSpacing: "normal",
  };

  const filterSelectStyle = deliberationMode
    ? { ...barSelectStyle, width: "100%", minWidth: 0 }
    : barSelectStyle;

  // Major names can be long enough to push the bar onto a second line, so the
  // closed control is capped to the same width as the others and clips its
  // label with an ellipsis. The opened dropdown list still shows full names.
  const majorSelectStyle = {
    ...filterSelectStyle,
    width: deliberationMode ? "100%" : 132,
    maxWidth: deliberationMode ? "none" : 132,
    textOverflow: "ellipsis",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: t.pageBg, color: t.text, fontFamily: "'DM Sans', sans-serif", fontSize: 13, overflow: "auto", transition: "background 0.25s ease, color 0.25s ease" }}>
      <style>{`
        @keyframes scoreboardPanelIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .scoreboard-sticky-header {
          position: sticky;
          top: 0;
          z-index: 2;
          background: inherit;
        }
      `}</style>
      <Topbar phaseLabel={scoreboardLabel} activeLabel="Live roster" rightSlot={<></>} />

      <div style={{ flex: 1, padding: "14px 22px 32px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
        <div style={{ maxWidth: 640, flex: "1 1 260px", minWidth: 0 }}>
          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: t.titleAccent }}>
            {viewingHistorical ? "Cycle history" : deliberationMode ? "Live deliberation" : scoreboardLabel}
          </p>
          <div style={{ minWidth: 0 }}>
            <h1 style={pageTitleStyle}>Candidate scoreboard</h1>
            <p style={{ margin: "10px 0 0", fontSize: 14, color: t.textMuted, lineHeight: 1.5, maxWidth: 520 }}>
              {deliberationMode ? (
                viewingHistorical
                  ? `Archived decisions for ${activeRound?.name || "this round"}.`
                  : canEditDeliberations
                    ? "Click a row to focus, then choose Advance, Hold, or Reject."
                    : `Viewing ${activeRound?.name || "this round"} — updates every few seconds.`
              ) : (
                "Browse candidates by score, major, and resume/free-response grade status."
              )}
              {hasActiveNarrowing ? (
                <span style={{ display: "block", marginTop: 6, fontSize: 13, color: t.titleAccent, fontWeight: 600 }}>
                  Showing {filteredCandidates.length} of {candidates.length}
                </span>
              ) : null}
            </p>
          </div>
        </div>

        <div style={{ flexShrink: 0, marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {isStaff ? (
            <>
              {pastRounds.length > 0 ? (
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: "0.04em" }}>{cycleId ? "Cycle rounds" : "Past rounds"}</span>
                  <select
                    value={viewingRoundId || ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (!value) {
                        handleReturnToCurrentRound();
                        return;
                      }
                      handleViewPastRound(value);
                    }}
                    style={{
                      padding: "7px 10px",
                      borderRadius: 8,
                      border: `1px solid ${t.border}`,
                      background: t.selectBg,
                      color: t.selectText,
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: "'DM Sans', sans-serif",
                      cursor: "pointer",
                    }}
                  >
                    <option value="">
                      Current round ({liveActiveRound?.name || activeRound?.name || "Unknown"})
                    </option>
                    {pastRounds.map((round) => (
                      <option key={round.id} value={round.id}>
                        {round.name}{round.status === "closed" ? " (closed)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {isAdmin && deliberationMode && !viewingHistorical && (automaticDecisionPlan.advancePercent > 0 || automaticDecisionPlan.rejectPercent > 0) ? (
                <button
                  type="button"
                  onClick={handleApplyAutomaticDecisions}
                  disabled={bulkDecisionBusy || automaticDecisionPlan.decisions.length === 0}
                  title="Apply the top/bottom percentages configured for this round. Manual decisions are preserved."
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    cursor: bulkDecisionBusy || automaticDecisionPlan.decisions.length === 0 ? "not-allowed" : "pointer",
                    padding: "8px 14px",
                    borderRadius: 8,
                    background: t.btnGhostBg,
                    color: t.accent,
                    border: `1px solid ${t.accent}`,
                    fontSize: 12,
                    fontWeight: 700,
                    opacity: bulkDecisionBusy || automaticDecisionPlan.decisions.length === 0 ? 0.55 : 1,
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  {bulkDecisionBusy
                    ? "Applying cutoffs…"
                    : `Apply cutoffs · ${automaticDecisionPlan.advanceCount} pass / ${automaticDecisionPlan.rejectCount} reject`}
                </button>
              ) : null}
              {!isCoffeeChatRanking && (!deliberationMode || !isAdmin) ? (
                <button
                  type="button"
                  onClick={() => setEqualizeActive(on => !on)}
                  title="Adjust for consistently strict or lenient graders using per-category z-scores"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    padding: "8px 14px",
                    borderRadius: 8,
                    background: equalizeActive ? t.accent : t.btnGhostBg,
                    color: equalizeActive ? "var(--color-on-primary)" : t.btnGhostText,
                    border: `1px solid ${equalizeActive ? t.accent : t.border}`,
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  {equalizeActive ? "Unadjusted scores" : "Bias adjust"}
                </button>
              ) : null}
            </>
          ) : null}
          {isAdmin && deliberationMode ? (
            <div ref={adminMenuRef} style={{ position: "relative" }}>
              <button
                type="button"
                aria-expanded={adminMenuOpen}
                aria-haspopup="true"
                onClick={() => setAdminMenuOpen(open => !open)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: `1px solid ${adminMenuOpen ? t.accent : t.border}`,
                  background: t.btnGhostBg,
                  color: t.btnGhostText,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Admin actions
                <span style={{ fontSize: 10, color: t.textMuted }}>▾</span>
              </button>
              {adminMenuOpen ? (
                <div
                  role="menu"
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 6px)",
                    minWidth: 200,
                    background: t.cardBg,
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    boxShadow: "0 12px 32px rgba(0,0,0,0.14)",
                    padding: 6,
                    zIndex: 50,
                    animation: "scoreboardPanelIn 0.18s ease-out",
                  }}
                >
                  {!isCoffeeChatRanking ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setEqualizeActive(on => !on); setAdminMenuOpen(false); }}
                      style={adminMenuItemStyle(t)}
                    >
                      {equalizeActive ? "Show unadjusted scores" : "Use bias-adjusted scores"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={exportBusy}
                    onClick={() => { handleExport("advance"); setAdminMenuOpen(false); }}
                    style={adminMenuItemStyle(t)}
                  >
                    Export advanced
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={exportBusy}
                    onClick={() => { handleExport("hold"); setAdminMenuOpen(false); }}
                    style={adminMenuItemStyle(t)}
                  >
                    Export on hold
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={exportBusy}
                    onClick={() => { handleExport("reject"); setAdminMenuOpen(false); }}
                    style={adminMenuItemStyle(t)}
                  >
                    Export rejected
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setEmailModalOpen(true); setAdminMenuOpen(false); }}
                    style={adminMenuItemStyle(t)}
                  >
                    Advance email
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {(cycleId || viewingHistorical || isAdmin) ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {isAdmin && deliberationMode && !viewingHistorical && canDeliberate && activeRound?.id ? (
              <button
              type="button"
              onClick={handleAdvanceRound}
              disabled={advanceRoundBusy}
              title={
                canCloseRound
                  ? nextRound
                    ? `Confirm all decisions, close ${activeRound.name}, and open ${nextRound.name}`
                    : `Confirm all decisions and close ${activeRound.name}`
                  : `Resolve all candidates first — ${undecidedCount || "some"} still need Advance or Reject`
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                cursor: advanceRoundBusy ? "wait" : "pointer",
                padding: "8px 14px",
                borderRadius: 8,
                background: canCloseRound ? t.accent : t.btnGhostBg,
                color: canCloseRound ? "var(--color-on-primary)" : t.textMuted,
                border: `1px solid ${canCloseRound ? t.accent : t.border}`,
                fontSize: 12,
                fontWeight: 700,
                opacity: advanceRoundBusy ? 0.6 : 1,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {advanceRoundBusy
                ? "Confirming…"
                : canCloseRound
                  ? "Confirm decisions"
                  : `Confirm decisions · ${undecidedCount} left`}
              </button>
            ) : null}
            <button
              type="button"
              onClick={cycleId ? () => navigate("/cycle-management?view=past") : viewingHistorical ? handleReturnToCurrentRound : toggleDeliberationMode}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                padding: "8px 14px",
                borderRadius: 8,
                background: showingLiveDeliberation ? "rgba(226,75,74,0.08)" : deliberationMode ? t.accent : t.btnGhostBg,
                color: showingLiveDeliberation ? css.red : deliberationMode ? "var(--color-on-primary)" : t.btnGhostText,
                border: `1px solid ${showingLiveDeliberation ? css.red : deliberationMode ? t.accent : t.border}`,
                fontSize: 12,
                fontWeight: showingLiveDeliberation ? 700 : 600,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {cycleId ? "Back to cycles" : viewingHistorical ? "Back to current" : deliberationMode ? "Exit" : "Deliberation"}
            </button>
            </div>
          ) : null}
          </div>
        </div>
      </div>

      {viewingHistorical && activeRound ? (
        <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: deliberationMode ? "rgba(61,207,154,0.08)" : t.cardBg, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: t.text }}>
              {cycleId ? `Viewing archived cycle: ${data.context?.cycle?.name} · ${activeRound.name}` : `Viewing past round: ${activeRound.name}`}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: t.textMuted }}>
              Committee decisions from this closed round are read-only.
            </p>
          </div>
          <button
            type="button"
            onClick={cycleId ? () => navigate("/cycle-management?view=past") : handleReturnToCurrentRound}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${t.accent}`,
              background: t.btnGhostBg,
              color: t.accent,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {cycleId ? "Back to past cycles" : "Back to current round"}
          </button>
        </div>
      ) : null}

      {decisionError ? (
        <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", padding: "0 0 8px" }}>
          <ErrorBanner
            error={decisionError}
            onDismiss={() => setDecisionError(null)}
            onRetry={decisionError === scoreboardQuery.error ? () => scoreboardQuery.refetch() : undefined}
          />
        </div>
      ) : null}

      {decisionNotice ? (
        <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(29,158,117,0.25)", background: "rgba(29,158,117,0.08)", color: t.text, fontSize: 12 }}>
          {decisionNotice}
        </div>
      ) : null}

      <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", position: "relative" }}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke={t.textMuted}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
          aria-hidden
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="search"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by name, email, or phone…"
          aria-label="Search candidates"
          style={{
            width: "100%",
            padding: "11px 40px 11px 40px",
            borderRadius: 10,
            border: `1px solid ${hasActiveSearch ? t.accent : t.border}`,
            background: t.cardBg,
            color: t.text,
            fontSize: 14,
            fontFamily: "'DM Sans', sans-serif",
            boxShadow: deliberationMode ? "none" : "0 1px 2px rgba(0,0,0,0.02)",
            outline: "none",
          }}
        />
        {hasActiveSearch ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setSearchQuery("")}
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              border: "none",
              background: "none",
              color: t.textMuted,
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: 4,
            }}
          >
            ×
          </button>
        ) : null}
      </div>

      <div
        role="group"
        aria-label="Filter and sort scoreboard"
        style={{ maxWidth: 1200, margin: "0 auto", width: "100%", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}
      >
        <FilterField label="Major" theme={t} fillRow={deliberationMode}>
          <select value={filters.major} onChange={e => setFilters(f => ({ ...f, major: e.target.value }))} style={majorSelectStyle}>
            <option value="all">All majors</option>
            {majorOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </FilterField>
        <FilterField label="Year" theme={t} fillRow={deliberationMode}>
          <select value={filters.year} onChange={e => setFilters(f => ({ ...f, year: e.target.value }))} style={filterSelectStyle}>
            <option value="all">All years</option>
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </FilterField>
        {!isCoffeeChatRanking ? (
          <FilterField label="Resume reviews" theme={t} fillRow={deliberationMode}>
            <select value={filters.reviews} onChange={e => setFilters(f => ({ ...f, reviews: e.target.value }))} style={filterSelectStyle}>
              <option value="all">Any count</option>
              <option value="0">None yet (0)</option>
              <option value="1">Exactly 1</option>
              <option value="1+">At least 1 resume review</option>
              <option value="2+">2 or more</option>
            </select>
          </FilterField>
        ) : null}
        <FilterField label="Score" theme={t} fillRow={deliberationMode}>
          <select value={filters.scoreBand} onChange={e => setFilters(f => ({ ...f, scoreBand: e.target.value }))} style={filterSelectStyle}>
            <option value="all">All scores</option>
            <option value="top">Top 20%</option>
            <option value="strong">Top 30%</option>
            <option value="low">Low (&lt; 60%)</option>
            <option value="pending">No score</option>
          </select>
        </FilterField>
        <FilterField label="Flags / referrals" theme={t} fillRow={deliberationMode}>
          <select value={filters.signals} onChange={e => setFilters(f => ({ ...f, signals: e.target.value }))} style={filterSelectStyle}>
            <option value="all">All candidates</option>
            <option value="referred">Referred only</option>
            <option value="flagged">Flagged only</option>
          </select>
        </FilterField>
        {deliberationMode ? (
          <FilterField label={viewingFinalizedRound ? "Round outcome" : "Committee decision"} theme={t} fillRow>
            <select value={filters.decision} onChange={e => setFilters(f => ({ ...f, decision: e.target.value }))} style={filterSelectStyle}>
              {viewingFinalizedRound ? (
                <>
                  <option value="all">All outcomes</option>
                  <option value="advance">Advanced</option>
                  <option value="not_advanced">{historicalCutLabel}</option>
                </>
              ) : (
                <>
                  <option value="all">All decisions</option>
                  <option value="undecided">Undecided (pending + hold)</option>
                  <option value="pending">Pending only</option>
                  <option value="advance">Advanced</option>
                  <option value="hold">Hold</option>
                  <option value="reject">Rejected</option>
                </>
              )}
            </select>
          </FilterField>
        ) : null}
        <FilterField label="Sort" theme={t} fillRow={deliberationMode}>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={filterSelectStyle}>
            {SORT_TABS.map(tab => (
              <option key={tab.id} value={tab.id}>{tab.label}</option>
            ))}
          </select>
        </FilterField>
        {activeFilterCount > 0 ? (
          <button
            type="button"
            onClick={() => setFilters({ ...defaultFilters })}
            style={{
              marginLeft: "auto",
              alignSelf: "flex-end",
              background: "none",
              border: "none",
              color: t.accent,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              padding: "8px 0",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Clear all filters
          </button>
        ) : null}
      </div>

      {(activeFilterPills.length > 0 || hasActiveSearch) ? (
        <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {hasActiveSearch ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, background: t.chipActiveBg, border: `1px solid ${t.border}`, fontSize: 12, fontWeight: 600, color: t.text }}>
              Search: “{searchQuery.trim()}”
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search filter"
                style={{ border: "none", background: "none", color: t.textMuted, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}
              >
                ×
              </button>
            </span>
          ) : null}
          {activeFilterPills.map(pill => (
            <span
              key={pill.key}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, background: t.chipActiveBg, border: `1px solid ${t.border}`, fontSize: 12, fontWeight: 600, color: t.text }}
            >
              {pill.label}
              <button
                type="button"
                onClick={() => setFilters(f => ({ ...f, ...pill.clear }))}
                aria-label={`Remove ${pill.label} filter`}
                style={{ border: "none", background: "none", color: t.textMuted, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => { setFilters({ ...defaultFilters }); setSearchQuery(""); }}
            style={{ border: "none", background: "none", color: t.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "4px 0" }}
          >
            Clear all
          </button>
        </div>
      ) : null}

      {equalizeActive && !deliberationMode && !isCoffeeChatRanking ? (
        <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${deliberationMode ? t.infoBorder : css.greenDark}`, background: deliberationMode ? t.infoBg : css.greenDark, fontSize: 13, color: deliberationMode ? t.text : "var(--color-on-primary)", lineHeight: 1.45 }}>
          <strong style={{ color: deliberationMode ? t.accent : "var(--color-on-primary)" }}>Bias-adjusted scores</strong> — each grader is normalized against their own scoring pattern, then mapped to the team distribution per rubric category. Toggle “Unadjusted scores” to compare.
        </div>
      ) : null}

      {deliberationMode && canEditDeliberations && !viewingHistorical ? (
        <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", padding: "8px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.btnGhostBg, fontSize: 12, color: t.textMuted, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <span style={{ fontWeight: 700, color: t.text, letterSpacing: "0.04em" }}>Shortcuts</span>
          <span>↑↓ navigate</span>
          <span><kbd style={kbdStyle(t)}>Y</kbd> advance</span>
          <span><kbd style={kbdStyle(t)}>N</kbd> reject</span>
          <span><kbd style={kbdStyle(t)}>H</kbd> hold</span>
          {isInterviewRoundType(activeRound?.type) ? (
            <span style={{ marginLeft: "auto", fontSize: 11 }}>Interview pool — advanced candidates only</span>
          ) : null}
        </div>
      ) : null}

      <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, padding: "16px 20px", boxShadow: deliberationMode ? "none" : "0 1px 2px rgba(0,0,0,0.02)" }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${statRows.length}, 1fr)`, gap: 8 }}>
        {statRows.map((stat, index) => (
          <button
            key={stat.label}
            type="button"
            disabled={!stat.clickable}
            onClick={() => stat.clickable && applyStatFilter(stat.label)}
            title={stat.clickable ? `Filter by ${stat.label.toLowerCase()}` : undefined}
            style={{
              border: "none",
              borderRight: index < statRows.length - 1 ? `1px solid ${t.border}` : "none",
              padding: index ? "4px 0 4px 16px" : "4px 0",
              background: "transparent",
              textAlign: "left",
              cursor: stat.clickable ? "pointer" : "default",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <div style={{ fontSize: 24, color: stat.color || t.statValue, lineHeight: 1.1, fontWeight: 700 }}>{stat.value}</div>
            <div style={{ fontSize: 10, color: stat.color || t.textMuted, fontWeight: 700, letterSpacing: "0.06em", marginTop: 4 }}>{stat.label}</div>
          </button>
        ))}
        </div>
        {deliberationMode && totalApplicants > 0 ? (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: t.textMuted, marginBottom: 6 }}>
              <span>Decision progress</span>
              <span style={{ fontWeight: 600, color: t.text }}>{decidedCount} / {totalApplicants} decided ({decisionProgress}%)</span>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: "var(--color-track)", overflow: "hidden", display: "flex" }}>
              {decisionMix.map((segment) => (
                <div
                  key={segment.label}
                  title={`${segment.label}: ${segment.value}`}
                  style={{
                    height: "100%",
                    width: `${totalApplicants > 0 ? (segment.value / totalApplicants) * 100 : 0}%`,
                    background: segment.color,
                    transition: "width 0.3s ease",
                  }}
                />
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "7px 16px", marginTop: 9 }}>
              {decisionMix.map((segment) => (
                <span key={segment.label} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: t.textMuted, fontSize: 11 }}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: segment.color }} />
                  {segment.label} {segment.value}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ padding: "0 0 48px", maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        <div style={{ border: `1px solid ${t.border}`, borderRadius: 10, overflow: "hidden", background: t.cardBg, boxShadow: deliberationMode ? "none" : "0 1px 2px rgba(0,0,0,0.02)" }}>
        <div
          className="scoreboard-sticky-header"
          style={{
            display: "grid",
            gridTemplateColumns: gridColumns,
            padding: "12px 20px",
            borderBottom: `2px solid ${t.border}`,
            color: t.textMuted,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.06em",
            background: t.cardBg,
          }}
        >
          {deliberationMode ? <div aria-hidden /> : null}
          <div>#</div>
          <div>CANDIDATE</div>
          <div style={{ whiteSpace: "nowrap" }}>{isCoffeeChatRanking ? "COFFEE CHAT POINTS" : equalizeActive ? "BIAS-ADJUSTED" : "SCORE"}</div>
          {deliberationMode ? <div>DECISION</div> : null}
          <div style={{ textAlign: "right" }} />
        </div>

        <div>
        {loading && <PageLoader color={t.textMuted} track={t.border} head={t.accent} />}

        {!loading && candidates.length > 0 && filteredCandidates.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: t.textMuted }}>
            {hasActiveSearch ? "No candidates match your search." : "No candidates match these filters."}
          </div>
        )}

        {!loading && candidates.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: t.textMuted }}>No candidates yet.</div>
        )}

        {!loading && filteredCandidates.length > 0 && (
        <div ref={listRef} style={{ position: "relative", width: "100%", height: `${rowVirtualizer.getTotalSize()}px` }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const c = filteredCandidates[virtualRow.index];
          const index = virtualRow.index;
          const decisionStatus = getCandidateDecisionStatus(c);
          const isHistoricalCut = viewingFinalizedRound && decisionStatus !== "advance";
          const displayDecisionStatus = isHistoricalCut ? "reject" : decisionStatus;
          const decisionStyle = DECISION_STYLE[displayDecisionStatus];
          const isFocused = focusedCandidateId != null && String(focusedCandidateId) === String(c.id);
          const rowSaving = savingDecisionIds.has(c.id);
          const headlineScore = getHeadlineScore(c);
          const rowBg = isFocused
            ? t.rowFocus
            : deliberationMode && decisionStyle.row !== "transparent"
              ? decisionStyle.row
              : t.rowBg;

          return (
          <div
            key={c.id}
            data-candidate-id={c.id}
            data-index={virtualRow.index}
            aria-current={isFocused ? "true" : undefined}
            ref={rowVirtualizer.measureElement}
            onMouseEnter={() => prefetchCandidateApplication(c.id)}
            onFocusCapture={() => { setFocusedCandidateId(c.id); prefetchCandidateApplication(c.id); }}
            onClick={() => {
              setFocusedCandidateId(c.id);
            }}
            style={{
              display: "grid",
              gridTemplateColumns: gridColumns,
              padding: deliberationMode ? "12px 16px" : "14px 20px",
              borderBottom: `1px solid ${t.border}`,
              alignItems: "center",
              background: rowBg,
              outline: isFocused ? `1px solid ${t.border}` : "none",
              outlineOffset: -2,
              transition: "background 0.15s ease",
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              boxSizing: "border-box",
              transform: `translateY(${virtualRow.start - rowVirtualizer.options.scrollMargin}px)`,
            }}
          >
            {deliberationMode ? (
              <div style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: displayDecisionStatus === "pending" ? "transparent" : decisionStyle.color, minHeight: 40 }} aria-hidden />
            ) : null}

            <div style={{ color: isFocused ? t.accent : t.textMuted, fontWeight: 700, fontSize: 13 }}>{index + 1}</div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <CandidateProfileButton resumeId={c.id} candidateName={c.name} onOpen={() => openCandidateWorkspace(c)} style={{ borderRadius: "50%", flexShrink: 0 }}>
                <CandidateAvatar name={c.name} headshot={c.headshot} candidateId={c.candidateId} size={40} background={deliberationMode ? t.accent : css.greenDark} />
              </CandidateProfileButton>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                  <button
                    type="button"
                    title="Open full candidate profile"
                    onClick={(e) => {
                      e.stopPropagation();
                      openCandidateWorkspace(c);
                    }}
                    style={{
                      border: "none",
                      background: "none",
                      padding: 0,
                      textAlign: "left",
                      fontSize: 15,
                      fontWeight: 500,
                      fontFamily: sansFont,
                      color: t.text,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "100%",
                    }}
                  >
                    {c.name}
                  </button>
                </div>
                <span style={{ fontSize: 12, color: t.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {[c.major, c.year].filter(Boolean).join(" · ")}
                </span>
                {deliberationMode && getCommitteeLinkWarning(c) ? (
                  <span style={{ fontSize: 11, color: css.red, fontWeight: 600 }}>
                    {getCommitteeLinkWarning(c)}
                  </span>
                ) : null}
                {c.screeningExclusionReason && <span title={c.screeningExclusionReason} style={{ fontSize: 11, color: css.red, fontWeight: 600 }}>Automatically rejected · No grading required</span>}
                <CandidateSignalBadges flagCount={c.flagCount} referralCount={c.referralCount} dark={false} />
              </div>
            </div>

            <div>
              <div style={{ color: isCoffeeChatRanking ? (Number(c.coffeeChatScore) > 0 ? css.greenDark : Number(c.coffeeChatScore) < 0 ? css.red : t.textMuted) : scoreColor(headlineScore), fontSize: 17, fontFamily: sansFont, fontWeight: 600, lineHeight: 1.2 }}>
                {isCoffeeChatRanking
                  ? `${formatScore(c.coffeeChatScore || 0)} pts`
                  : hasNumericScore(headlineScore) ? `${formatScore(headlineScore)}%` : "—"}
                {!isCoffeeChatRanking && hasNumericScore(headlineScore) && Number(c.interestMultiplier) > 1 ? (
                  <span
                    title={`Demonstrated Interest: ${(c.interestEvents || []).map((event) => event.name).join(", ")}`}
                    style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: css.greenDark, background: "rgba(29,158,117,0.12)", borderRadius: 999, padding: "2px 6px", verticalAlign: "middle" }}
                  >
                    ×{Number(c.interestMultiplier).toFixed(3).replace(/0$/, "")}
                  </span>
                ) : null}
              </div>
              {!isCoffeeChatRanking ? (
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4, lineHeight: 1.45, whiteSpace: "pre-line" }}>
                  {formatReviewCountsStacked(c)}
                </div>
              ) : null}
            </div>

            {deliberationMode ? (
              <div
                style={{ display: "flex", alignItems: "center" }}
                onClick={e => e.stopPropagation()}
                onKeyDown={e => e.stopPropagation()}
              >
                {canEditDeliberations ? (
                  <DecisionButtons
                    status={decisionStatus}
                    dark={false}
                    disabled={!canRecordCommitteeDecision(c)}
                    saving={rowSaving}
                    onSelect={decision => saveDecision(c, decision)}
                  />
                ) : isStaff ? (
                  <DecisionReadonlyBadge
                    status={displayDecisionStatus}
                    dark={false}
                    label={isHistoricalCut ? historicalCutLabel : undefined}
                  />
                ) : (
                  <span style={{ fontSize: 12, color: t.textMuted }}>Staff only</span>
                )}
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, alignItems: "center" }}>
              <CandidateSignalActions
                candidateId={c.candidateId}
                resumeId={c.id}
                flaggedByMe={c.flaggedByMe}
                referredByMe={c.referredByMe}
                authedFetch={authedFetch}
                onUpdated={handleSignalUpdated}
                dark={false}
              />
              <button
                type="button"
                title={showDeliberationVoting ? "Open scorecard and vote" : "View candidate scorecard"}
                aria-label={showDeliberationVoting ? `Vote on ${c.name}` : `View scorecard for ${c.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (showDeliberationVoting) {
                    setVoteCandidate(c);
                  } else {
                    setSelectedCandidate(c);
                  }
                }}
                style={rowIconBtnStyle(t, true)}
              >
                {showDeliberationVoting ? (
                  <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>🗳️</span>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                )}
              </button>
            </div>
          </div>
          );
        })}
        </div>
        )}
        </div>
        </div>
      </div>
      </div>

      {selectedCandidate && (
        <ScorecardModal
          candidate={candidates.find(c => c.id === selectedCandidate.id) ?? selectedCandidate}
          round={data.context?.resumeRound || activeRound}
          metrics={metrics}
          maxPerCategory={maxPerCategory}
          equalized={equalizeActive}
          isAdmin={isAdmin}
          onOverrideSaved={() => fetchScoreboard({ silent: true })}
          onOpenProfile={() => openCandidateWorkspace(selectedCandidate)}
          onClose={() => setSelectedCandidate(null)}
        />
      )}

      {voteCandidate && (
        <DeliberationVoteModal
          candidate={candidates.find(c => c.id === voteCandidate.id) ?? voteCandidate}
          canVote={canVote}
          votingAvailable={deliberationVotingAvailable}
          saving={savingVoteIds.has(voteCandidate.id)}
          onSelect={(rating) => saveVote(candidates.find(c => c.id === voteCandidate.id) ?? voteCandidate, rating)}
          onClose={() => setVoteCandidate(null)}
        />
      )}

      <AdvanceEmailModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        roundId={activeRound?.id}
        roundName={activeRound?.name}
        roundStatus={activeRound?.status}
        advancedCount={displayStats?.advanced ?? 0}
        notification={advanceNotification}
        userEmail={user?.email}
        authedFetch={authedFetch}
        onSaved={(template) => {
          setData((prev) => ({
            ...prev,
            context: {
              ...prev.context,
              notification: {
                ...prev.context?.notification,
                template,
              },
            },
          }));
        }}
        onSent={() => fetchScoreboard({ silent: true })}
      />
    </div>
  );
}
