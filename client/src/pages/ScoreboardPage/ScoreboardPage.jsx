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
import {
  canRecordCommitteeDecision,
  DECISION_STYLE,
  downloadDecisionsExport,
  getCandidateDecisionStatus,
  getCommitteeLinkWarning,
  passesDecisionFilter,
  scoreboardSupportsDeliberation,
} from "./decisionUtils";
const cardGreen = "#085041";
const cardMint = "#1D9E75";
const cardPale = "#EAF3DE";
const cardLime = "#C0DD97";

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

function filterCandidates(list, filters) {
  return list.filter(c => {
    if (filters.major !== "all" && (c.major || "Undeclared") !== filters.major) return false;
    if (filters.year !== "all" && String(c.year || "").trim() !== filters.year) return false;
    if (!passesReviewFilter(c, filters.reviews)) return false;
    if (!passesScoreBand(c, filters.scoreBand)) return false;
    if (!passesDecisionFilter(c, filters.decision)) return false;
    return true;
  });
}

function recomputeDecisionStats(candidates) {
  const stats = { pending: 0, advance: 0, hold: 0, reject: 0 };
  (candidates || []).forEach(c => {
    const status = getCandidateDecisionStatus(c);
    if (stats[status] !== undefined) stats[status] += 1;
  });
  return stats;
}

