import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, useAuthedFetch } from "../../auth/AuthContext";
import { API } from "../../constants/config";
import { css } from "../../theme/colors";
import CandidateAvatar from "../../components/CandidateAvatar/CandidateAvatar";
import Topbar from "../../components/Topbar/Topbar";
import { serifFont } from "../../theme/typography";
import { formatScore, getInitials, hasNumericScore, titleCase } from "../../utils/format";
import { isAdminRole } from "../../utils/auth";
import { FRQ_METRIC, FRQ_MAX_SCORE } from "../../constants/frq";
import {
  buildDecisionPayload,
  canRecordCommitteeDecision,
  DECISION_STYLE,
  exportCandidatesDecisionCsv,
  getCandidateDecisionStatus,
  getCommitteeLinkWarning,
  passesDecisionFilter,
  patchScoreboardWithDecision,
  recomputeDecisionStats,
} from "./decisionUtils";
import { equalizeCandidateScores, recomputeEqualizedStats } from "./equalizeUtils";
import AdvanceEmailModal from "./AdvanceEmailModal";
import ReviewOverrideSection from "../../components/ReviewOverride/ReviewOverrideSection";
import CandidateSignalActions, { CandidateSignalBadges } from "../../components/CandidateSignalActions/CandidateSignalActions";
import { formatRoundKind, isInterviewRoundType } from "../../constants/rounds";
const cardGreen = "#085041";
const cardMint = "#1D9E75";
const cardPale = "#EAF3DE";
const cardLime = "#C0DD97";

function formatRoundBanner(round) {
  if (!round?.name) return "CANDIDATE SCORECARD";
  return `${round.name.toUpperCase()} · ${formatRoundKind(round.type).toUpperCase()}`;
}

function formatRoundStatus(round) {
  if (!round?.status) return "VIEW";
  if (round.status === "active") return "ACTIVE";
  if (round.status === "closed") return "CLOSED";
  if (round.status === "draft") return "DRAFT";
  return String(round.status).toUpperCase();
}

function scoreColor(score) {
  if (!hasNumericScore(score)) return css.textGray;
  const numeric = Number(score);
  if (numeric >= 90) return css.greenDark;
  if (numeric >= 80) return "#4CAF50";
  if (numeric >= 70) return css.amber;
  return css.textGray;
}

function getReviewerLabel(review, index) {
  return review?.reviewerName || review?.reviewerEmail || `Reviewer ${index + 1} not recorded`;
}

function getReviewerInitials(review, index) {
  if (review?.reviewerName) return getInitials(review.reviewerName);
  if (review?.reviewerEmail) return review.reviewerEmail.substring(0, 2).toUpperCase();
  return `R${index + 1}`;
}

function getReviewTotal(review) {
  if (Number.isFinite(Number(review?.score))) return Number(review.score);
  return Object.values(review?.scores ?? {}).reduce((total, value) => total + (Number(value) || 0), 0);
}

function uniqueSortedStrings(items) {
  const set = new Set((items || []).map(s => String(s).trim()).filter(Boolean));
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

const defaultFilters = {
  major: "all",
  year: "all",
  reviews: "all",
  scoreBand: "all",
  decision: "all",
  signals: "all",
};

function countActiveFilters(filters) {
  return Object.keys(defaultFilters).filter(key => filters[key] !== defaultFilters[key]).length;
}

function passesScoreBand(candidate, scoreBand) {
  const n = candidate?.numReviews ?? candidate?.reviews?.length ?? 0;
  const displayPct = getHeadlineScore(candidate);

  switch (scoreBand) {
    case "top":
      return displayPct !== null && displayPct >= 80;
    case "strong":
      return displayPct !== null && displayPct >= 70;
    case "low":
      return displayPct !== null && displayPct < 60 && n > 0;
    case "pending":
      return n === 0 || displayPct === null;
    default:
      return true;
  }
}

function passesReviewFilter(candidate, reviews) {
  const n = candidate?.numReviews ?? candidate?.reviews?.length ?? 0;
  switch (reviews) {
    case "0":
      return n === 0;
    case "1":
      return n === 1;
    case "1+":
      return n >= 1;
    case "2+":
      return n >= 2;
    default:
      return true;
  }
}

function passesSignalFilter(candidate, signals) {
  switch (signals) {
    case "referred":
      return (candidate.referralCount || 0) > 0;
    case "flagged":
      return (candidate.flagCount || 0) > 0;
    default:
      return true;
  }
}

function getReferralCount(c) {
  return c?.referralCount || 0;
}

function normalizePhoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function passesSearchQuery(candidate, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;

  const fields = [
    candidate.name,
    candidate.email,
    candidate.major,
    candidate.year,
    candidate.phoneNumber,
  ].filter(Boolean).map(value => String(value).toLowerCase());

  if (fields.some(value => value.includes(q))) return true;

  const qDigits = normalizePhoneDigits(q);
  if (qDigits.length >= 3) {
    const phoneDigits = normalizePhoneDigits(candidate.phoneNumber);
    if (phoneDigits.includes(qDigits)) return true;
  }

  return false;
}

function filterCandidates(list, filters, searchQuery = "") {
  return list.filter(c => {
    if (!passesSearchQuery(c, searchQuery)) return false;
    if (filters.major !== "all" && (c.major || "Undeclared") !== filters.major) return false;
    if (filters.year !== "all" && String(c.year || "").trim() !== filters.year) return false;
    if (!passesReviewFilter(c, filters.reviews)) return false;
    if (!passesScoreBand(c, filters.scoreBand)) return false;
    if (!passesDecisionFilter(c, filters.decision)) return false;
    if (!passesSignalFilter(c, filters.signals)) return false;
    return true;
  });
}

const PAGE_THEME = {
  light: {
    pageBg: css.bgLight,
    text: css.textDark,
    textMuted: css.textGray,
    cardBg: css.cardWhite,
    border: css.borderLight,
    accent: css.greenDark,
    titleAccent: css.greenDark,
    rowBg: css.cardWhite,
    rowFocus: "rgba(40, 98, 65, 0.06)",
    statValue: css.textDark,
    btnGhostBg: "#FFF",
    btnGhostText: css.textDark,
    selectBg: "#FFF",
    selectText: css.textDark,
    chipActiveBg: "rgba(40, 98, 65, 0.1)",
    infoBg: "rgba(40, 98, 65, 0.06)",
    infoBorder: "rgba(40, 98, 65, 0.18)",
  },
  dark: {
    pageBg: "#0B1628",
    text: "#E8EEF4",
    textMuted: "#8FA3B8",
    cardBg: "#141F33",
    border: "rgba(255,255,255,0.09)",
    accent: "#3DCF9A",
    titleAccent: "#6EE7B8",
    rowBg: "#141F33",
    rowFocus: "rgba(61,207,154,0.14)",
    statValue: "#F3F7FB",
    btnGhostBg: "#1C2A42",
    btnGhostText: "#E8EEF4",
    selectBg: "#1C2A42",
    selectText: "#E8EEF4",
    chipActiveBg: "rgba(61,207,154,0.18)",
    infoBg: "rgba(61,207,154,0.08)",
    infoBorder: "rgba(61,207,154,0.22)",
  },
};

function DecisionReadonlyBadge({ status, dark }) {
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
      {style.label}
    </span>
  );
}

