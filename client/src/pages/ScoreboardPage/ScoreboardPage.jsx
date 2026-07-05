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
import ReviewOverrideSection from "./ReviewOverrideSection";
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
};

function countActiveFilters(filters) {
  return Object.keys(defaultFilters).filter(key => filters[key] !== defaultFilters[key]).length;
}

function passesScoreBand(candidate, scoreBand) {
  const n = candidate?.numReviews ?? candidate?.reviews?.length ?? 0;
  const score = hasNumericScore(candidate?.score) ? Number(candidate.score) : null;

  switch (scoreBand) {
    case "top":
      return score !== null && score >= 80;
    case "strong":
      return score !== null && score >= 70;
    case "low":
      return score !== null && score < 60 && n > 0;
    case "pending":
      return n === 0 || score === null;
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
    case "2+":
      return n >= 2;
    default:
      return true;
  }
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

const SORT_TABS = [
  { id: "performance_desc", label: "Score · high to low" },
  { id: "performance_asc", label: "Score · low to high" },
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
      const as = hasNumericScore(a.score) ? Number(a.score) : null;
      const bs = hasNumericScore(b.score) ? Number(b.score) : null;
      if (as === null && bs === null) primary = (getCreatedMs(a) ?? 0) - (getCreatedMs(b) ?? 0);
      else if (as === null) primary = 1;
      else if (bs === null) primary = -1;
      else primary = bs - as;
      break;
    }
    case "performance_asc": {
      const as = hasNumericScore(a.score) ? Number(a.score) : null;
      const bs = hasNumericScore(b.score) ? Number(b.score) : null;
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
  return cmpName(a, b) || cmpId(a, b);
}

function normalizeMetricScore(candidate, metric) {
  const value = candidate?.categoryScores?.[metric];
  return hasNumericScore(value) ? Number(value) : null;
}

function getNormalizedScore(candidate) {
  if (hasNumericScore(candidate?.normalizedScore)) return Number(candidate.normalizedScore);
  if (hasNumericScore(candidate?.score)) return Number(candidate.score);
  return null;
}

function getHeadlineScore(candidate, { equalized = false } = {}) {
  if (equalized) return getNormalizedScore(candidate);
  if (hasNumericScore(candidate?.score)) return Number(candidate.score);
  return getNormalizedScore(candidate);
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
  const headlineScore = getHeadlineScore(candidate, { equalized });
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

        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: "#FFF", textAlign: "center", margin: "0 0 10px" }}>
          {roundBanner}
        </p>

        <div style={{ borderRadius: 16, border: `2px solid ${cardGreen}`, overflow: "hidden", background: "#FFF", boxShadow: "0 24px 70px rgba(0,0,0,0.26)" }}>
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
                  Raw avg: {formatScore(aggregateScore)} pts
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
                    ? `${formatScore(review.normalizedScore)}%`
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
                    ? `${formatScore(review.normalizedScore)}%`
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
              equalized={equalized}
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
  const [searchQuery, setSearchQuery] = useState("");
  const [listMotionKey, setListMotionKey] = useState(0);
  const [deliberationMode, setDeliberationMode] = useState(false);
  const [equalizeActive, setEqualizeActive] = useState(false);
  const [savingDecisionId, setSavingDecisionId] = useState(null);
  const [decisionError, setDecisionError] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [advanceRoundBusy, setAdvanceRoundBusy] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [viewingRoundId, setViewingRoundId] = useState(null);
  const [focusedCandidateId, setFocusedCandidateId] = useState(null);
  const filterWrapRef = useRef(null);
  /** After first data paint, bump key so sort/filter changes remount rows and replay stagger. */
  const listStaggerBootstrappedRef = useRef(false);
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
    if (loading) return;
    if (!listStaggerBootstrappedRef.current) {
      listStaggerBootstrappedRef.current = true;
      return;
    }
    setListMotionKey(k => k + 1);
  }, [loading, sortBy, searchQuery, filters.major, filters.year, filters.reviews, filters.scoreBand, filters.decision]);

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
  const hasActiveSearch = searchQuery.trim().length > 0;
  const hasActiveNarrowing = activeFilterCount > 0 || hasActiveSearch;
  const t = deliberationMode ? PAGE_THEME.dark : PAGE_THEME.light;
  const gridColumns = deliberationMode
    ? "4px 40px minmax(160px, 2fr) 88px minmax(220px, 0.9fr) minmax(148px, auto)"
    : "60px minmax(240px, 2fr) 1fr 220px";

  function statCount(value) {
    if (value === undefined || value === null || value === "") return "—";
    return value;
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
        ["PENDING", statCount(displayStats?.pending ?? (displayStats?.applicants != null ? displayStats?.applicants : null))],
        ["ADVANCED", statCount(displayStats?.advanced ?? 0)],
        ["HOLD", statCount(displayStats?.hold ?? 0)],
        ["REJECTED", statCount(displayStats?.rejected ?? 0)],
        ["REVIEWED", statCount(displayStats?.reviewed)],
        ["APPLICANTS", statCount(displayStats?.applicants)],
      ]
    : [
        ["APPLICANTS", statCount(displayStats?.applicants)],
        ["REVIEWED", statCount(displayStats?.reviewed)],
        ["ADVANCED", statCount(displayStats?.advanced)],
        ["AVG SCORE", statCount(displayStats?.avgScore)],
      ];

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
        @keyframes scoreboardRowEnter {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <Topbar phaseLabel={scoreboardLabel} activeLabel="Live roster" rightSlot={<></>} />

      <div style={{ flex: 1, padding: "14px 22px 32px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
        <div style={{ maxWidth: 640, flex: "1 1 260px", minWidth: 0 }}>
          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: t.titleAccent }}>
            {deliberationMode ? "Live deliberation" : "Spring 2025 · Live roster"}
          </p>
          <div style={{ display: "flex", alignItems: "stretch", gap: 14 }}>
            <div style={{ width: 4, borderRadius: 4, background: `linear-gradient(180deg, ${t.accent} 0%, ${cardMint} 100%)`, flexShrink: 0 }} aria-hidden />
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, lineHeight: 1.08, letterSpacing: "-0.03em" }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 28, fontWeight: 500, color: t.text }}>Candidate </span>
                <span style={{ fontFamily: serifFont, fontSize: 32, fontWeight: 600, color: t.titleAccent }}>scoreboard</span>
              </h1>
              <p style={{ margin: "10px 0 0", fontSize: 14, color: t.textMuted, lineHeight: 1.45 }}>
                {deliberationMode ? (
                  <>
                    {viewingHistorical ? (
                      <>Archived committee decisions for <strong style={{ color: t.text }}>{activeRound?.name || "this round"}</strong>. Decisions persist after you leave deliberation or close the round.</>
                    ) : canEditDeliberations ? (
                      isInterviewRoundType(activeRound?.type) ? (
                        <>Interview deliberation — only candidates <strong style={{ color: t.text }}>advanced</strong> from the previous round appear here. Pick <strong style={{ color: t.text }}>Advance</strong>, <strong style={{ color: t.text }}>Hold</strong>, or <strong style={{ color: t.text }}>Reject</strong>; press <strong style={{ color: t.text }}>G</strong> / <strong style={{ color: t.text }}>Y</strong> / <strong style={{ color: t.text }}>R</strong> on a focused row.</>
                      ) : (
                        <>Live committee — pick <strong style={{ color: t.text }}>Advance</strong>, <strong style={{ color: t.text }}>Hold</strong>, or <strong style={{ color: t.text }}>Reject</strong>. Click a row to focus it; press <strong style={{ color: t.text }}>G</strong> / <strong style={{ color: t.text }}>Y</strong> / <strong style={{ color: t.text }}>R</strong> to decide (again to clear).</>
                      )
                    ) : (
                      <>Live deliberation for <strong style={{ color: t.text }}>{activeRound?.name || "this round"}</strong> — view only. Updates refresh automatically every few seconds.</>
                    )}
                    {" "}
                    {!viewingHistorical && canEditDeliberations ? (
                      <>
                        Decisions save to <strong style={{ color: t.text }}>{activeRound?.name || "this round"}</strong>
                        {" "}as you click and persist when you exit.
                      </>
                    ) : null}
                    {!viewingHistorical && !canEditDeliberations && canDeliberate ? (
                      <span style={{ display: "block", marginTop: 8, fontSize: 13, color: t.textMuted }}>
                        Only admins can record or change committee decisions.
                      </span>
                    ) : null}
                  </>
                ) : (
                  <>Round 1 resume reviews — search by name, email, or phone, or use <strong style={{ fontWeight: 600, color: t.text }}>Sort &amp; filters</strong> to change order and narrow the table.</>
                )}
                {hasActiveNarrowing && (
                  <span style={{ display: "block", marginTop: 8, fontSize: 13, color: t.titleAccent, fontWeight: 600 }}>
                    Showing {filteredCandidates.length} of {candidates.length} candidates
                    {hasActiveSearch ? " matching search" : ""}
                  </span>
                )}
                {equalizeActive && (
                  <span style={{ display: "block", marginTop: 8, fontSize: 13, color: t.titleAccent, fontWeight: 600 }}>
                    Scores equalized by grader z-scores per rubric category
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div ref={filterWrapRef} style={{ position: "relative", flexShrink: 0, marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
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
            <>
              <button
                type="button"
                disabled={exportBusy}
                onClick={() => handleExport("advance")}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: t.btnGhostBg,
                  color: t.btnGhostText,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: exportBusy ? "not-allowed" : "pointer",
                  opacity: exportBusy ? 0.6 : 1,
                }}
              >
                Export advanced
              </button>
              <button
                type="button"
                disabled={exportBusy}
                onClick={() => handleExport("reject")}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: t.btnGhostBg,
                  color: t.btnGhostText,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: exportBusy ? "not-allowed" : "pointer",
                  opacity: exportBusy ? 0.6 : 1,
                }}
              >
                Export rejected
              </button>
              <button
                type="button"
                onClick={() => setEmailModalOpen(true)}
                title="Edit and send advance notification email"
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: `1px solid ${t.accent}`,
                  background: t.btnGhostBg,
                  color: t.accent,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Advance email
              </button>
              {canDeliberate && activeRound?.id && !viewingHistorical ? (
                <button
                  type="button"
                  disabled={advanceRoundBusy || !canCloseRound}
                  onClick={handleAdvanceRound}
                  title={
                    !canCloseRound
                      ? `Mark all ${undecidedCount || "remaining"} candidates Advance or Reject before closing`
                      : nextRound
                        ? `Close ${activeRound.name} and open ${nextRound.name}`
                        : "Close this round"
                  }
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: `1px solid ${t.accent}`,
                    background: "rgba(29,158,117,0.12)",
                    color: t.accent,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: advanceRoundBusy || !canCloseRound ? "not-allowed" : "pointer",
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
            </>
          ) : null}
          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-haspopup="true"
            onClick={() => setFiltersOpen(open => !open)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              padding: "8px 14px",
              borderRadius: 8,
              background: t.btnGhostBg,
              color: t.btnGhostText,
              border: `1px solid ${filtersOpen ? t.accent : t.border}`,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              boxShadow: filtersOpen ? "0 2px 12px rgba(0,0,0,0.12)" : "none",
              transition: "border-color 0.15s ease, box-shadow 0.15s ease",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: t.accent }} aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M7 12h10M11 18h2" /></svg>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
            </span>
            Sort & filters
            {activeFilterCount > 0 && (
              <span style={{ background: deliberationMode ? "rgba(61,207,154,0.18)" : "rgba(40, 98, 65, 0.1)", color: t.accent, borderRadius: 20, fontSize: 11, fontWeight: 700, padding: "2px 8px" }}>{activeFilterCount}</span>
            )}
          </button>
          </div>

          {filtersOpen && (
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
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  style={filterSelectStyle}
                >
                  {SORT_TABS.map(tab => (
                    <option key={tab.id} value={tab.id}>
                      {tab.label}
                    </option>
                  ))}
                </select>
              </label>

              <p style={{ margin: "0 0 12px", paddingTop: 4, borderTop: `1px solid ${t.border}`, fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: t.textMuted }}>FILTER BY</p>

              <label style={{ display: "block", marginBottom: 10, fontSize: 12, fontWeight: 600 }}>
                Major
                <select
                  value={filters.major}
                  onChange={e => setFilters(f => ({ ...f, major: e.target.value }))}
                  style={filterSelectStyle}
                >
                  <option value="all">All majors</option>
                  {majorOptions.map(m => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "block", marginBottom: 10, fontSize: 12, fontWeight: 600 }}>
                Year
                <select
                  value={filters.year}
                  onChange={e => setFilters(f => ({ ...f, year: e.target.value }))}
                  style={filterSelectStyle}
                >
                  <option value="all">All years</option>
                  {yearOptions.map(y => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "block", marginBottom: 10, fontSize: 12, fontWeight: 600 }}>
                Reviews
                <select
                  value={filters.reviews}
                  onChange={e => setFilters(f => ({ ...f, reviews: e.target.value }))}
                  style={filterSelectStyle}
                >
                  <option value="all">Any count</option>
                  <option value="0">None yet (0)</option>
                  <option value="1">Exactly 1</option>
                  <option value="2+">2 or more</option>
                </select>
              </label>

              <label style={{ display: "block", marginBottom: 12, fontSize: 12, fontWeight: 600 }}>
                Score
                <select
                  value={filters.scoreBand}
                  onChange={e => setFilters(f => ({ ...f, scoreBand: e.target.value }))}
                  style={filterSelectStyle}
                >
                  <option value="all">All scores</option>
                  <option value="top">Top (≥ 80%)</option>
                  <option value="strong">Strong (≥ 70%)</option>
                  <option value="low">Low (&lt; 60%, reviewed)</option>
                  <option value="pending">Pending / no score</option>
                </select>
              </label>

              {deliberationMode ? (
                <label style={{ display: "block", marginBottom: 12, fontSize: 12, fontWeight: 600 }}>
                  Committee decision
                  <select
                    value={filters.decision}
                    onChange={e => setFilters(f => ({ ...f, decision: e.target.value }))}
                    style={filterSelectStyle}
                  >
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
                <button
                  type="button"
                  onClick={() => setFilters({ ...defaultFilters })}
                  style={{ background: "none", border: "none", color: t.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 }}
                >
                  Clear all
                </button>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  style={{ background: t.accent, border: "none", color: deliberationMode ? "#0B1628" : "#FFF", padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  Done
                </button>
              </div>
            </div>
          )}
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

      <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, display: "grid", gridTemplateColumns: `repeat(${statRows.length}, 1fr)`, padding: "18px 20px", boxShadow: deliberationMode ? "none" : "0 1px 2px rgba(0,0,0,0.02)" }}>
        {statRows.map(([label, value], index) => (
          <div key={label} style={{ borderRight: index < statRows.length - 1 ? `1px solid ${t.border}` : "none", padding: index ? "4px 0 4px 16px" : "4px 0" }}>
            <div style={{ fontSize: 24, fontFamily: "'DM Sans', sans-serif", color: t.statValue, lineHeight: 1.1, fontWeight: 700 }}>{value}</div>
            <div style={{ fontSize: 10, color: t.textMuted, fontWeight: 700, letterSpacing: "0.06em", marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "0 0 48px", maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        <div style={{ border: `1px solid ${t.border}`, borderRadius: 10, overflow: "hidden", background: t.cardBg, boxShadow: deliberationMode ? "none" : "0 1px 2px rgba(0,0,0,0.02)" }}>
        <div style={{ display: "grid", gridTemplateColumns: gridColumns, padding: "16px 20px", borderBottom: `2px solid ${t.border}`, color: t.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}>
          {deliberationMode ? <div aria-hidden /> : null}
          <div>#</div>
          <div>CANDIDATE</div>
          <div>SCORE</div>
          {deliberationMode ? <div>COMMITTEE DECISION</div> : null}
          <div style={{ textAlign: "right" }}>ACTIONS</div>
        </div>

        <div>
        {loading && <div style={{ padding: 40, textAlign: "center", color: t.textMuted }}>Loading candidates...</div>}

        {!loading && candidates.length > 0 && filteredCandidates.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: t.textMuted }}>
            {hasActiveSearch ? "No candidates match your search." : "No candidates match these filters."}
          </div>
        )}

        {!loading && candidates.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: t.textMuted }}>No candidates yet.</div>
        )}

        {!loading && filteredCandidates.map((c, index) => {
          const staggerMs = 42;
          const staggerCap = 36;
          const enterMs = 520;
          const delay = Math.min(index, staggerCap) * staggerMs;
          const decisionStatus = getCandidateDecisionStatus(c);
          const decisionStyle = DECISION_STYLE[decisionStatus];
          const isFocused = deliberationMode && focusedCandidateId != null && String(focusedCandidateId) === String(c.id);
          const rowSaving = savingDecisionId === c.id;
          const rowBg = isFocused
            ? t.rowFocus
            : deliberationMode && decisionStyle.row !== "transparent"
              ? decisionStyle.row
              : t.rowBg;

          return (
          <div
            key={`${listMotionKey}-${c.id}`}
            onClick={() => {
              if (!deliberationMode) return;
              setFocusedCandidateId(prev => (String(prev) === String(c.id) ? null : c.id));
            }}
            style={{
              display: "grid",
              gridTemplateColumns: gridColumns,
              padding: deliberationMode ? "14px 16px" : "20px 20px",
              borderBottom: `1px solid ${t.border}`,
              alignItems: "center",
              background: rowBg,
              outline: isFocused ? `2px solid ${t.accent}` : "none",
              outlineOffset: -2,
              animation: `scoreboardRowEnter ${enterMs}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms backwards`,
            }}
          >
            {deliberationMode ? (
              <div style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: decisionStatus === "pending" ? "transparent" : decisionStyle.color, minHeight: 44 }} aria-hidden />
            ) : null}

            <div style={{ color: isFocused ? t.accent : t.textMuted, fontWeight: 700, fontSize: 14 }}>{index + 1}</div>

            <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
              <CandidateAvatar name={c.name} headshot={c.headshot} size={44} background={deliberationMode ? t.accent : css.greenDark} />
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 16, fontWeight: 500, fontFamily: serifFont, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                <span style={{ fontSize: 13, color: t.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {[c.major, c.year, c.gpa ? `GPA ${c.gpa}` : ""].filter(Boolean).join(" · ")}
                </span>
                {deliberationMode && getCommitteeLinkWarning(c) ? (
                  <span style={{ fontSize: 11, color: css.red, fontWeight: 600 }}>
                    {getCommitteeLinkWarning(c)}
                  </span>
                ) : null}
              </div>
            </div>

            <div>
              <div style={{ color: scoreColor(getHeadlineScore(c, { equalized: equalizeActive })), fontSize: 18, fontFamily: serifFont, fontWeight: 600 }}>
                {formatScore(getHeadlineScore(c, { equalized: equalizeActive }))}%
              </div>
              <div style={{ fontSize: 11, color: t.textMuted }}>
                {equalizeActive && getSourceNormalizedScore(c) != null
                  ? `${formatScore(getSourceNormalizedScore(c))}% unadjusted · `
                  : `${formatScore(getAggregateScore(c))} raw pts · `}
                {c.numReviews ?? c.reviews?.length ?? 0} {(c.numReviews ?? c.reviews?.length ?? 0) === 1 ? "review" : "reviews"}
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

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setSelectedCandidate(c)}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: deliberationMode ? "6px 12px" : "8px 16px", borderRadius: 6, background: deliberationMode ? t.accent : css.greenDark, color: deliberationMode ? "#0B1628" : "#FFF", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                Details
              </button>
              <button
                type="button"
                onClick={() => navigate(`/scoreboard/${c.id}/application`)}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: deliberationMode ? "6px 12px" : "8px 16px", borderRadius: 6, background: deliberationMode ? t.btnGhostBg : "#FFF", color: deliberationMode ? t.text : "#333", border: `1px solid ${t.border}`, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                {deliberationMode ? "App" : "Application"}
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