function DecisionButtons({ status, compact, disabled, saving, onSelect }) {
  const options = ["advance", "hold", "reject"];
  return (
    <div style={{ display: "flex", gap: compact ? 4 : 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {options.map(decision => {
        const sel = status === decision;
        const style = DECISION_STYLE[decision];
        return (
          <button
            key={decision}
            type="button"
            title={DECISION_STYLE[decision].label}
            disabled={disabled || saving}
            onClick={() => onSelect(decision)}
            style={{
              border: `1px solid ${sel ? style.bd : css.borderLight}`,
              background: sel ? style.bg : "#FFF",
              color: sel ? style.color : css.textGray,
              borderRadius: compact ? 6 : 8,
              padding: compact ? "5px 8px" : "7px 11px",
              fontSize: compact ? 11 : 12,
              fontWeight: 700,
              cursor: disabled || saving ? "not-allowed" : "pointer",
              opacity: disabled ? 0.45 : saving ? 0.65 : 1,
              textTransform: "capitalize",
              minWidth: compact ? 0 : 62,
            }}
          >
            {compact ? decision[0].toUpperCase() : style.label}
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

function CategoryRow({ metric, value, maxPerCategory = 4 }) {
  const pct = hasNumericScore(value) ? Math.max(0, Math.min(100, (Number(value) / maxPerCategory) * 100)) : 0;

  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: css.textDark }}>{titleCase(metric)}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: cardGreen }}>
          {formatScore(value)} <span style={{ color: css.textGray, fontWeight: 400 }}>/ {maxPerCategory}</span>
        </span>
      </div>
      <div style={{ height: 5, background: "#EEF1EC", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: cardMint, borderRadius: 3, transition: "width 0.35s ease" }} />
      </div>
    </div>
  );
}

function ScorecardModal({ candidate, onClose, metrics = [], maxPerCategory = 4 }) {
  const [reviewersOpen, setReviewersOpen] = useState(false);
  const aggregateScore = getAggregateScore(candidate);
  const normalizedScore = getNormalizedScore(candidate);
  const reviews = candidate?.reviews ?? [];
  const latestNote = [...reviews].reverse().find(review => review.notes)?.notes;

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
      className="scorecard-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${candidate.name} Round 1 scorecard`}
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
          ROUND 1 · RESUME SCREEN
        </p>

        <div style={{ borderRadius: 16, border: `2px solid ${cardGreen}`, overflow: "hidden", background: "#FFF", boxShadow: "0 24px 70px rgba(0,0,0,0.26)" }}>
          <div style={{ background: cardGreen, padding: "18px 18px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
              <span style={{ background: "#04342C", color: "#9FE1CB", fontSize: 10, fontWeight: 700, padding: "4px 9px", borderRadius: 20, letterSpacing: "0.04em" }}>
                ROUND 1 · RESUME SCREEN
              </span>
              <span style={{ background: "rgba(255,255,255,0.1)", color: cardLime, fontSize: 10, fontWeight: 700, padding: "4px 9px", borderRadius: 20, border: `1px solid ${cardMint}` }}>
                ACTIVE
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
                  {[candidate.year, candidate.gpa ? `GPA ${candidate.gpa}` : ""].filter(Boolean).join(" · ") || candidate.email || "Candidate profile"}
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
              <p style={{ fontSize: 10, color: "#3B6D11", margin: "0 0 2px", fontWeight: 800, letterSpacing: "0.05em" }}>NORMALIZED SCORE</p>
              <p style={{ fontSize: 30, fontWeight: 700, color: cardGreen, margin: 0, lineHeight: 1 }}>
                {formatScore(normalizedScore)}<span style={{ fontSize: 14, color: "#3B6D11" }}>%</span>
              </p>
              {aggregateScore != null ? (
                <p style={{ fontSize: 11, color: "#3B6D11", margin: "4px 0 0" }}>
                  Raw avg: {formatScore(aggregateScore)} pts
                </p>
              ) : null}
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 10, color: "#3B6D11", margin: "0 0 6px", fontWeight: 800, letterSpacing: "0.05em" }}>{metrics.length} CATEGORIES</p>
              <ScoreTiles score={normalizedScore} maxScore={100} />
            </div>
          </div>

          <div style={{ padding: "14px 18px 4px" }}>
            <p style={{ fontSize: 10, color: css.textGray, letterSpacing: "0.06em", margin: "0 0 10px", fontWeight: 800 }}>CATEGORY BREAKDOWN</p>
            {metrics.map(metric => (
              <CategoryRow key={metric} metric={metric} maxPerCategory={maxPerCategory} value={normalizeMetricScore(candidate, metric)} />
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
                REVIEWS ({reviews.length})
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ReviewerStack reviews={reviews} />
                <span style={{ color: css.textGray, transform: reviewersOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>⌄</span>
              </div>
            </button>

            {reviewersOpen && (
              <div style={{ marginTop: 10 }}>
                {reviews.map((review, index) => (
                  <div key={review.id ?? index} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid #EAEAEA" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#E8F1FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#24529A", flexShrink: 0 }}>
                      {getReviewerInitials(review, index)}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 12, color: css.textDark, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{getReviewerLabel(review, index)}</p>
                      <p style={{ fontSize: 11, color: css.textGray, margin: 0 }}>
                        {review.submittedAt ? new Date(review.submittedAt).toLocaleDateString() : "Submitted"}
                      </p>
                    </div>
                    <div style={{ fontSize: 12, color: cardGreen, fontWeight: 800 }}>{formatScore(getReviewTotal(review))}/24</div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
  const { user } = useAuth();
  const authedFetch = useAuthedFetch();
  const isAdmin = isAdminRole(user?.role);
  const [data, setData] = useState({ stats: null, candidates: [], metrics: [], maxPerCategory: 4, context: null });
  const [loading, setLoading] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(() => ({ ...defaultFilters }));
  const [sortBy, setSortBy] = useState("performance_desc");
  const [listMotionKey, setListMotionKey] = useState(0);
  const [deliberationMode, setDeliberationMode] = useState(false);
  const [savingDecisionId, setSavingDecisionId] = useState(null);
  const [decisionError, setDecisionError] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [focusedCandidateId, setFocusedCandidateId] = useState(null);
  const filterWrapRef = useRef(null);
  /** After first data paint, bump key so sort/filter changes remount rows and replay stagger. */
  const listStaggerBootstrappedRef = useRef(false);

  const fetchScoreboard = useCallback(async (opts = {}) => {
    const silent = opts.silent === true;
    if (!silent) setLoading(true);
    try {
      const res = await authedFetch(`${API}/scoreboard`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to load scoreboard:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    if (loading) return;
    if (!listStaggerBootstrappedRef.current) {
      listStaggerBootstrappedRef.current = true;
      return;
    }
    setListMotionKey(k => k + 1);
  }, [loading, sortBy, filters.major, filters.year, filters.reviews, filters.scoreBand, filters.decision]);

  useEffect(() => {
    fetchScoreboard();
  }, [fetchScoreboard]);

  useEffect(() => {
    if (!deliberationMode) return undefined;
    const interval = setInterval(() => fetchScoreboard({ silent: true }), 5000);
    return () => clearInterval(interval);
  }, [deliberationMode, fetchScoreboard]);

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

  const candidates = useMemo(() => data.candidates ?? [], [data.candidates]);
  const metrics = useMemo(() => data.metrics ?? [], [data.metrics]);
  const maxPerCategory = data.maxPerCategory ?? 4;
  const scoreboardLabel = data.context?.cycle && data.context?.round
    ? `${data.context.cycle.name} · ${data.context.round.name}`
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
    const filtered = filterCandidates(candidates, filters);
    return [...filtered].sort((a, b) => compareCandidates(a, b, sortBy));
  }, [candidates, filters, sortBy]);

  const saveDecision = useCallback(async (candidate, decision) => {
    if (!isAdmin) return;
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
        throw new Error(body.error || "Could not save decision");
      }
      const { decision: savedDecision } = await res.json();
      setData(prev => {
        const nextCandidates = (prev.candidates || []).map(c =>
          c.id === candidate.id ? { ...c, decision: savedDecision } : c
        );
        const decisionStats = recomputeDecisionStats(nextCandidates);
        return {
          ...prev,
          candidates: nextCandidates,
          stats: {
            ...prev.stats,
            advanced: decisionStats.advance,
            hold: decisionStats.hold,
            rejected: decisionStats.reject,
            pending: decisionStats.pending,
          },
        };
      });
      setSelectedCandidate(prev => (prev?.id === candidate.id ? { ...prev, decision: savedDecision } : prev));
    } catch (err) {
      setDecisionError(err.message || "Could not save decision");
    } finally {
      setSavingDecisionId(null);
    }
  }, [authedFetch, isAdmin]);

  const handleExport = useCallback(async (decision) => {
    setExportBusy(true);
    setDecisionError("");
    try {
      await downloadDecisionsExport(authedFetch, API, decision);
    } catch (err) {
      setDecisionError(err.message || "Export failed");
    } finally {
      setExportBusy(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    if (!deliberationMode || !isAdmin) return undefined;
    function onKeyDown(event) {
      const tag = event.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      const list = filteredCandidates;
      if (!list.length) return;

      let index = list.findIndex(c => c.id === focusedCandidateId);
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
      if (key === "g") {
        event.preventDefault();
        saveDecision(focused, "advance");
      } else if (key === "y") {
        event.preventDefault();
        saveDecision(focused, "hold");
      } else if (key === "r") {
        event.preventDefault();
        saveDecision(focused, "reject");
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [deliberationMode, filteredCandidates, focusedCandidateId, isAdmin, saveDecision]);

  useEffect(() => {
    if (!filteredCandidates.length) {
      setFocusedCandidateId(null);
      return;
    }
    if (!focusedCandidateId || !filteredCandidates.some(c => c.id === focusedCandidateId)) {
      setFocusedCandidateId(filteredCandidates[0].id);
    }
  }, [filteredCandidates, focusedCandidateId]);

  const activeFilterCount = countActiveFilters(filters);
  const deliberationApiReady = useMemo(
    () => scoreboardSupportsDeliberation(candidates),
    [candidates]
  );
  const gridColumns = deliberationMode
    ? "4px 52px minmax(180px, 2fr) 88px 1fr minmax(220px, 260px) 200px"
    : "4px 52px minmax(200px, 2fr) 1fr minmax(180px, 220px) 200px";

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: css.bgLight, color: css.textDark, fontFamily: "'DM Sans', sans-serif", fontSize: 13, overflow: "auto" }}>
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
          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: css.greenDark }}>
            Spring 2025 · Live roster
          </p>
          <div style={{ display: "flex", alignItems: "stretch", gap: 14 }}>
            <div style={{ width: 4, borderRadius: 4, background: `linear-gradient(180deg, ${css.greenDark} 0%, ${cardMint} 100%)`, flexShrink: 0 }} aria-hidden />
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, lineHeight: 1.08, letterSpacing: "-0.03em" }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 28, fontWeight: 500, color: css.textDark }}>Candidate </span>
                <span style={{ fontFamily: serifFont, fontSize: 32, fontWeight: 600, color: css.greenDark }}>scoreboard</span>
              </h1>
              <p style={{ margin: "10px 0 0", fontSize: 14, color: css.textGray, lineHeight: 1.45 }}>
                Round 1 resume reviews — sort and filter the roster, then use{" "}
                <strong style={{ fontWeight: 600, color: css.textDark }}>Deliberation</strong> during live committee meetings to mark advance, hold, or reject.
                {activeFilterCount > 0 && (
                  <span style={{ display: "block", marginTop: 8, fontSize: 13, color: css.greenDark, fontWeight: 600 }}>
                    Showing {filteredCandidates.length} of {candidates.length} candidates
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div ref={filterWrapRef} style={{ position: "relative", flexShrink: 0, marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {isAdmin ? (
            <>
              <button
                type="button"
                onClick={() => setDeliberationMode(mode => !mode)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  padding: "10px 16px",
                  borderRadius: 8,
                  background: deliberationMode ? css.greenDark : css.cardWhite,
                  color: deliberationMode ? "#FFF" : css.textDark,
                  border: `1px solid ${deliberationMode ? css.greenDark : css.borderLight}`,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {deliberationMode ? "Deliberation on" : "Deliberation"}
              </button>
              <button
                type="button"
                disabled={exportBusy}
                onClick={() => handleExport("advance")}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: `1px solid ${css.borderLight}`,
                  background: css.cardWhite,
                  fontSize: 13,
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
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: `1px solid ${css.borderLight}`,
                  background: css.cardWhite,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: exportBusy ? "not-allowed" : "pointer",
                  opacity: exportBusy ? 0.6 : 1,
                }}
              >
                Export rejected
              </button>
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
              padding: "10px 16px",
              borderRadius: 8,
              background: css.cardWhite,
              color: css.textDark,
              border: `1px solid ${filtersOpen ? css.greenDark : css.borderLight}`,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              boxShadow: filtersOpen ? "0 2px 12px rgba(40, 98, 65, 0.1)" : "0 1px 2px rgba(0,0,0,0.04)",
              transition: "border-color 0.15s ease, box-shadow 0.15s ease",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: css.greenDark }} aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M7 12h10M11 18h2" /></svg>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
            </span>
            Sort & filters
            {activeFilterCount > 0 && (
              <span style={{ background: "rgba(40, 98, 65, 0.1)", color: css.greenDark, borderRadius: 20, fontSize: 11, fontWeight: 700, padding: "2px 8px" }}>{activeFilterCount}</span>
            )}
          </button>

          {filtersOpen && (
            <div
              role="dialog"
              aria-label="Sort and filter scoreboard"
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 8px)",
                width: "min(300px, calc(100vw - 44px))",
                background: css.cardWhite,
                borderRadius: 10,
                boxShadow: "0 16px 48px rgba(0,0,0,0.12)",
                border: `1px solid ${css.borderLight}`,
                padding: "16px 16px 12px",
                zIndex: 50,
                color: css.textDark,
                animation: "scoreboardPanelIn 0.22s ease-out",
              }}
            >
              <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: css.textGray }}>SORT BY</p>
              <label style={{ display: "block", marginBottom: 14, fontSize: 12, fontWeight: 600 }}>
                Order
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  style={{ ...selectStyle, marginTop: 4 }}
                >
                  {SORT_TABS.map(tab => (
                    <option key={tab.id} value={tab.id}>
                      {tab.label}
                    </option>
                  ))}
                </select>
              </label>

              <p style={{ margin: "0 0 12px", paddingTop: 4, borderTop: `1px solid ${css.borderLight}`, fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: css.textGray }}>FILTER BY</p>

              <label style={{ display: "block", marginBottom: 10, fontSize: 12, fontWeight: 600 }}>
                Major
                <select
                  value={filters.major}
                  onChange={e => setFilters(f => ({ ...f, major: e.target.value }))}
                  style={{ ...selectStyle, marginTop: 4 }}
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
                  style={{ ...selectStyle, marginTop: 4 }}
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
                  style={{ ...selectStyle, marginTop: 4 }}
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
                  style={{ ...selectStyle, marginTop: 4 }}
                >
                  <option value="all">All scores</option>
                  <option value="top">Top (≥ 80%)</option>
                  <option value="strong">Strong (≥ 70%)</option>
                  <option value="low">Low (&lt; 60%, reviewed)</option>
                  <option value="pending">Pending / no score</option>
                </select>
              </label>

              <label style={{ display: "block", marginBottom: 12, fontSize: 12, fontWeight: 600 }}>
                Committee decision
                <select
                  value={filters.decision}
                  onChange={e => setFilters(f => ({ ...f, decision: e.target.value }))}
                  style={{ ...selectStyle, marginTop: 4 }}
                >
                  <option value="all">All decisions</option>
                  <option value="undecided">Undecided (pending + hold)</option>
                  <option value="pending">Pending only</option>
                  <option value="advance">Advanced</option>
                  <option value="hold">Hold</option>
                  <option value="reject">Rejected</option>
                </select>
              </label>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${css.borderLight}`, paddingTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setFilters({ ...defaultFilters })}
                  style={{ background: "none", border: "none", color: css.greenDark, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 }}
                >
                  Clear all
                </button>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  style={{ background: css.greenDark, border: "none", color: "#FFF", padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {isAdmin && !loading && candidates.length > 0 && !deliberationApiReady ? (
        <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", padding: "0 0 8px", color: "#9B5C00", fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>
          Committee decisions need the updated API. Local dev: use <code style={{ fontSize: 12 }}>VITE_API_URL=http://localhost:3000</code> in <code style={{ fontSize: 12 }}>client/.env</code> and restart Vite. Production: redeploy the server on Render.
        </div>
      ) : null}

      {decisionError ? (
        <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", padding: "0 0 8px", color: css.red, fontSize: 13, fontWeight: 600 }}>
          {decisionError}
        </div>
      ) : null}

      {deliberationMode && isAdmin ? (
        <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", padding: "0 0 10px", fontSize: 12, color: css.textGray }}>
          Live mode: use <strong style={{ color: css.textDark }}>G</strong> advance, <strong style={{ color: css.textDark }}>Y</strong> hold, <strong style={{ color: css.textDark }}>R</strong> reject · arrow keys to move · auto-refreshes every 5s
        </div>
      ) : null}

      <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 10, display: "grid", gridTemplateColumns: "repeat(6, 1fr)", padding: "18px 20px", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
        {[
          ["APPLICANTS", data.stats?.applicants ?? "—"],
          ["REVIEWED", data.stats?.reviewed ?? "—"],
          ["ADVANCED", data.stats?.advanced ?? "—"],
          ["HOLD", data.stats?.hold ?? "—"],
          ["REJECTED", data.stats?.rejected ?? "—"],
          ["AVG SCORE", data.stats?.avgScore ?? "—"],
        ].map(([label, value], index) => (
          <div key={label} style={{ borderRight: index < 5 ? `1px solid ${css.borderLight}` : "none", padding: index ? "4px 0 4px 16px" : "4px 0" }}>
            <div style={{ fontSize: 24, fontFamily: "'DM Sans', sans-serif", color: css.textDark, lineHeight: 1.1, fontWeight: 700 }}>{value}</div>
            <div style={{ fontSize: 10, color: css.textGray, fontWeight: 700, letterSpacing: "0.06em", marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "0 0 48px", maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        <div style={{ border: `1px solid ${css.borderLight}`, borderRadius: 10, overflow: "hidden", background: css.cardWhite, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
        <div style={{ display: "grid", gridTemplateColumns: gridColumns, padding: "16px 20px", borderBottom: `2px solid ${css.borderLight}`, color: css.textGray, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}>
          <div aria-hidden />
          <div>#</div>
          <div>CANDIDATE</div>
          <div>DECISION</div>
          <div>SCORE</div>
          <div>COMMITTEE</div>
          <div style={{ textAlign: "right" }}>ACTIONS</div>
        </div>

        <div>
        {loading && <div style={{ padding: 40, textAlign: "center", color: css.textGray }}>Loading candidates...</div>}

        {!loading && candidates.length > 0 && filteredCandidates.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: css.textGray }}>No candidates match these filters.</div>
        )}

        {!loading && candidates.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: css.textGray }}>No candidates yet.</div>
        )}

        {!loading && filteredCandidates.map((c, index) => {
          const staggerMs = 42;
          const staggerCap = 36;
          const enterMs = 520;
          const delay = Math.min(index, staggerCap) * staggerMs;
          const decisionStatus = getCandidateDecisionStatus(c);
          const decisionStyle = DECISION_STYLE[decisionStatus];
          const isFocused = deliberationMode && focusedCandidateId === c.id;
          const rowSaving = savingDecisionId === c.id;
          return (
          <div
            key={`${listMotionKey}-${c.id}`}
            onClick={() => deliberationMode && setFocusedCandidateId(c.id)}
            style={{
              display: "grid",
              gridTemplateColumns: gridColumns,
              padding: deliberationMode ? "18px 20px" : "20px 20px",
              borderBottom: `1px solid ${css.borderLight}`,
              alignItems: "center",
              background: isFocused ? "rgba(40, 98, 65, 0.05)" : decisionStyle.row !== "transparent" ? decisionStyle.row : css.cardWhite,
              outline: isFocused ? `2px solid ${css.greenDark}` : "none",
              outlineOffset: -2,
              animation: `scoreboardRowEnter ${enterMs}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms backwards`,
            }}
          >
            <div style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: decisionStatus === "pending" ? "transparent" : decisionStyle.color, minHeight: 44 }} aria-hidden />

            <div style={{ color: css.greenDark, fontWeight: 700, fontSize: 14 }}>{index + 1}</div>

            <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
              <CandidateAvatar name={c.name} headshot={c.headshot} size={deliberationMode ? 48 : 44} background={css.greenDark} />
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: deliberationMode ? 17 : 16, fontWeight: 500, fontFamily: serifFont, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                <span style={{ fontSize: 13, color: "#888", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {[c.major, c.year, c.gpa ? `GPA ${c.gpa}` : ""].filter(Boolean).join(" · ")}
                </span>
                {getCommitteeLinkWarning(c) ? (
                  <span style={{ fontSize: 11, color: css.red, fontWeight: 600 }}>
                    {getCommitteeLinkWarning(c)}
                  </span>
                ) : null}
              </div>
            </div>

            <div>
              <span style={{ background: decisionStyle.bg, color: decisionStyle.color, border: `1px solid ${decisionStyle.bd}`, borderRadius: 999, fontSize: 10, fontWeight: 800, padding: "4px 9px", letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                {decisionStyle.label}
              </span>
            </div>

            <div>
              <div style={{ color: scoreColor(c.score), fontSize: deliberationMode ? 20 : 18, fontFamily: serifFont, fontWeight: 600 }}>{formatScore(c.score)}%</div>
              <div style={{ fontSize: 11, color: css.textGray }}>
                {formatScore(getAggregateScore(c))} raw pts · {c.numReviews ?? c.reviews?.length ?? 0} {(c.numReviews ?? c.reviews?.length ?? 0) === 1 ? "review" : "reviews"}
              </div>
            </div>

            <div>
              {isAdmin ? (
                <DecisionButtons
                  status={decisionStatus}
                  compact={!deliberationMode}
                  disabled={!canRecordCommitteeDecision(c)}
                  saving={rowSaving}
                  onSelect={decision => saveDecision(c, decision)}
                />
              ) : (
                <span style={{ fontSize: 12, color: css.textGray }}>Admin only</span>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setSelectedCandidate(c)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 4, background: css.greenDark, color: "#FFF", border: "none", fontSize: 13, cursor: "pointer" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                Details
              </button>
              <button
                type="button"
                onClick={() => navigate(`/scoreboard/${c.id}/application`)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 4, background: "#FFF", color: "#333", border: `1px solid ${css.borderLight}`, fontSize: 13, cursor: "pointer" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                Application
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
          candidate={selectedCandidate}
          metrics={metrics}
          maxPerCategory={maxPerCategory}
          onClose={() => setSelectedCandidate(null)}
        />
      )}
    </div>
  );
}
