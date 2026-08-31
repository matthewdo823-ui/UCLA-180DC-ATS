import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthedFetch } from "../../auth/AuthContext";
import { API } from "../../constants/config";
import { readJsonOrThrow, STALE } from "../../lib/queryClient";
import { qk } from "../../lib/queryKeys";
import { coffeeRatingColors, css } from "../../theme/colors";
import Topbar from "../../components/Topbar/Topbar";
import PageLoader from "../../components/PageLoader";
import ErrorBanner from "../../components/ErrorBanner/ErrorBanner";
import { pageTitleStyle, sansFont } from "../../theme/typography";
import { formatDate, formatNumber, getInitials, hasNumericScore, titleCase } from "../../utils/format";
import { formatReviewCount } from "../../utils/reviewCounts";
import { useActiveCycle } from "../../hooks/useActiveCycle";
import { ROUND_TYPES, normalizeRoundType } from "../../constants/rounds";
const cardGreen = "#085041";
const cardMint = "#1D9E75";
const cardPale = "#EAF3DE";
const cardLime = "#C0DD97";

function progressColor(progress) {
  if (progress >= 100) return css.greenDark;
  if (progress >= 75) return "#4CAF50";
  if (progress >= 50) return css.amber;
  return css.textGray;
}

const GRADER_STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "complete", label: "Complete" },
  { id: "progress", label: "In progress" },
  { id: "not_started", label: "Not started" },
];

const SCOREBOARD_MODES = [
  {
    id: "resume",
    reviewType: "resume",
    label: "Resume grading",
    endpoint: "grader-scoreboard",
    eyebrow: "Grader roster",
    heading: "Grader ",
    headingAccent: "scoreboard",
    description: "Round 1 grading progress — search by name or email, or use the status chips to focus on who is done, in progress, or not started yet.",
    columnLabel: "RESUME REVIEWS",
    totalLabel: "TOTAL RESUME REVIEWS",
    gradedLabel: "RESUME REVIEWS",
    recentLabel: "RECENT RESUME REVIEWS",
    noGradesLabel: "No resume reviews submitted yet.",
    badge: "ROUND 1 · GRADER",
    emptyLabel: "No graders yet.",
  },
  {
    id: "frq",
    reviewType: "free response",
    label: "FRQ grading",
    endpoint: "frq-grader-scoreboard",
    eyebrow: "FRQ grader roster",
    heading: "FRQ ",
    headingAccent: "scoreboard",
    description: "FRQ grading progress — search by name or email, or use the status chips to focus on who is done, in progress, or not started yet.",
    columnLabel: "FREE RESPONSE REVIEWS",
    totalLabel: "TOTAL FREE RESPONSE REVIEWS",
    gradedLabel: "FREE RESPONSE REVIEWS",
    recentLabel: "RECENT FREE RESPONSE REVIEWS",
    noGradesLabel: "No free response reviews submitted yet.",
    badge: "FRQ · GRADER",
    emptyLabel: "No FRQ graders yet.",
  },
  {
    id: "coffee",
    reviewType: "coffee chat",
    label: "Coffee Chat grading",
    endpoint: "coffee-chat-grader-scoreboard",
    eyebrow: "Coffee Chat member roster",
    heading: "Coffee Chat ",
    headingAccent: "progress",
    description: "Coffee Chat progress for members assigned to this round. Each member rotates through every table and submits one grade per candidate.",
    columnLabel: "COFFEE CHAT GRADES",
    totalLabel: "TOTAL COFFEE CHAT GRADES",
    gradedLabel: "COFFEE CHAT GRADES",
    recentLabel: "RECENT COFFEE CHAT GRADES",
    noGradesLabel: "No Coffee Chat grades submitted yet.",
    badge: "COFFEE CHAT · MEMBER",
    emptyLabel: "No members have been assigned to this Coffee Chat round yet.",
  },
];

function graderMatchesStatusFilter(grader, filterId) {
  const n = grader.reviewCount ?? 0;
  const expected = Number(grader.expectedReviews) || 0;
  const complete = expected > 0 ? n >= expected : Number(grader.progressScore) >= 100;
  switch (filterId) {
    case "complete":
      return complete;
    case "progress":
      return n > 0 && !complete;
    case "not_started":
      return n === 0;
    default:
      return true;
  }
}

function passesGraderSearchQuery(grader, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;

  const fields = [grader.name, grader.email, grader.role]
    .filter(Boolean)
    .map(value => String(value).toLowerCase());

  return fields.some(value => value.includes(q));
}