function DecisionButtons({ status, disabled, saving, onSelect, dark }) {
  const options = ["advance", "hold", "reject"];
  const shellBorder = dark ? "rgba(255,255,255,0.14)" : css.borderLight;
  const shellBg = dark ? "#1C2A42" : "#F3F4F6";
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
              color: selected ? "#FFF" : idleColor,
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

const ROSTER_QUICK_FILTERS = [
  { id: "all", label: "All" },
  { id: "top", label: "Top ≥80%", patch: { scoreBand: "top" } },
  { id: "strong", label: "Strong ≥70%", patch: { scoreBand: "strong" } },
  { id: "pending", label: "No score", patch: { scoreBand: "pending" } },
  { id: "referred", label: "Referred", patch: { signals: "referred" } },
  { id: "flagged", label: "Flagged", patch: { signals: "flagged" } },
];

const DELIB_QUICK_FILTERS = [
  { id: "all", label: "All", patch: { decision: "all" } },
  { id: "undecided", label: "Undecided", patch: { decision: "undecided" } },
  { id: "advance", label: "Advanced", patch: { decision: "advance" } },
  { id: "hold", label: "Hold", patch: { decision: "hold" } },
  { id: "reject", label: "Rejected", patch: { decision: "reject" } },
];

function isQuickFilterActive(chip, filters, deliberationMode) {
  if (chip.id === "all") {
    if (deliberationMode) return filters.decision === "all";
    return filters.scoreBand === "all" && filters.signals === "all";
  }
  return Object.entries(chip.patch).every(([key, value]) => filters[key] === value);
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
    const reviewLabels = { 0: "No reviews", 1: "1 review", "1+": "Reviewed", "2+": "2+ reviews" };
    pills.push({ key: "reviews", label: reviewLabels[effective.reviews] || effective.reviews, clear: { reviews: "all" } });
  }
  if (effective.scoreBand !== "all") {
    const bandLabels = { top: "Top ≥80%", strong: "Strong ≥70%", low: "Low <60%", pending: "No score" };
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
    };
    pills.push({
      key: "decision",
      label: decisionLabels[effective.decision] || effective.decision,
      clear: { decision: "all" },
    });
  }

  return pills;
}