function filterGraders(list, statusFilter, searchQuery = "") {
  return list.filter(g => {
    if (!passesGraderSearchQuery(g, searchQuery)) return false;
    return graderMatchesStatusFilter(g, statusFilter);
  });
}

function ProgressTiles({ count, expected }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 2 }}>
      {Array.from({ length: expected }).map((_, index) => (
        <div
          key={index}
          style={{
            width: 9,
            height: 9,
            borderRadius: 2,
            background: index < count ? cardMint : cardLime,
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
          {formatNumber(value)} <span style={{ color: css.textGray, fontWeight: 400 }}>/ {maxPerCategory}</span>
        </span>
      </div>
      <div style={{ height: 5, background: "#EEF1EC", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: cardMint, borderRadius: 3, transition: "width 0.35s ease" }} />
      </div>
    </div>
  );
}

function GraderModal({ grader, onClose, metrics = [], maxPerCategory = 4, badge = "ROUND 1 · GRADER", reviewType = "resume", gradedLabel = "RESUME REVIEWS", recentLabel = "RECENT RESUME REVIEWS", noGradesLabel = "No resume reviews submitted yet.", modeId = "resume" }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!grader) return null;

  return (
    <div
      className="scorecard-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${grader.name} grader summary`}
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
      <div className="scorecard-shell" style={{ width: "min(460px, 100%)", position: "relative", perspective: 900 }}>
        <button
          aria-label="Close grader summary"
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

        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#FFF", textAlign: "center", margin: "0 0 10px", flexShrink: 0 }}>
          GRADER SUMMARY
        </p>

        <div className="scorecard-body" style={{ borderRadius: 16, border: `2px solid ${cardGreen}`, background: "#FFF", boxShadow: "0 24px 70px rgba(0,0,0,0.26)" }}>
          <div style={{ background: cardGreen, padding: "18px 18px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
              <span style={{ background: "#04342C", color: "#9FE1CB", fontSize: 10, fontWeight: 700, padding: "4px 9px", borderRadius: 20, letterSpacing: "0.04em" }}>
                {badge}
              </span>
              <span style={{ background: "rgba(255,255,255,0.1)", color: cardLime, fontSize: 10, fontWeight: 700, padding: "4px 9px", borderRadius: 20, border: `1px solid ${cardMint}`, textTransform: "uppercase" }}>
                {grader.role}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: cardMint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700, color: cardPale, flexShrink: 0, border: "2px solid #5DCAA5" }}>
                {getInitials(grader.name)}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ color: cardPale, fontSize: 18, fontFamily: sansFont, fontWeight: 600, margin: "0 0 3px", lineHeight: 1.15 }}>{grader.name}</p>
                <p style={{ color: "#9FE1CB", fontSize: 12, margin: "0 0 2px" }}>{grader.email}</p>
                <p style={{ color: "#5DCAA5", fontSize: 11, margin: 0 }}>
                  Last login: {formatDate(grader.lastLogin, { fallback: "Not yet" })}
                </p>
              </div>
            </div>
          </div>

          <div style={{ background: cardPale, padding: "11px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #DCE7D2" }}>
            <div>
              <p style={{ fontSize: 10, color: "#3B6D11", margin: "0 0 2px", fontWeight: 700, letterSpacing: "0.05em" }}>{gradedLabel}</p>
              <p style={{ fontSize: 30, fontWeight: 700, color: cardGreen, margin: 0, lineHeight: 1 }}>
                {grader.reviewCount} <span style={{ fontSize: 14, color: "#3B6D11" }}>/ {grader.expectedReviews}</span>
              </p>
              <p style={{ fontSize: 10, color: "#3B6D11", margin: "4px 0 0", fontWeight: 600 }}>{formatReviewCount(grader.reviewCount, reviewType)}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 10, color: "#3B6D11", margin: "0 0 6px", fontWeight: 700, letterSpacing: "0.05em" }}>
                {grader.progressScore}% COMPLETE
              </p>
              <ProgressTiles count={grader.reviewCount} expected={grader.expectedReviews} />
            </div>
          </div>

          {metrics.length ? <div style={{ padding: "14px 18px 4px" }}>
            <p style={{ fontSize: 10, color: css.textGray, letterSpacing: "0.06em", margin: "0 0 10px", fontWeight: 700 }}>AVERAGE SCORES GIVEN</p>
            {metrics.map(metric => (
              <CategoryRow key={metric} metric={metric} maxPerCategory={maxPerCategory} value={grader.categoryScores?.[metric]} />
            ))}
          </div> : null}

          <div style={{ margin: "6px 18px 0", padding: "10px 12px", background: "#F8FAF6", border: "1px solid #E3E8DD", borderRadius: 8 }}>
            <p style={{ fontSize: 10, color: css.textGray, letterSpacing: "0.05em", margin: "0 0 5px", fontWeight: 700 }}>SUMMARY</p>
            <p style={{ fontSize: 12, lineHeight: 1.45, color: css.textDark, margin: 0 }}>
              {modeId === "coffee"
                ? `Starts at Table ${grader.startingGroupNumber || "—"}. Average rating weight: ${formatNumber(grader.averageScore)} points. Latest grading activity: ${formatDate(grader.latestReviewAt, { fallback: "Not yet" })}.`
                : `Average normalized score given: ${formatNumber(grader.averageNormalizedScore ?? grader.averageScore)}%. Latest grading activity: ${formatDate(grader.latestReviewAt, { fallback: "Not yet" })}.`}
            </p>
          </div>

          <div style={{ padding: "12px 18px 18px", borderTop: "1px solid #EAEAEA", marginTop: 12 }}>
            <p style={{ fontSize: 11, color: css.textGray, fontWeight: 700, letterSpacing: "0.05em", margin: "0 0 8px" }}>
              {recentLabel} ({grader.reviews?.length ?? 0})
            </p>
            {(grader.reviews ?? []).slice(0, 5).map(review => (
              <div key={review.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid #EAEAEA" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 12, color: css.textDark, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{review.resumeName}</p>
                  <p style={{ fontSize: 11, color: css.textGray, margin: 0 }}>{formatDate(review.submittedAt, { fallback: "Not yet" })}</p>
                </div>
                <div style={{ fontSize: 12, color: modeId === "coffee" ? (coffeeRatingColors[review.rating] || cardGreen) : cardGreen, fontWeight: 700 }}>{modeId === "coffee" ? review.ratingLabel : `${formatNumber(review.normalizedScore ?? review.score)}%`}</div>
              </div>
            ))}
            {grader.reviews?.length === 0 && (
              <div style={{ fontSize: 12, color: css.textGray, padding: "8px 0" }}>{noGradesLabel}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_SCOREBOARD_DATA = { stats: null, graders: [], metrics: [], maxPerCategory: 4, context: null };

export default function GraderScoreboardPage() {
  const authedFetch = useAuthedFetch();
  const { activeRound, loading: cycleLoading } = useActiveCycle();
  const [mode, setMode] = useState(SCOREBOARD_MODES[0].id);
  const [selectedGrader, setSelectedGrader] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const coffeeChatActive = normalizeRoundType(activeRound?.type) === ROUND_TYPES.COFFEE_CHAT;
  const availableModes = useMemo(
    () => coffeeChatActive ? SCOREBOARD_MODES.filter((item) => item.id === "coffee") : SCOREBOARD_MODES.filter((item) => item.id !== "coffee"),
    [coffeeChatActive]
  );

  useEffect(() => {
    if (cycleLoading) return;
    const nextMode = coffeeChatActive ? "coffee" : mode === "coffee" ? "resume" : mode;
    if (nextMode === mode) return;
    setMode(nextMode);
    setSelectedGrader(null);
    setStatusFilter("all");
    setSearchQuery("");
  }, [coffeeChatActive, cycleLoading, mode]);

  const activeMode = useMemo(
    () => SCOREBOARD_MODES.find(m => m.id === mode) ?? SCOREBOARD_MODES[0],
    [mode]
  );

  // Resume mode reads /grader-scoreboard — the same cache entry the admin
  // dashboard's grader-coverage query fills — so bouncing between the dashboard
  // and this page serves from cache. FRQ mode is a separate endpoint and key.
  const graderQuery = useQuery({
    queryKey: activeMode.id === "frq"
      ? qk.frqGraderScoreboard()
      : activeMode.id === "coffee"
        ? qk.coffeeChatGraderScoreboard()
        : qk.graderScoreboard(),
    queryFn: async () => {
      const res = await authedFetch(`${API}/${activeMode.endpoint}`);
      return readJsonOrThrow(res, `loading ${activeMode.label.toLowerCase()}`, `Check GET /${activeMode.endpoint} in server/src/routes/resumeRoutes.js`);
    },
    enabled: !cycleLoading && (coffeeChatActive ? activeMode.id === "coffee" : activeMode.id !== "coffee"),
    staleTime: STALE.dashboard,
  });

  const data = graderQuery.data ?? DEFAULT_SCOREBOARD_DATA;
  const loading = cycleLoading || graderQuery.isPending;

  function handleModeChange(nextMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setSelectedGrader(null);
    setStatusFilter("all");
    setSearchQuery("");
  }

  const graders = useMemo(() => data.graders ?? [], [data.graders]);
  const metrics = useMemo(() => data.metrics ?? [], [data.metrics]);
  const maxPerCategory = data.maxPerCategory ?? 4;
  const scoreboardLabel = data.context?.cycle && data.context?.round
    ? `${data.context.cycle.name} · ${data.context.round.name}`
    : data.context?.cycle
      ? `${data.context.cycle.name} · ${activeMode.label}`
      : `${activeMode.label} scoreboard`;

  const filteredGraders = useMemo(
    () => filterGraders(graders, statusFilter, searchQuery),
    [graders, statusFilter, searchQuery]
  );

  const hasActiveSearch = searchQuery.trim().length > 0;
  const hasActiveNarrowing = statusFilter !== "all" || hasActiveSearch;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: css.bgLight, color: css.textDark, fontFamily: "'DM Sans', sans-serif", fontSize: 13, overflow: "auto" }}>
      <style>{`
        @keyframes scoreboardRowEnter {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <Topbar phaseLabel={scoreboardLabel} activeLabel="Leaderboard" rightSlot={<></>} />

      <div style={{ flex: 1, padding: "14px 22px 32px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", display: "flex", gap: 8 }}>
        {availableModes.map(m => {
          const active = m.id === mode;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => handleModeChange(m.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                cursor: "pointer",
                padding: "9px 18px",
                borderRadius: 8,
                background: active ? css.greenDark : css.cardWhite,
                color: active ? "#FFF" : css.textDark,
                border: `1px solid ${active ? css.greenDark : css.borderLight}`,
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "'DM Sans', sans-serif",
                boxShadow: active ? "0 2px 12px rgba(40, 98, 65, 0.1)" : "0 1px 2px rgba(0,0,0,0.04)",
                transition: "border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, color 0.15s ease",
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      {graderQuery.error ? (
        <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
          <ErrorBanner error={graderQuery.error} onRetry={() => graderQuery.refetch()} />
        </div>
      ) : null}
      <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
        <div style={{ maxWidth: 640, flex: "1 1 260px", minWidth: 0 }}>
          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: css.greenDark }}>
            {data.context?.cycle?.name || "Current cycle"} · {activeMode.eyebrow}
          </p>
          <div style={{ minWidth: 0 }}>
            <h1 style={pageTitleStyle}>{activeMode.heading}{activeMode.headingAccent}</h1>
            <p style={{ margin: "10px 0 0", fontSize: 14, color: css.textGray, lineHeight: 1.45 }}>
              {activeMode.description}
              {hasActiveNarrowing && (
                <span style={{ display: "block", marginTop: 8, fontSize: 13, color: css.greenDark, fontWeight: 600 }}>
                  Showing {filteredGraders.length} of {graders.length} graders
                  {hasActiveSearch ? " matching search" : ""}
                </span>
              )}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end", flexShrink: 0, marginLeft: "auto", alignItems: "center" }}>
          {GRADER_STATUS_FILTERS.map(({ id, label }) => {
            const active = statusFilter === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setStatusFilter(id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  cursor: "pointer",
                  padding: "10px 16px",
                  borderRadius: 8,
                  background: active ? css.greenDark : css.cardWhite,
                  color: active ? "#FFF" : css.textDark,
                  border: `1px solid ${active ? css.greenDark : css.borderLight}`,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                  boxShadow: active ? "0 2px 12px rgba(40, 98, 65, 0.1)" : "0 1px 2px rgba(0,0,0,0.04)",
                  transition: "border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, color 0.15s ease",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", position: "relative" }}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke={css.textGray}
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
          placeholder="Search by name or email…"
          aria-label="Search graders"
          style={{
            width: "100%",
            padding: "11px 40px 11px 40px",
            borderRadius: 10,
            border: `1px solid ${hasActiveSearch ? css.greenDark : css.borderLight}`,
            background: css.cardWhite,
            color: css.textDark,
            fontSize: 14,
            fontFamily: "'DM Sans', sans-serif",
            boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
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
              color: css.textGray,
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

      <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", padding: "18px 20px", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
        {[
          ["GRADERS", data.stats?.graders ?? "—"],
          ["ACTIVE", data.stats?.activeGraders ?? "—"],
          [activeMode.totalLabel, data.stats?.totalReviews ?? "—"],
          ["GOAL", data.stats?.expectedReviews ?? "—"],
        ].map(([label, value], index) => (
          <div key={label} style={{ borderRight: index < 3 ? `1px solid ${css.borderLight}` : "none", padding: index ? "4px 0 4px 24px" : "4px 0" }}>
            <div style={{ fontSize: 24, fontFamily: "'DM Sans', sans-serif", color: css.textDark, lineHeight: 1.1, fontWeight: 700 }}>{value}</div>
            <div style={{ fontSize: 10, color: css.textGray, fontWeight: 700, letterSpacing: "0.06em", marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "0 0 48px", maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        <div style={{ border: `1px solid ${css.borderLight}`, borderRadius: 10, overflow: "hidden", background: css.cardWhite, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "60px minmax(240px, 2fr) 1fr 140px", padding: "16px 20px", borderBottom: `2px solid ${css.borderLight}`, color: css.textGray, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}>
          <div>#</div>
          <div>GRADER</div>
          <div>{activeMode.columnLabel}</div>
          <div style={{ textAlign: "right" }}>ACTIONS</div>
        </div>

        {loading && <PageLoader />}

        {!loading && graders.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: css.textGray }}>{activeMode.emptyLabel}</div>
        )}

        {!loading && graders.length > 0 && filteredGraders.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: css.textGray }}>
            {hasActiveSearch ? "No graders match your search." : "No graders match this filter."}
          </div>
        )}

        {!loading && filteredGraders.map((grader, index) => {
          const staggerMs = 42;
          const staggerCap = 36;
          const enterMs = 520;
          const delay = Math.min(index, staggerCap) * staggerMs;
          return (
          <div
            key={`${statusFilter}-${searchQuery}-${grader.id}`}
            style={{
              display: "grid",
              gridTemplateColumns: "60px minmax(240px, 2fr) 1fr 140px",
              padding: "20px 20px",
              borderBottom: `1px solid ${css.borderLight}`,
              alignItems: "center",
              background: css.cardWhite,
              animation: `scoreboardRowEnter ${enterMs}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms backwards`,
            }}
          >
            <div style={{ color: css.greenDark, fontWeight: 700, fontSize: 14 }}>{grader.rank}</div>

            <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
              <div style={{ width: 44, height: 44, background: css.greenDark, color: "#FFF", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 500, fontSize: 15, letterSpacing: "0.02em", flexShrink: 0 }}>
                {getInitials(grader.name)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 16, fontWeight: 500, fontFamily: sansFont, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{grader.name}</span>
                <span style={{ fontSize: 13, color: "#888", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textTransform: "capitalize" }}>
                  {[grader.role, grader.email].filter(Boolean).join(" · ")}
                </span>
              </div>
            </div>

            <div>
              <div style={{ color: progressColor(grader.progressScore), fontSize: 18, fontFamily: sansFont, fontWeight: 600 }}>
                {grader.reviewCount} / {grader.expectedReviews}
              </div>
              <div style={{ fontSize: 11, color: css.textGray }}>
                {formatReviewCount(grader.reviewCount, activeMode.reviewType)} · {grader.progressScore}% complete{activeMode.id === "coffee" ? ` · starts at Table ${grader.startingGroupNumber || "—"}` : ` · avg ${formatNumber(grader.averageNormalizedScore ?? grader.averageScore)}%`}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setSelectedGrader(grader)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 4, background: css.greenDark, color: "#FFF", border: "none", fontSize: 13, cursor: "pointer" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                Summary
              </button>
            </div>
          </div>
          );
        })}
        </div>
      </div>
      </div>

      {selectedGrader && (
        <GraderModal
          grader={selectedGrader}
          metrics={metrics}
          maxPerCategory={maxPerCategory}
          badge={activeMode.badge}
          reviewType={activeMode.reviewType}
          gradedLabel={activeMode.gradedLabel}
          recentLabel={activeMode.recentLabel}
          noGradesLabel={activeMode.noGradesLabel}
          modeId={activeMode.id}
          onClose={() => setSelectedGrader(null)}
        />
      )}
    </div>
  );
}