function FilterChip({ label, active, onClick, theme }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "7px 14px",
        borderRadius: 999,
        border: `1px solid ${active ? theme.accent : theme.border}`,
        background: active ? (theme.chipActiveBg || `${theme.accent}18`) : theme.btnGhostBg,
        color: active ? theme.accent : theme.btnGhostText,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "'DM Sans', sans-serif",
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "border-color 0.15s ease, background 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}

const SORT_TABS = [
  { id: "performance_desc", label: "Score · high to low" },
  { id: "performance_asc", label: "Score · low to high" },
  { id: "referrals_desc", label: "Referrals · most" },
  { id: "last_review_desc", label: "Last grade · newest" },
  { id: "last_review_asc", label: "Last grade · oldest" },
  { id: "name_asc", label: "Name · A–Z" },
  { id: "name_desc", label: "Name · Z–A" },
  { id: "reviews_desc", label: "Reviews · most" },
  { id: "reviews_asc", label: "Reviews · fewest" },
  { id: "created_desc", label: "Applied · newest" },
  { id: "created_asc", label: "Applied · oldest" },
];

function getNumReviews(c) {
  return c?.numReviews ?? c?.reviews?.length ?? 0;
}

function getLastReviewMs(c) {
  const reviews = c?.reviews ?? [];
  let max = -Infinity;
  for (const r of reviews) {
    if (!r?.submittedAt) continue;
    const t = new Date(r.submittedAt).getTime();
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max === -Infinity ? null : max;
}

function getCreatedMs(c) {
  if (!c?.createdAt) return null;
  const t = new Date(c.createdAt).getTime();
  return Number.isFinite(t) ? t : null;
}

function cmpName(a, b) {
  return String(a?.name ?? "").localeCompare(String(b?.name ?? ""), undefined, { sensitivity: "base" });
}

function cmpId(a, b) {
  return String(a.id).localeCompare(String(b.id));
}

function compareCandidates(a, b, sortBy) {
  let primary = 0;

  switch (sortBy) {
    case "performance_desc": {
      const as = getPerformanceSortScore(a);
      const bs = getPerformanceSortScore(b);
      if (as === null && bs === null) primary = (getCreatedMs(a) ?? 0) - (getCreatedMs(b) ?? 0);
      else if (as === null) primary = 1;
      else if (bs === null) primary = -1;
      else primary = bs - as;
      break;
    }
    case "performance_asc": {
      const as = getPerformanceSortScore(a);
      const bs = getPerformanceSortScore(b);
      if (as === null && bs === null) primary = (getCreatedMs(a) ?? 0) - (getCreatedMs(b) ?? 0);
      else if (as === null) primary = 1;
      else if (bs === null) primary = -1;
      else primary = as - bs;
      break;
    }
    case "last_review_desc": {
      const ta = getLastReviewMs(a);
      const tb = getLastReviewMs(b);
      if (ta === null && tb === null) primary = 0;
      else if (ta === null) primary = 1;
      else if (tb === null) primary = -1;
      else primary = tb - ta;
      break;
    }
    case "last_review_asc": {
      const ta = getLastReviewMs(a);
      const tb = getLastReviewMs(b);
      if (ta === null && tb === null) primary = 0;
      else if (ta === null) primary = -1;
      else if (tb === null) primary = 1;
      else primary = ta - tb;
      break;
    }
    case "name_asc":
      primary = cmpName(a, b);
      break;
    case "name_desc":
      primary = cmpName(b, a);
      break;
    case "reviews_desc":
      primary = getNumReviews(b) - getNumReviews(a);
      break;
    case "reviews_asc":
      primary = getNumReviews(a) - getNumReviews(b);
      break;
    case "referrals_desc":
      primary = getReferralCount(b) - getReferralCount(a);
      break;
    case "created_desc": {
      const ta = getCreatedMs(a);
      const tb = getCreatedMs(b);
      if (ta === null && tb === null) primary = 0;
      else if (ta === null) primary = 1;
      else if (tb === null) primary = -1;
      else primary = tb - ta;
      break;
    }
    case "created_asc": {
      const ta = getCreatedMs(a);
      const tb = getCreatedMs(b);
      if (ta === null && tb === null) primary = 0;
      else if (ta === null) primary = 1;
      else if (tb === null) primary = -1;
      else primary = ta - tb;
      break;
    }
    default:
      primary = 0;
  }

  if (primary !== 0) return primary;
  const referralTiebreak = getReferralCount(b) - getReferralCount(a);
  if (referralTiebreak !== 0) return referralTiebreak;
  return cmpName(a, b) || cmpId(a, b);
}

function normalizeMetricScore(candidate, metric) {
  const value = candidate?.categoryScores?.[metric];
  return hasNumericScore(value) ? Number(value) : null;
}

function getNormalizedScore(candidate) {
  if (hasNumericScore(candidate?.normalizedScore)) return Number(candidate.normalizedScore);
  return null;
}

function getScoreMaxTotal(candidate) {
  if (hasNumericScore(candidate?.compositeMax)) return Number(candidate.compositeMax);
  if (hasNumericScore(candidate?.maxScore)) return Number(candidate.maxScore);
  return null;
}

/** Cosmetic display % — capped at 100, not used for ranking. */
function getHeadlineScore(candidate) {
  const normalized = getNormalizedScore(candidate);
  if (normalized == null) return null;
  return Math.min(100, normalized);
}

function formatScorePointsLine(candidate) {
  const pts = getAggregateScore(candidate);
  const max = getScoreMaxTotal(candidate);
  if (!hasNumericScore(pts) || max == null) return null;
  return `${formatScore(pts)} pts / ${formatScore(max)}`;
}

function getSourceNormalizedScore(candidate) {
  if (hasNumericScore(candidate?.sourceNormalizedScore)) return Number(candidate.sourceNormalizedScore);
  return getNormalizedScore(candidate);
}

function getAggregateScore(candidate) {
  if (hasNumericScore(candidate?.aggregateScore)) {
    return Number(candidate.aggregateScore);
  }
  return null;
}

/** Raw pts average — source of truth for ranking/sorting. */
function getPerformanceSortScore(candidate) {
  return getAggregateScore(candidate);
}

function ReviewerStack({ reviews }) {
  const palette = [
    { bg: "#E8F1FF", color: "#24529A" },
    { bg: "#FFF2D8", color: "#9B5C00" },
    { bg: "#FCE5E5", color: "#9A2B2B" },
    { bg: "#E2F8EE", color: "#157253" },
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
        <span style={{ fontSize: 12, fontWeight: 700, color: cardGreen }}>
          {equalized ? (
            <>{formatScore(pct)}%</>
          ) : (
            <>
              {formatScore(value)} <span style={{ color: css.textGray, fontWeight: 400 }}>/ {maxPerCategory}</span>
            </>
          )}
        </span>
      </div>
      <div style={{ height: 5, background: "#EEF1EC", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: cardMint, borderRadius: 3, transition: "width 0.35s ease" }} />
      </div>
    </div>
  );
}

function ScorecardModal({
  candidate,
  onClose,
  round = null,
  metrics = [],
  maxPerCategory = 4,
  equalized = false,
  isAdmin = false,
  onOverrideSaved,
}) {
  const [reviewersOpen, setReviewersOpen] = useState(false);
  const headlineScore = getHeadlineScore(candidate);
  const sourceNormalizedScore = getSourceNormalizedScore(candidate);
  const aggregateScore = getAggregateScore(candidate);
  const reviews = candidate?.reviews ?? [];
  const frqReviews = candidate?.frqReviews ?? [];
  const totalReviewCount = reviews.length + frqReviews.length;
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
            background: "#FFF",
            color: cardGreen,
            cursor: "pointer",
            fontSize: 22,
            lineHeight: "30px",
            boxShadow: "0 12px 28px rgba(0,0,0,0.18)",
            zIndex: 1,
          }}
        >
          ×
        </button>

        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: "#FFF", textAlign: "center", margin: "0 0 10px", flexShrink: 0 }}>
          {roundBanner}
        </p>

        <div className="scorecard-body" style={{ borderRadius: 16, border: `2px solid ${cardGreen}`, background: "#FFF", boxShadow: "0 24px 70px rgba(0,0,0,0.26)" }}>
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
              <CandidateAvatar
                name={candidate.name}
                headshot={candidate.headshot}
                size={56}
                background={cardMint}
                color={cardPale}
                border="2px solid #5DCAA5"
                fontSize={17}
              />
              <div style={{ minWidth: 0 }}>
                <p style={{ color: cardPale, fontSize: 18, fontFamily: serifFont, fontWeight: 600, margin: "0 0 3px", lineHeight: 1.15 }}>{candidate.name}</p>
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
          </div>

          <div style={{ background: cardPale, padding: "11px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #DCE7D2" }}>
            <div>
              <p style={{ fontSize: 10, color: "#3B6D11", margin: "0 0 2px", fontWeight: 800, letterSpacing: "0.05em" }}>
                {equalized ? "EQUALIZED" : "NORMALIZED"} SCORE
              </p>
              <p style={{ fontSize: 30, fontWeight: 700, color: cardGreen, margin: 0, lineHeight: 1 }}>
                {formatScore(headlineScore)}<span style={{ fontSize: 14, color: "#3B6D11" }}>%</span>
              </p>
              {equalized && sourceNormalizedScore != null ? (
                <p style={{ fontSize: 11, color: "#3B6D11", margin: "4px 0 0" }}>
                  Unadjusted: {formatScore(sourceNormalizedScore)}%
                </p>
              ) : aggregateScore != null ? (
                <p style={{ fontSize: 11, color: "#3B6D11", margin: "4px 0 0" }}>
                  Raw avg: {formatScorePointsLine(candidate) ?? `${formatScore(aggregateScore)} pts`}
                  {candidate.frqPending ? " · FRQ pending" : ""}
                </p>
              ) : null}
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 10, color: "#3B6D11", margin: "0 0 6px", fontWeight: 800, letterSpacing: "0.05em" }}>{metrics.length} CATEGORIES</p>
              <ScoreTiles score={headlineScore} maxScore={100} />
            </div>
          </div>

          <div style={{ padding: "14px 18px 4px" }}>
            <p style={{ fontSize: 10, color: css.textGray, letterSpacing: "0.06em", margin: "0 0 10px", fontWeight: 800 }}>CATEGORY BREAKDOWN</p>
            {metrics.map(metric => (
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
            <div style={{ margin: "6px 18px 0", padding: "10px 12px", background: "#F8FAF6", border: "1px solid #E3E8DD", borderRadius: 8 }}>
              <p style={{ fontSize: 10, color: css.textGray, letterSpacing: "0.05em", margin: "0 0 5px", fontWeight: 800 }}>LATEST NOTE</p>
              <p style={{ fontSize: 12, lineHeight: 1.45, color: css.textDark, margin: 0 }}>{latestNote}</p>
            </div>
          )}

          <div style={{ padding: "12px 18px 18px", borderTop: "1px solid #EAEAEA", marginTop: 12 }}>
            <button
              onClick={() => setReviewersOpen(open => !open)}
              aria-expanded={reviewersOpen}
              style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", padding: 0 }}
            >
              <span style={{ fontSize: 11, color: css.textGray, fontWeight: 800, letterSpacing: "0.05em" }}>
                REVIEWS ({totalReviewCount})
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
                  const displayScore = equalized && hasNumericScore(review.normalizedScore)
                    ? `${formatScore(Math.min(100, review.normalizedScore))}%`
                    : `${formatScore(getReviewTotal(review))}/24`;

                  return (
                  <div key={review.id ?? index} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid #EAEAEA" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#E8F1FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#24529A", flexShrink: 0 }}>
                      {getReviewerInitials(review, index)}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 12, color: css.textDark, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{getReviewerLabel(review, index)}</p>
                      <p style={{ fontSize: 11, color: css.textGray, margin: 0 }}>
                        {review.submittedAt ? new Date(review.submittedAt).toLocaleDateString() : "Submitted"}
                        {reviewOverridden ? " · overridden" : " · Resume"}
                      </p>
                    </div>
                    <div style={{ fontSize: 12, color: reviewOverridden ? "#E24B4A" : cardGreen, fontWeight: 800 }}>
                      {displayScore}
                    </div>
                  </div>
                  );
                })}
                {frqReviews.map((review, index) => {
                  const displayScore = equalized && hasNumericScore(review.normalizedScore)
                    ? `${formatScore(Math.min(100, review.normalizedScore))}%`
                    : `${formatScore(review.score ?? getReviewTotal(review))}/${FRQ_MAX_SCORE}`;

                  return (
                    <div key={review.id ?? `frq-${index}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid #EAEAEA" }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#F3E8FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#6B21A8", flexShrink: 0 }}>
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
                      <div style={{ fontSize: 12, color: cardGreen, fontWeight: 800 }}>
                        {displayScore}
                      </div>
                    </div>
                  );
                })}
                {totalReviewCount === 0 ? (
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: css.textGray }}>No reviews yet.</p>
                ) : null}
              </div>
            )}
          </div>

          {isAdmin ? (
            <ReviewOverrideSection
              resumeId={candidate.id}
              reviews={reviews}
              metrics={metrics}
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
  background: "#FFF",
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
    color: primary ? "#0B1628" : theme.text,
    border: primary ? "none" : `1px solid ${theme.border}`,
    cursor: "pointer",
    flexShrink: 0,
  };
}

export default function ScoreboardPage() {
  const navigate = useNavigate();
  const { user, isStaff } = useAuth();
  const authedFetch = useAuthedFetch();
  const isAdmin = isAdminRole(user?.role);
  const [data, setData] = useState({ stats: null, candidates: [], metrics: [], maxPerCategory: 4, context: null });
  const [loading, setLoading] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(() => ({ ...defaultFilters }));
  const [sortBy, setSortBy] = useState("performance_desc");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [deliberationMode, setDeliberationMode] = useState(false);
  const [equalizeActive, setEqualizeActive] = useState(false);
  const [savingDecisionId, setSavingDecisionId] = useState(null);
  const [decisionError, setDecisionError] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [advanceRoundBusy, setAdvanceRoundBusy] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [viewingRoundId, setViewingRoundId] = useState(null);
  const [focusedCandidateId, setFocusedCandidateId] = useState(null);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const filterWrapRef = useRef(null);
  const adminMenuRef = useRef(null);
  const rowRefs = useRef({});
  const pendingDecisionIdsRef = useRef(new Set());
  const viewingHistorical = data.context?.viewingHistorical === true;

  const fetchScoreboard = useCallback(async (opts = {}) => {
    const silent = opts.silent === true;
    const roundId = opts.roundId !== undefined ? opts.roundId : viewingRoundId;
    if (!silent) setLoading(true);
    try {
      const query = roundId ? `?roundId=${encodeURIComponent(roundId)}` : "";
      const res = await authedFetch(`${API}/scoreboard${query}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (!silent) {
          setDecisionError(body.error || "Could not load scoreboard — is the API server running?");
        }
        return;
      }

      const json = await res.json();
      const hasDecisionSupport = (json.candidates || []).length === 0
        || Object.prototype.hasOwnProperty.call(json.candidates[0], "decision");
      if (!hasDecisionSupport) {
        setDecisionError(
          "Deliberation API is missing on the server — restart it with the latest code (cd server && node index.js) or redeploy Render."
        );
      } else if (!silent) {
        setDecisionError("");
      }

      setData(prev => {
        if (!silent || pendingDecisionIdsRef.current.size === 0) return json;
        const mergedCandidates = (json.candidates || []).map(c => {
          if (!pendingDecisionIdsRef.current.has(c.id)) return c;
          const local = (prev.candidates || []).find(row => row.id === c.id);
          return local ? { ...c, decision: local.decision } : c;
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
      });
    } catch (err) {
      console.error("Failed to load scoreboard:", err);
      if (!silent) {
        setDecisionError("Could not reach the API — check that the server is running on port 3000.");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [authedFetch, viewingRoundId]);

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    fetchScoreboard();
  }, [fetchScoreboard]);

  useEffect(() => {
    if (!deliberationMode || viewingHistorical || !isStaff) return undefined;
    const interval = setInterval(() => fetchScoreboard({ silent: true }), 5000);
    return () => clearInterval(interval);
  }, [deliberationMode, fetchScoreboard, isStaff, viewingHistorical]);

  useEffect(() => {
    if (!filtersOpen) return;
    function onPointerDown(event) {
      if (filterWrapRef.current && !filterWrapRef.current.contains(event.target)) {
        setFiltersOpen(false);
      }
    }
    function onKeyDown(event) {
      if (event.key === "Escape") setFiltersOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [filtersOpen]);

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

  useEffect(() => {
    if (!focusedCandidateId) return;
    const el = rowRefs.current[focusedCandidateId];
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedCandidateId]);

  const candidates = useMemo(() => {
    const base = data.candidates ?? [];
    if (!equalizeActive) return base;
    return equalizeCandidateScores(base, { metrics: data.metrics ?? [], maxPerCategory: data.maxPerCategory ?? 4 });
  }, [data.candidates, data.metrics, data.maxPerCategory, equalizeActive]);

  const displayStats = useMemo(() => {
    const base = data.stats ?? {};
    if (!equalizeActive) return base;
    const { avgScore } = recomputeEqualizedStats(candidates);
    return { ...base, avgScore };
  }, [data.stats, candidates, equalizeActive]);
  const metrics = useMemo(() => data.metrics ?? [], [data.metrics]);
  const maxPerCategory = data.maxPerCategory ?? 4;
  const activeRound = data.context?.round;
  const liveActiveRound = data.context?.activeRound;
  const nextRound = data.context?.nextRound;
  const allRounds = data.context?.allRounds ?? [];
  const canDeliberate = data.context?.canDeliberate === true;
  const canEditDeliberations = isAdmin && canDeliberate && !viewingHistorical;
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
    () => uniqueSortedStrings(candidates.map(c => c.year).filter(Boolean)),
    [candidates]
  );

  const filteredCandidates = useMemo(() => {
    const effectiveFilters = deliberationMode ? filters : { ...filters, decision: "all" };
    const filtered = filterCandidates(candidates, effectiveFilters, searchQuery);
    return [...filtered].sort((a, b) => compareCandidates(a, b, sortBy));
  }, [candidates, filters, searchQuery, sortBy, deliberationMode]);

  const saveDecision = useCallback(async (candidate, decision) => {
    if (!canEditDeliberations || !deliberationMode) return;

    const previousDecision = candidate.decision;
    const optimisticDecision = buildDecisionPayload(decision, candidate.decision?.notes || "");

    pendingDecisionIdsRef.current.add(candidate.id);
    setData(prev => patchScoreboardWithDecision(prev, candidate.id, optimisticDecision));
    setSelectedCandidate(prev => (prev?.id === candidate.id ? { ...prev, decision: optimisticDecision } : prev));
    setSavingDecisionId(candidate.id);
    setDecisionError("");

    try {
      const res = await authedFetch(`${API}/scoreboard/decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_id: candidate.id,
          candidate_id: candidate.candidateId || undefined,
          decision,
          notes: candidate.decision?.notes || "",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 404) {
          throw new Error("Decision API not found — restart the local server or redeploy Render with the latest code.");
        }
        throw new Error(body.error || "Could not save decision");
      }
      const { decision: savedDecision } = await res.json();
      const confirmed = { ...savedDecision, provisional: true };
      setData(prev => patchScoreboardWithDecision(prev, candidate.id, confirmed));
      setSelectedCandidate(prev => (prev?.id === candidate.id ? { ...prev, decision: confirmed } : prev));
    } catch (err) {
      setData(prev => patchScoreboardWithDecision(prev, candidate.id, previousDecision || buildDecisionPayload("pending")));
      setSelectedCandidate(prev => (
        prev?.id === candidate.id ? { ...prev, decision: previousDecision || buildDecisionPayload("pending") } : prev
      ));
      setDecisionError(err.message || "Could not save decision");
    } finally {
      pendingDecisionIdsRef.current.delete(candidate.id);
      setSavingDecisionId(null);
    }
  }, [authedFetch, canEditDeliberations, deliberationMode]);

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
  }, []);

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
    setDecisionError("");
    try {
      const res = await authedFetch(`${API}/rounds/${activeRound.id}/advance-to-next`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not advance to next round");
      }
      setViewingRoundId(null);
      setDeliberationMode(false);
      await fetchScoreboard({ roundId: null });
    } catch (err) {
      setDecisionError(err.message || "Could not advance to next round");
    } finally {
      setAdvanceRoundBusy(false);
    }
  }, [activeRound?.id, activeRound?.name, authedFetch, canCloseRound, canDeliberate, fetchScoreboard, isAdmin, nextRound?.name, undecidedCount]);

  const handleExport = useCallback((decision) => {
    setExportBusy(true);
    setDecisionError("");
    try {
      exportCandidatesDecisionCsv(candidates, decision);
    } catch (err) {
      setDecisionError(err.message || "Export failed");
    } finally {
      setExportBusy(false);
    }
  }, [candidates]);

  useEffect(() => {
    if (!deliberationMode || !canEditDeliberations) return undefined;
    function onKeyDown(event) {
      const tag = event.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      const list = filteredCandidates;
      if (!list.length) return;

      let index = list.findIndex(c => String(c.id) === String(focusedCandidateId));
      if (index < 0) index = 0;

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

      const focused = list[index];
      if (!canRecordCommitteeDecision(focused)) return;

      const key = event.key.toLowerCase();
      const currentStatus = getCandidateDecisionStatus(focused);
      if (key === "g") {
        event.preventDefault();
        saveDecision(focused, currentStatus === "advance" ? "pending" : "advance");
      } else if (key === "y") {
        event.preventDefault();
        saveDecision(focused, currentStatus === "hold" ? "pending" : "hold");
      } else if (key === "r") {
        event.preventDefault();
        saveDecision(focused, currentStatus === "reject" ? "pending" : "reject");
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [canEditDeliberations, deliberationMode, filteredCandidates, focusedCandidateId, saveDecision]);

  useEffect(() => {
    if (!deliberationMode) {
      setFocusedCandidateId(null);
      return;
    }
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
  }, [deliberationMode, filteredCandidates, focusedCandidateId]);

  const activeFilterCount = countActiveFilters(
    deliberationMode ? filters : { ...filters, decision: "all" }
  );
  const hasActiveSearch = searchInput.trim().length > 0;
  const hasActiveNarrowing = activeFilterCount > 0 || hasActiveSearch;
  const activeFilterPills = useMemo(
    () => buildActiveFilterPills(filters, deliberationMode),
    [filters, deliberationMode]
  );
  const t = deliberationMode ? PAGE_THEME.dark : PAGE_THEME.light;
  const gridColumns = deliberationMode
    ? "4px 36px minmax(180px, 2.2fr) 100px minmax(196px, 0.9fr) minmax(108px, auto)"
    : "48px minmax(220px, 2.2fr) 108px minmax(100px, auto)";

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
        case "REVIEWED":
          setFilters(f => ({ ...f, reviews: "1+" }));
          break;
        case "APPLICANTS":
          setFilters({ ...defaultFilters });
          setSearchInput("");
          break;
        default:
          break;
      }
      return;
    }
    switch (label) {
      case "REVIEWED":
        setFilters(f => ({ ...f, reviews: "1+" }));
        break;
      case "ADVANCED":
        setFilters(f => ({ ...f, scoreBand: "top" }));
        break;
      case "APPLICANTS":
        setFilters({ ...defaultFilters });
        setSearchInput("");
        break;
      default:
        break;
    }
  }

  function applyQuickFilter(chip) {
    if (chip.id === "all") {
      if (deliberationMode) {
        setFilters(f => ({ ...f, decision: "all" }));
      } else {
        setFilters(f => ({ ...f, scoreBand: "all", signals: "all" }));
      }
      return;
    }
    setFilters(f => ({ ...f, ...chip.patch }));
  }

  function toggleDeliberationMode() {
    if (viewingHistorical) return;
    setDeliberationMode(on => {
      if (on) {
        setFilters(f => ({ ...f, decision: "all" }));
        setFocusedCandidateId(null);
        setDecisionError("");
      } else {
        fetchScoreboard();
      }
      return !on;
    });
  }

  const handleViewPastRound = useCallback((roundId) => {
    if (!roundId) return;
    setViewingRoundId(roundId);
    setDeliberationMode(true);
    setFilters(f => ({ ...f, decision: "all" }));
    setFocusedCandidateId(null);
    setDecisionError("");
    fetchScoreboard({ roundId });
  }, [fetchScoreboard]);

  const handleReturnToCurrentRound = useCallback(() => {
    setViewingRoundId(null);
    setDeliberationMode(false);
    setFilters(f => ({ ...f, decision: "all" }));
    setFocusedCandidateId(null);
    setDecisionError("");
    fetchScoreboard({ roundId: null });
  }, [fetchScoreboard]);

  useEffect(() => {
    if (viewingHistorical && !deliberationMode) {
      setDeliberationMode(true);
    }
  }, [viewingHistorical, deliberationMode]);

  const statRows = deliberationMode
    ? [
        { label: "PENDING", value: statCount(displayStats?.pending ?? (displayStats?.applicants != null ? displayStats?.applicants : null)), clickable: true },
        { label: "ADVANCED", value: statCount(displayStats?.advanced ?? 0), clickable: true },
        { label: "HOLD", value: statCount(displayStats?.hold ?? 0), clickable: true },
        { label: "REJECTED", value: statCount(displayStats?.rejected ?? 0), clickable: true },
        { label: "REVIEWED", value: statCount(displayStats?.reviewed), clickable: true },
        { label: "APPLICANTS", value: statCount(displayStats?.applicants), clickable: true },
      ]
    : [
        { label: "APPLICANTS", value: statCount(displayStats?.applicants), clickable: true },
        { label: "REVIEWED", value: statCount(displayStats?.reviewed), clickable: true },
        { label: "ADVANCED", value: statCount(displayStats?.advanced), clickable: true },
        { label: "AVG SCORE", value: statCount(displayStats?.avgScore), clickable: false },
      ];

  const decidedCount = deliberationMode
    ? (displayStats?.advanced ?? 0) + (displayStats?.hold ?? 0) + (displayStats?.rejected ?? 0)
    : 0;
  const totalApplicants = displayStats?.applicants ?? 0;
  const decisionProgress = totalApplicants > 0 ? Math.round((decidedCount / totalApplicants) * 100) : 0;

  const quickFilters = deliberationMode ? DELIB_QUICK_FILTERS : ROSTER_QUICK_FILTERS;

  const filterSelectStyle = {
    ...selectStyle,
    marginTop: 4,
    background: t.selectBg,
    color: t.selectText,
    border: `1px solid ${t.border}`,
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
            {deliberationMode ? "Live deliberation" : scoreboardLabel}
          </p>
          <div style={{ display: "flex", alignItems: "stretch", gap: 14 }}>
            <div style={{ width: 4, borderRadius: 4, background: `linear-gradient(180deg, ${t.accent} 0%, ${cardMint} 100%)`, flexShrink: 0 }} aria-hidden />
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, lineHeight: 1.08, letterSpacing: "-0.03em" }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 28, fontWeight: 500, color: t.text }}>Candidate </span>
                <span style={{ fontFamily: serifFont, fontSize: 32, fontWeight: 600, color: t.titleAccent }}>scoreboard</span>
              </h1>
              <p style={{ margin: "10px 0 0", fontSize: 14, color: t.textMuted, lineHeight: 1.5, maxWidth: 520 }}>
                {deliberationMode ? (
                  viewingHistorical
                    ? `Archived decisions for ${activeRound?.name || "this round"}.`
                    : canEditDeliberations
                      ? "Click a row to focus, then choose Advance, Hold, or Reject."
                      : `Viewing ${activeRound?.name || "this round"} — updates every few seconds.`
                ) : (
                  "Browse candidates by score, major, and review status."
                )}
                {hasActiveNarrowing ? (
                  <span style={{ display: "block", marginTop: 6, fontSize: 13, color: t.titleAccent, fontWeight: 600 }}>
                    Showing {filteredCandidates.length} of {candidates.length}
                  </span>
                ) : null}
              </p>
            </div>
          </div>
        </div>

        <div style={{ flexShrink: 0, marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {isStaff ? (
            <>
              {pastRounds.length > 0 ? (
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: "0.04em" }}>Past rounds</span>
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
                    <option value="">Current round</option>
                    {pastRounds.map((round) => (
                      <option key={round.id} value={round.id}>
                        {round.name}{round.status === "closed" ? " (closed)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                onClick={viewingHistorical ? handleReturnToCurrentRound : toggleDeliberationMode}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  padding: "8px 14px",
                  borderRadius: 8,
                  background: deliberationMode ? t.accent : t.btnGhostBg,
                  color: deliberationMode ? "#0B1628" : t.btnGhostText,
                  border: `1px solid ${deliberationMode ? t.accent : t.border}`,
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {viewingHistorical ? "Back to current" : deliberationMode ? "Exit" : "Deliberation"}
              </button>
              <button
                type="button"
                onClick={() => setEqualizeActive(on => !on)}
                title="Recalculate scores using per-grader z-scores on each rubric category"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  padding: "8px 14px",
                  borderRadius: 8,
                  background: equalizeActive ? t.accent : t.btnGhostBg,
                  color: equalizeActive ? "#0B1628" : t.btnGhostText,
                  border: `1px solid ${equalizeActive ? t.accent : t.border}`,
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {equalizeActive ? "Raw scores" : "Equalize"}
              </button>
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
                  {canDeliberate && activeRound?.id && !viewingHistorical ? (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={advanceRoundBusy || !canCloseRound}
                      title={
                        !canCloseRound
                          ? `Mark all ${undecidedCount || "remaining"} candidates Advance or Reject before closing`
                          : nextRound
                            ? `Close ${activeRound.name} and open ${nextRound.name}`
                            : "Close this round"
                      }
                      onClick={() => { handleAdvanceRound(); setAdminMenuOpen(false); }}
                      style={{
                        ...adminMenuItemStyle(t),
                        color: t.accent,
                        fontWeight: 700,
                        opacity: advanceRoundBusy || !canCloseRound ? 0.55 : 1,
                      }}
                    >
                      {advanceRoundBusy
                        ? "Advancing…"
                        : !canCloseRound
                          ? `Close round (${undecidedCount} undecided)`
                          : nextRound
                            ? `Close & open ${nextRound.name}`
                            : "Close round"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          </div>
        </div>
      </div>

      {viewingHistorical && activeRound ? (
        <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: deliberationMode ? "rgba(61,207,154,0.08)" : t.cardBg, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: t.text }}>
              Viewing past round: {activeRound.name}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: t.textMuted }}>
              Committee decisions from this closed round are read-only.
            </p>
          </div>
          <button
            type="button"
            onClick={handleReturnToCurrentRound}
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
            Back to current round
          </button>
        </div>
      ) : null}

      {decisionError ? (
        <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", padding: "0 0 8px", color: css.red, fontSize: 13, fontWeight: 600 }}>
          {decisionError}
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
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
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
            onClick={() => { setSearchInput(""); setSearchQuery(""); }}
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

      <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {quickFilters.map(chip => (
          <FilterChip
            key={chip.id}
            label={chip.label}
            active={isQuickFilterActive(chip, filters, deliberationMode)}
            onClick={() => applyQuickFilter(chip)}
            theme={t}
          />
        ))}
        <div ref={filterWrapRef} style={{ position: "relative", marginLeft: "auto" }}>
          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-haspopup="true"
            onClick={() => setFiltersOpen(open => !open)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              padding: "7px 14px",
              borderRadius: 999,
              background: t.btnGhostBg,
              color: t.btnGhostText,
              border: `1px solid ${filtersOpen ? t.accent : t.border}`,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            More filters
            {activeFilterCount > 0 ? (
              <span style={{ background: deliberationMode ? "rgba(61,207,154,0.18)" : "rgba(40, 98, 65, 0.1)", color: t.accent, borderRadius: 20, fontSize: 10, fontWeight: 700, padding: "1px 7px" }}>
                {activeFilterCount}
              </span>
            ) : null}
          </button>
          {filtersOpen ? (
            <div
              role="dialog"
              aria-label="Sort and filter scoreboard"
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 8px)",
                width: "min(300px, calc(100vw - 44px))",
                background: t.cardBg,
                borderRadius: 10,
                boxShadow: "0 16px 48px rgba(0,0,0,0.12)",
                border: `1px solid ${t.border}`,
                padding: "16px 16px 12px",
                zIndex: 50,
                color: t.text,
                animation: "scoreboardPanelIn 0.22s ease-out",
              }}
            >
              <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: t.textMuted }}>SORT BY</p>
              <label style={{ display: "block", marginBottom: 14, fontSize: 12, fontWeight: 600 }}>
                Order
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={filterSelectStyle}>
                  {SORT_TABS.map(tab => (
                    <option key={tab.id} value={tab.id}>{tab.label}</option>
                  ))}
                </select>
              </label>
              <p style={{ margin: "0 0 12px", paddingTop: 4, borderTop: `1px solid ${t.border}`, fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: t.textMuted }}>FILTER BY</p>
              <label style={{ display: "block", marginBottom: 10, fontSize: 12, fontWeight: 600 }}>
                Major
                <select value={filters.major} onChange={e => setFilters(f => ({ ...f, major: e.target.value }))} style={filterSelectStyle}>
                  <option value="all">All majors</option>
                  {majorOptions.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label style={{ display: "block", marginBottom: 10, fontSize: 12, fontWeight: 600 }}>
                Year
                <select value={filters.year} onChange={e => setFilters(f => ({ ...f, year: e.target.value }))} style={filterSelectStyle}>
                  <option value="all">All years</option>
                  {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
              <label style={{ display: "block", marginBottom: 10, fontSize: 12, fontWeight: 600 }}>
                Reviews
                <select value={filters.reviews} onChange={e => setFilters(f => ({ ...f, reviews: e.target.value }))} style={filterSelectStyle}>
                  <option value="all">Any count</option>
                  <option value="0">None yet (0)</option>
                  <option value="1">Exactly 1</option>
                  <option value="1+">Reviewed (1+)</option>
                  <option value="2+">2 or more</option>
                </select>
              </label>
              <label style={{ display: "block", marginBottom: 12, fontSize: 12, fontWeight: 600 }}>
                Score
                <select value={filters.scoreBand} onChange={e => setFilters(f => ({ ...f, scoreBand: e.target.value }))} style={filterSelectStyle}>
                  <option value="all">All scores</option>
                  <option value="top">Top (≥ 80%)</option>
                  <option value="strong">Strong (≥ 70%)</option>
                  <option value="low">Low (&lt; 60%, reviewed)</option>
                  <option value="pending">Pending / no score</option>
                </select>
              </label>
              <label style={{ display: "block", marginBottom: 12, fontSize: 12, fontWeight: 600 }}>
                Flags / referrals
                <select value={filters.signals} onChange={e => setFilters(f => ({ ...f, signals: e.target.value }))} style={filterSelectStyle}>
                  <option value="all">All candidates</option>
                  <option value="referred">Referred only</option>
                  <option value="flagged">Flagged only</option>
                </select>
              </label>
              {deliberationMode ? (
                <label style={{ display: "block", marginBottom: 12, fontSize: 12, fontWeight: 600 }}>
                  Committee decision
                  <select value={filters.decision} onChange={e => setFilters(f => ({ ...f, decision: e.target.value }))} style={filterSelectStyle}>
                    <option value="all">All decisions</option>
                    <option value="undecided">Undecided (pending + hold)</option>
                    <option value="pending">Pending only</option>
                    <option value="advance">Advanced</option>
                    <option value="hold">Hold</option>
                    <option value="reject">Rejected</option>
                  </select>
                </label>
              ) : null}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${t.border}`, paddingTop: 10 }}>
                <button type="button" onClick={() => setFilters({ ...defaultFilters })} style={{ background: "none", border: "none", color: t.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 }}>
                  Clear all
                </button>
                <button type="button" onClick={() => setFiltersOpen(false)} style={{ background: t.accent, border: "none", color: deliberationMode ? "#0B1628" : "#FFF", padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Done
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {(activeFilterPills.length > 0 || hasActiveSearch) ? (
        <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {hasActiveSearch ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, background: t.chipActiveBg, border: `1px solid ${t.border}`, fontSize: 12, fontWeight: 600, color: t.text }}>
              Search: “{searchQuery.trim()}”
              <button
                type="button"
                onClick={() => { setSearchInput(""); setSearchQuery(""); }}
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
            onClick={() => { setFilters({ ...defaultFilters }); setSearchInput(""); setSearchQuery(""); }}
            style={{ border: "none", background: "none", color: t.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "4px 0" }}
          >
            Clear all
          </button>
        </div>
      ) : null}

      {equalizeActive ? (
        <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${t.infoBorder}`, background: t.infoBg, fontSize: 13, color: t.text, lineHeight: 1.45 }}>
          <strong style={{ color: t.accent }}>Equalized scores</strong> — adjusted by grader z-scores per rubric category. Toggle “Raw scores” to compare.
        </div>
      ) : null}

      {deliberationMode && canEditDeliberations && !viewingHistorical ? (
        <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", padding: "8px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.btnGhostBg, fontSize: 12, color: t.textMuted, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <span style={{ fontWeight: 700, color: t.text, letterSpacing: "0.04em" }}>Shortcuts</span>
          <span>↑↓ navigate</span>
          <span><kbd style={kbdStyle(t)}>G</kbd> advance</span>
          <span><kbd style={kbdStyle(t)}>Y</kbd> hold</span>
          <span><kbd style={kbdStyle(t)}>R</kbd> reject</span>
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
            <div style={{ fontSize: 24, color: t.statValue, lineHeight: 1.1, fontWeight: 700 }}>{stat.value}</div>
            <div style={{ fontSize: 10, color: t.textMuted, fontWeight: 700, letterSpacing: "0.06em", marginTop: 4 }}>{stat.label}</div>
          </button>
        ))}
        </div>
        {deliberationMode && totalApplicants > 0 ? (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: t.textMuted, marginBottom: 6 }}>
              <span>Decision progress</span>
              <span style={{ fontWeight: 600, color: t.text }}>{decidedCount} / {totalApplicants} decided ({decisionProgress}%)</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: t.btnGhostBg, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${decisionProgress}%`, background: t.accent, borderRadius: 999, transition: "width 0.3s ease" }} />
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
          <div>{equalizeActive ? "EQUALIZED" : "SCORE"}</div>
          {deliberationMode ? <div>DECISION</div> : null}
          <div style={{ textAlign: "right" }} />
        </div>

        <div>
        {loading && <div style={{ padding: 40, textAlign: "center", color: t.textMuted }}>Loading candidates…</div>}

        {!loading && candidates.length > 0 && filteredCandidates.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: t.textMuted }}>
            {hasActiveSearch ? "No candidates match your search." : "No candidates match these filters."}
          </div>
        )}

        {!loading && candidates.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: t.textMuted }}>No candidates yet.</div>
        )}

        {!loading && filteredCandidates.map((c, index) => {
          const decisionStatus = getCandidateDecisionStatus(c);
          const decisionStyle = DECISION_STYLE[decisionStatus];
          const isFocused = deliberationMode && focusedCandidateId != null && String(focusedCandidateId) === String(c.id);
          const rowSaving = savingDecisionId === c.id;
          const reviewCount = c.numReviews ?? c.reviews?.length ?? 0;
          const headlineScore = getHeadlineScore(c);
          const rowBg = isFocused
            ? t.rowFocus
            : deliberationMode && decisionStyle.row !== "transparent"
              ? decisionStyle.row
              : t.rowBg;

          return (
          <div
            key={c.id}
            ref={el => { rowRefs.current[c.id] = el; }}
            onClick={() => {
              if (!deliberationMode) return;
              setFocusedCandidateId(prev => (String(prev) === String(c.id) ? null : c.id));
            }}
            style={{
              display: "grid",
              gridTemplateColumns: gridColumns,
              padding: deliberationMode ? "12px 16px" : "14px 20px",
              borderBottom: `1px solid ${t.border}`,
              alignItems: "center",
              background: rowBg,
              outline: isFocused ? `2px solid ${t.accent}` : "none",
              outlineOffset: -2,
              transition: "background 0.15s ease",
            }}
          >
            {deliberationMode ? (
              <div style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: decisionStatus === "pending" ? "transparent" : decisionStyle.color, minHeight: 40 }} aria-hidden />
            ) : null}

            <div style={{ color: isFocused ? t.accent : t.textMuted, fontWeight: 700, fontSize: 13 }}>{index + 1}</div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <CandidateAvatar name={c.name} headshot={c.headshot} size={40} background={deliberationMode ? t.accent : css.greenDark} />
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setSelectedCandidate(c); }}
                  style={{
                    border: "none",
                    background: "none",
                    padding: 0,
                    textAlign: "left",
                    fontSize: 15,
                    fontWeight: 500,
                    fontFamily: serifFont,
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
                <span style={{ fontSize: 12, color: t.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {[c.major, c.year].filter(Boolean).join(" · ")}
                </span>
                {deliberationMode && getCommitteeLinkWarning(c) ? (
                  <span style={{ fontSize: 11, color: css.red, fontWeight: 600 }}>
                    {getCommitteeLinkWarning(c)}
                  </span>
                ) : null}
                <CandidateSignalBadges flagCount={c.flagCount} referralCount={c.referralCount} dark={deliberationMode} />
              </div>
            </div>

            <div>
              <div style={{ color: scoreColor(headlineScore), fontSize: 17, fontFamily: serifFont, fontWeight: 600, lineHeight: 1.2 }}>
                {hasNumericScore(headlineScore) ? `${formatScore(headlineScore)}%` : "—"}
              </div>
              <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2, lineHeight: 1.35 }}>
                {formatScorePointsLine(c) ?? (equalizeActive ? "Equalized" : "No score")}
                <br />
                {reviewCount} {reviewCount === 1 ? "review" : "reviews"}
              </div>
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
                    dark={deliberationMode}
                    disabled={!canRecordCommitteeDecision(c)}
                    saving={rowSaving}
                    onSelect={decision => saveDecision(c, decision)}
                  />
                ) : isStaff ? (
                  <DecisionReadonlyBadge status={decisionStatus} dark={deliberationMode} />
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
                dark={deliberationMode}
              />
              <button
                type="button"
                title="View scorecard"
                aria-label={`View details for ${c.name}`}
                onClick={(e) => { e.stopPropagation(); setSelectedCandidate(c); }}
                style={rowIconBtnStyle(t, true)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              </button>
              <button
                type="button"
                title="View application"
                aria-label={`View application for ${c.name}`}
                onClick={(e) => { e.stopPropagation(); navigate(`/scoreboard/${c.id}/application`); }}
                style={rowIconBtnStyle(t, false)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
              </button>
            </div>
          </div>
          );
        })}
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
          onClose={() => setSelectedCandidate(null)}
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
