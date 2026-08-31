import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthedFetch } from "../../auth/AuthContext";
import { useLocation, useNavigate } from "react-router-dom";
import { readJsonOrThrow, STALE } from "../../lib/queryClient";
import { qk } from "../../lib/queryKeys";
import { useActiveCycle } from "../../hooks/useActiveCycle";
import { API } from "../../constants/config";
import { coffeeRatingColors, css } from "../../theme/colors";
import Topbar from "../../components/Topbar/Topbar";
import PageLoader from "../../components/PageLoader";
import ErrorBanner from "../../components/ErrorBanner/ErrorBanner";
import CandidateAvatar from "../../components/CandidateAvatar/CandidateAvatar";
import { formatResponseError } from "../../utils/errors";
import { pageTitleStyle, sansFont } from "../../theme/typography";
import { getInitials } from "../../utils/format";
import { formatReviewCount } from "../../utils/reviewCounts";
import { ROUND_TYPES, normalizeRoundType } from "../../constants/rounds";

const COFFEE_RATINGS = [
  { id: "strong_no", label: "Strong no", color: coffeeRatingColors.strong_no, bg: "rgba(226,75,74,0.10)" },
  { id: "no", label: "No", color: coffeeRatingColors.no, bg: "rgba(239,159,39,0.12)" },
  { id: "yes", label: "Yes", color: coffeeRatingColors.yes, bg: "rgba(83,164,125,0.12)" },
  { id: "strong_yes", label: "Strong yes", color: coffeeRatingColors.strong_yes, bg: "rgba(6,78,59,0.16)" },
];

function getBalancedColumnCount(candidateCount) {
  if (candidateCount <= 1) return 1;
  const targetColumns = Math.min(4, Math.ceil(candidateCount / 2));
  if (candidateCount % 2 === 0) {
    for (let columns = targetColumns; columns >= 2; columns -= 1) {
      if (candidateCount % columns === 0) return columns;
    }
  }
  return targetColumns;
}

function makeCoffeeDraft(candidate) {
  return {
    rating: candidate.evaluation?.rating || "",
    notes: candidate.evaluation?.notes || "",
  };
}

function CoffeeChatCandidateCard({ candidate, draft, busy, onDraftChange, onSave, onOpenProfile, showSave = true, autoSave = false, validationError = false, expectedRatingCount = null }) {
  const rating = draft?.rating || "";
  const notes = draft?.notes || "";
  const persistedRating = candidate.evaluation?.rating || "";
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(false);
  }, [candidate.id, candidate.evaluation?.rating, candidate.evaluation?.notes]);

  async function handleSave() {
    if (!rating && !persistedRating) return;
    setSaving(true);
    setSaved(false);
    try {
      await onSave({ candidate_id: candidate.id, rating, notes });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleRatingChange(nextRating) {
    const nextDraft = { ...draft, rating: nextRating };
    onDraftChange(nextDraft);
    setSaved(false);
    if (!autoSave) return;
    setSaving(true);
    try {
      await onSave({ candidate_id: candidate.id, rating: nextRating, notes: nextDraft.notes || "" });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleNotesBlur() {
    if (!autoSave || !rating || saving) return;
    setSaving(true);
    setSaved(false);
    try {
      await onSave({ candidate_id: candidate.id, rating, notes });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article style={{ background: css.cardWhite, border: `1px solid ${validationError ? css.red : rating ? "rgba(29,158,117,0.28)" : css.borderLight}`, borderRadius: 14, padding: 22, boxShadow: validationError ? "0 0 0 3px rgba(226,75,74,0.08)" : "0 1px 3px rgba(0,0,0,0.035)" }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 18 }}>
        <CandidateAvatar name={candidate.name} headshot={candidate.headshot} size={56} background={css.greenDark} />
        <div style={{ minWidth: 0 }}>
          <button
            type="button"
            onClick={onOpenProfile}
            style={{ border: "none", background: "transparent", padding: 0, margin: 0, fontFamily: sansFont, fontSize: 18, fontWeight: 700, color: css.greenDark, cursor: "pointer", textAlign: "left" }}
          >
            {candidate.name}
          </button>
          <p style={{ margin: "5px 0 0", fontSize: 13, color: css.textGray }}>{[candidate.major, candidate.year].filter(Boolean).join(" · ")}</p>
        </div>
      </div>

      <div role="group" aria-label={`Coffee Chat rating for ${candidate.name}`} style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginBottom: 15 }}>
        {COFFEE_RATINGS.map((option) => {
          const selected = rating === option.id;
          return (
            <button key={option.id} type="button" disabled={busy || saving} aria-pressed={selected} onClick={() => handleRatingChange(selected ? "" : option.id)} style={{ display: "flex", justifyContent: "center", border: `1px solid ${selected ? option.color : css.borderLight}`, borderRadius: 9, padding: "11px 8px", background: selected ? option.bg : css.cardWhite, color: selected ? option.color : css.textGray, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", cursor: busy || saving ? "wait" : "pointer", opacity: busy || saving ? 0.65 : 1 }}>
              {option.label}
            </button>
          );
        })}
      </div>

      <textarea value={notes} onChange={(event) => { onDraftChange({ ...draft, notes: event.target.value.slice(0, 1000) }); setSaved(false); }} onBlur={handleNotesBlur} rows={5} placeholder="Coffee Chat notes…" style={{ width: "100%", boxSizing: "border-box", padding: "12px 13px", borderRadius: 9, border: `1px solid ${validationError ? css.red : css.borderLight}`, resize: "vertical", fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5 }} />
      {validationError ? <p role="alert" style={{ margin: "8px 0 0", color: css.red, fontSize: 11, fontWeight: 700 }}>Choose a rating before submitting this table.</p> : null}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 10 }}>
        <span style={{ fontSize: 11, color: css.textGray }}>{candidate.coffeeChatEvaluationCount || 0}{Number.isFinite(expectedRatingCount) ? ` / ${expectedRatingCount}` : ""} rating{candidate.coffeeChatEvaluationCount === 1 ? "" : "s"} submitted</span>
        {showSave ? <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {saved ? <span style={{ fontSize: 11, color: css.greenDark, fontWeight: 700 }}>Saved</span> : null}
          <button type="button" onClick={handleSave} disabled={busy || saving || (!rating && !persistedRating)} style={{ border: "none", borderRadius: 8, background: css.greenDark, color: "#FFF", padding: "9px 13px", fontSize: 12, fontWeight: 700, cursor: busy || saving || (!rating && !persistedRating) ? "not-allowed" : "pointer", opacity: busy || saving || (!rating && !persistedRating) ? 0.5 : 1 }}>
            {saving ? "Saving…" : !rating && persistedRating ? "Clear rating" : "Save rating"}
          </button>
        </div> : <span style={{ fontSize: 11, color: saved ? css.greenDark : css.textGray, fontWeight: 600 }}>{saving ? "Saving…" : autoSave ? (saved ? "Saved" : "Saves automatically") : "Submits with table"}</span>}
      </div>
    </article>
  );
}

const DECISION_STYLE = {
  pending: { bg: "rgba(107,114,128,0.12)", color: "#6B7280", bd: "rgba(107,114,128,0.28)" },
  pass: { bg: "rgba(29,158,117,0.12)", color: "#1D9E75", bd: "rgba(29,158,117,0.28)" },
  fail: { bg: "rgba(226,75,74,0.10)", color: "#E24B4A", bd: "rgba(226,75,74,0.28)" },
  hold: { bg: "rgba(239,159,39,0.12)", color: "#C47D12", bd: "rgba(239,159,39,0.28)" },
};

function toLocalInputValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CandidateInterviewCard({ candidate, busy, onSave }) {
  const [decision, setDecision] = useState(candidate.evaluation?.decision || "pending");
  const [scheduledAt, setScheduledAt] = useState(toLocalInputValue(candidate.evaluation?.scheduledAt));
  const [notes, setNotes] = useState(candidate.evaluation?.notes || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDecision(candidate.evaluation?.decision || "pending");
    setScheduledAt(toLocalInputValue(candidate.evaluation?.scheduledAt));
    setNotes(candidate.evaluation?.notes || "");
    setSaved(false);
  }, [candidate]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await onSave({
        candidate_id: candidate.id,
        decision,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        notes,
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const style = DECISION_STYLE[decision] || DECISION_STYLE.pending;

  return (
    <div style={{ background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 12, padding: 20, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 14, minWidth: 0 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: css.greenDark, color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 14, flexShrink: 0 }}>
            {getInitials(candidate.name)}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: sansFont, fontSize: 17, margin: "0 0 4px", color: css.textDark }}>{candidate.name}</p>
            <p style={{ margin: 0, fontSize: 13, color: css.textGray }}>
              {[candidate.major, candidate.year, candidate.gpa ? `GPA ${candidate.gpa}` : ""].filter(Boolean).join(" · ") || candidate.email}
            </p>
            {candidate.avgResumeScore != null ? (
              <p style={{ margin: "6px 0 0", fontSize: 12, color: css.greenDark, fontWeight: 600 }}>
                Resume screen avg: {candidate.avgResumeScore}% · {formatReviewCount(candidate.resumeReviewCount, "resume")}
              </p>
            ) : null}
          </div>
        </div>
        <span style={{ background: style.bg, color: style.color, border: `1px solid ${style.bd}`, borderRadius: 999, fontSize: 10, fontWeight: 700, padding: "4px 10px", letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
          {decision}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 700, color: css.textGray, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Scheduled
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${css.borderLight}`, fontSize: 13 }}
          />
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: css.textGray, letterSpacing: "0.04em", textTransform: "uppercase" }}>Decision</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["pass", "fail", "hold", "pending"].map((d) => {
              const sel = decision === d;
              const s = DECISION_STYLE[d];
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDecision(d)}
                  style={{
                    border: `1px solid ${sel ? s.bd : css.borderLight}`,
                    background: sel ? s.bg : "#FFF",
                    color: sel ? s.color : css.textGray,
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 700, color: css.textGray, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 12 }}>
        Interview notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
          rows={3}
          placeholder="Interview impressions, strengths, concerns..."
          style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${css.borderLight}`, fontSize: 13, resize: "vertical", fontFamily: "'DM Sans', sans-serif" }}
        />
      </label>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={busy || saving}
          style={{
            border: "none",
            background: css.greenDark,
            color: "#FFF",
            borderRadius: 8,
            padding: "10px 16px",
            fontSize: 13,
            fontWeight: 700,
            cursor: busy || saving ? "not-allowed" : "pointer",
            opacity: busy || saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving…" : "Save evaluation"}
        </button>
        {saved ? <span style={{ fontSize: 12, color: css.greenDark, fontWeight: 600 }}>Saved</span> : null}
      </div>
    </div>
  );
}

export default function InterviewManagementPage() {
  const authedFetch = useAuthedFetch();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { phaseLabel, activeRound, isInterviewRound, loading: cycleLoading, error: cycleError } = useActiveCycle();
  const [filter, setFilter] = useState("all");
  const [coffeeView, setCoffeeView] = useState("list");
  const [activeGroupNumber, setActiveGroupNumber] = useState(null);
  const [coffeeDrafts, setCoffeeDrafts] = useState({});
  const [tableSubmitting, setTableSubmitting] = useState(false);
  const [tableSubmitError, setTableSubmitError] = useState(null);
  const [tableSubmitNotice, setTableSubmitNotice] = useState("");
  const [startingTableSaving, setStartingTableSaving] = useState(false);
  const [invalidCandidateIds, setInvalidCandidateIds] = useState(() => new Set());

  const enabled = !cycleLoading && isInterviewRound;

  // Shares qk.interviewCandidates() with the admin dashboard, so navigating
  // between the dashboard and this page reads from cache instead of refetching.
  const query = useQuery({
    queryKey: qk.interviewCandidates(),
    queryFn: async () => {
      const res = await authedFetch(`${API}/interviews/candidates`);
      return readJsonOrThrow(res, "loading interview candidates", "Check GET /interviews/candidates in server/src/routes/interviewRoutes.js");
    },
    enabled,
    staleTime: STALE.dashboard,
  });

  const data = query.data ?? { candidates: [], stats: null, context: null };
  const loading = enabled && query.isPending;
  const isCoffeeChat = normalizeRoundType(activeRound?.type) === ROUND_TYPES.COFFEE_CHAT;

  const persistEvaluation = useCallback(async (payload) => {
    const res = await authedFetch(`${API}/interviews/evaluations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw await formatResponseError(res, "saving interview evaluation");
    }
    return res.json().catch(() => ({}));
  }, [authedFetch]);

  const refreshEvaluationData = useCallback(() => Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.interviewCandidates() }),
    queryClient.invalidateQueries({ queryKey: qk.dashboardRoot() }),
    queryClient.invalidateQueries({ queryKey: qk.coffeeChatGraderScoreboard() }),
    queryClient.invalidateQueries({ queryKey: qk.assignments() }),
  ]), [queryClient]);

  const saveEvaluation = useCallback(async (payload) => {
    const result = await persistEvaluation(payload);
    await refreshEvaluationData();
    return result;
  }, [persistEvaluation, refreshEvaluationData]);

  async function chooseStartingTable(groupNumber) {
    if (!groupNumber || startingTableSaving) return;
    setStartingTableSaving(true);
    setTableSubmitError(null);
    try {
      const res = await authedFetch(`${API}/interviews/coffee-chat/starting-table`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupNumber }),
      });
      if (!res.ok) throw await formatResponseError(res, "saving your starting table");
      setCoffeeView("list");
      setActiveGroupNumber(groupNumber);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.interviewCandidates() }),
        queryClient.invalidateQueries({ queryKey: qk.assignments() }),
        queryClient.invalidateQueries({ queryKey: qk.coffeeChatGraderScoreboard() }),
      ]);
      setTableSubmitNotice(`Starting at Table ${groupNumber}. List view will continue rotating from there.`);
    } catch (error) {
      setTableSubmitError(error);
    } finally {
      setStartingTableSaving(false);
    }
  }

  const filtered = useMemo(() => {
    const list = data.candidates || [];
    if (filter === "all") return list;
    return list.filter((c) => (c.evaluation?.decision || "pending") === filter);
  }, [data.candidates, filter]);

  const blocked = !cycleLoading && (!isInterviewRound || cycleError);

  const roundLabel = activeRound?.name || "Interviews";
  const coffeeGroups = useMemo(() => {
    const groups = new Map();
    (data.candidates || []).forEach((candidate) => {
      const number = candidate.groupNumber || 0;
      if (!groups.has(number)) groups.set(number, []);
      groups.get(number).push(candidate);
    });
    return [...groups.entries()].sort(([a], [b]) => a - b);
  }, [data.candidates]);

  useEffect(() => {
    setCoffeeDrafts((current) => {
      const next = {};
      let changed = false;
      (data.candidates || []).forEach((candidate) => {
        if (current[candidate.id]) next[candidate.id] = current[candidate.id];
        else {
          next[candidate.id] = makeCoffeeDraft(candidate);
          changed = true;
        }
      });
      if (Object.keys(current).length !== Object.keys(next).length) changed = true;
      return changed ? next : current;
    });
  }, [data.candidates]);

  useEffect(() => {
    const groupNumbers = coffeeGroups.map(([number]) => number);
    if (!groupNumbers.length) {
      setActiveGroupNumber(null);
      return;
    }
    setActiveGroupNumber((current) => {
      if (groupNumbers.includes(current)) return current;
      const assignedStart = Number(data.context?.startingGroupNumber);
      return groupNumbers.includes(assignedStart) ? assignedStart : groupNumbers[0];
    });
  }, [coffeeGroups, data.context?.startingGroupNumber]);

  const updateCoffeeDraft = useCallback((candidateId, draft) => {
    setCoffeeDrafts((current) => ({ ...current, [candidateId]: draft }));
    setInvalidCandidateIds((current) => {
      if (!current.has(candidateId)) return current;
      const next = new Set(current);
      next.delete(candidateId);
      return next;
    });
    setTableSubmitError(null);
    setTableSubmitNotice("");
  }, []);

  async function submitCoffeeTable(groupNumber, candidates) {
    if (tableSubmitting) return;
    const incomplete = candidates.filter((candidate) => !(coffeeDrafts[candidate.id] || makeCoffeeDraft(candidate)).rating);
    if (incomplete.length) {
      setInvalidCandidateIds(new Set(incomplete.map((candidate) => candidate.id)));
      setTableSubmitError(new Error(`Rate all ${candidates.length} candidates before submitting this table. ${incomplete.length} still need${incomplete.length === 1 ? "s" : ""} a rating.`));
      setTableSubmitNotice("");
      return;
    }

    setTableSubmitting(true);
    setTableSubmitError(null);
    setTableSubmitNotice("");
    try {
      await Promise.all(candidates.map(async (candidate) => {
        try {
          const draft = coffeeDrafts[candidate.id] || makeCoffeeDraft(candidate);
          await persistEvaluation({
            candidate_id: candidate.id,
            rating: draft.rating,
            notes: draft.notes,
          });
        } catch (error) {
          throw new Error(`${candidate.name}: ${error.message || "could not save rating"}`);
        }
      }));
      await refreshEvaluationData();
      const currentIndex = coffeeGroups.findIndex(([number]) => number === groupNumber);
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % coffeeGroups.length : 0;
      const nextGroupNumber = coffeeGroups[nextIndex]?.[0] ?? groupNumber;
      setInvalidCandidateIds(new Set());
      setActiveGroupNumber(nextGroupNumber);
      setTableSubmitNotice(`${groupNumber ? `Table ${groupNumber}` : "Unassigned table"} submitted. Opening ${nextGroupNumber ? `Table ${nextGroupNumber}` : "the next table"}.`);
    } catch (error) {
      setTableSubmitError(error);
    } finally {
      setTableSubmitting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: css.bgLight, color: css.textDark, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
      <style>{`
        @media (max-width: 1180px) {
          .coffee-candidate-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 820px) {
          .coffee-candidate-grid { grid-template-columns: minmax(0, 1fr) !important; }
        }
      `}</style>
      <Topbar phaseLabel={phaseLabel} activeLabel={roundLabel} rightSlot={<></>} />

      <div style={{ maxWidth: 1500, margin: "0 auto", width: "100%", boxSizing: "border-box", padding: "24px 32px 40px" }}>
        {!isCoffeeChat ? <div style={{ marginBottom: 20 }}>
          <h1 style={{ ...pageTitleStyle, margin: "0 0 8px" }}>{roundLabel}</h1>
          <p style={{ margin: 0, color: css.textGray, lineHeight: 1.5 }}>
            Schedule interviews and record pass / fail / hold decisions. Candidates appear here after advancing from the previous round.
          </p>
        </div> : null}

        {blocked ? (
          <div style={{ padding: 40, textAlign: "center", color: css.textGray }}>
            {cycleError || `Interview evaluations are not open. An admin must activate the ${roundLabel} round for this cycle.`}
          </div>
        ) : (
          <>
            {data.stats && !isCoffeeChat ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 10, marginBottom: 20 }}>
                {[
                  ["Total", data.stats.total],
                  ["Pending", data.stats.pending],
                  ["Pass", data.stats.pass],
                  ["Fail", data.stats.fail],
                  ["Hold", data.stats.hold],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: css.textDark }}>{value ?? 0}</div>
                    <div style={{ fontSize: 10, color: css.textGray, fontWeight: 700, letterSpacing: "0.05em", marginTop: 4 }}>{label.toUpperCase()}</div>
                  </div>
                ))}
              </div>
            ) : null}

            {isCoffeeChat && coffeeGroups.length ? (
              <div style={{ background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 12, padding: 14, marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 14, borderRight: `1px solid ${css.borderLight}`, fontSize: 12, fontWeight: 700, color: css.textDark }}>
                  Start at
                  <select
                    value={data.context?.startingGroupNumber || ""}
                    disabled={startingTableSaving || data.context?.memberAssignmentsReady === false}
                    onChange={(event) => chooseStartingTable(Number(event.target.value))}
                    style={{ border: `1px solid ${css.borderLight}`, borderRadius: 8, padding: "8px 10px", background: "#FFF", color: css.textDark, fontSize: 12, fontWeight: 700 }}
                  >
                    <option value="">Choose table</option>
                    {coffeeGroups.filter(([number]) => number).map(([number]) => <option key={number} value={number}>Table {number}</option>)}
                  </select>
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, color: css.textGray, fontWeight: 700, letterSpacing: "0.06em" }}>VIEW</span>
                  {[{ id: "list", label: "List view" }, { id: "scroll", label: "Scroll view" }].map((option) => {
                    const selected = coffeeView === option.id;
                    return (
                      <button key={option.id} type="button" aria-pressed={selected} onClick={() => { setCoffeeView(option.id); setTableSubmitError(null); setTableSubmitNotice(""); setInvalidCandidateIds(new Set()); }} style={{ border: `1px solid ${selected ? css.greenDark : css.borderLight}`, background: selected ? css.greenDark : "#FFF", color: selected ? "#FFF" : css.textDark, borderRadius: 8, padding: "8px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                {coffeeView === "list" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", paddingLeft: 14, borderLeft: `1px solid ${css.borderLight}` }}>
                    {coffeeGroups.map(([number, candidates]) => {
                      const selected = activeGroupNumber === number;
                      const completed = candidates.length > 0 && candidates.every((candidate) => (coffeeDrafts[candidate.id] || makeCoffeeDraft(candidate)).rating);
                      return (
                        <button key={number} type="button" onClick={() => { setActiveGroupNumber(number); setTableSubmitError(null); setTableSubmitNotice(""); setInvalidCandidateIds(new Set()); }} style={{ border: `1px solid ${selected ? css.greenDark : completed ? "rgba(29,158,117,0.34)" : css.borderLight}`, background: selected ? "rgba(29,158,117,0.12)" : "#FFF", color: selected ? css.greenDark : css.textGray, borderRadius: 999, padding: "7px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          {number ? `Table ${number}` : "Unassigned"}{completed ? " · ready" : ""}
                        </button>
                      );
                    })}
                  </div>
                ) : <span style={{ color: css.textGray, fontSize: 12 }}>All tables are shown below; ratings save one candidate at a time.</span>}
              </div>
            ) : null}

            {tableSubmitError ? <ErrorBanner error={tableSubmitError} onDismiss={() => setTableSubmitError(null)} style={{ marginBottom: 16 }} /> : null}
            {tableSubmitNotice ? <div role="status" style={{ marginBottom: 16, padding: "11px 14px", borderRadius: 8, border: "1px solid rgba(29,158,117,0.25)", background: "rgba(29,158,117,0.08)", color: css.greenDark, fontSize: 12, fontWeight: 700 }}>{tableSubmitNotice}</div> : null}

            {!isCoffeeChat ? <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {["all", "pending", "pass", "fail", "hold"].map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: `1px solid ${filter === id ? css.greenDark : css.borderLight}`,
                    background: filter === id ? css.greenDark : "#FFF",
                    color: filter === id ? "#FFF" : css.textDark,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {id}
                </button>
              ))}
            </div> : null}

            {query.error ? (
              <ErrorBanner
                error={query.error}
                onRetry={() => query.refetch()}
                style={{ marginBottom: 16 }}
              />
            ) : null}

            {loading || cycleLoading ? (
              <PageLoader />
            ) : (isCoffeeChat ? data.candidates : filtered).length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: css.textGray, lineHeight: 1.6 }}>
                {data.deliberationStarted
                  ? "No candidates were advanced from resume screening. Mark candidates as Advanced on the Scoreboard deliberation view, then return here."
                  : "No candidates ready for interviews yet. Complete resume screening first, or use Scoreboard deliberation to advance candidates."}
              </div>
            ) : isCoffeeChat ? (
              <div style={{ display: "flex", flexDirection: "column", gap: coffeeView === "scroll" ? 72 : 20 }}>
                {(coffeeView === "list" ? coffeeGroups.filter(([number]) => number === activeGroupNumber) : coffeeGroups).map(([number, candidates]) => {
                  const currentIndex = coffeeGroups.findIndex(([groupNumber]) => groupNumber === number);
                  const nextGroupNumber = coffeeGroups[(currentIndex + 1) % coffeeGroups.length]?.[0] ?? number;
                  return (
                    <section key={number} style={{ padding: 22, background: number ? "rgba(29,158,117,0.035)" : "rgba(239,159,39,0.05)", border: `1px solid ${css.borderLight}`, borderRadius: 14 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
                        <h2 style={{ margin: 0, fontSize: 20, color: css.textDark }}>{number ? `Table ${number}` : "Unassigned candidates"}</h2>
                        <span style={{ fontSize: 13, color: css.textGray }}>{candidates.length} candidate{candidates.length === 1 ? "" : "s"}</span>
                      </div>
                      <div className="coffee-candidate-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${getBalancedColumnCount(candidates.length)}, minmax(0, 1fr))`, gap: 14 }}>
                        {candidates.map((candidate) => (
                          <CoffeeChatCandidateCard
                            key={candidate.id}
                            candidate={candidate}
                            draft={coffeeDrafts[candidate.id] || makeCoffeeDraft(candidate)}
                            busy={loading || tableSubmitting}
                            showSave={false}
                            autoSave={coffeeView === "scroll"}
                            validationError={invalidCandidateIds.has(candidate.id)}
                            expectedRatingCount={Number.isFinite(data.context?.assignedMemberCount) ? data.context.assignedMemberCount : null}
                            onDraftChange={(draft) => updateCoffeeDraft(candidate.id, draft)}
                            onSave={saveEvaluation}
                            onOpenProfile={() => navigate(`/candidates/${candidate.resumeId}`, { state: { returnTo: `${location.pathname}${location.search}`, returnLabel: "Coffee Chat grading", resumeScreenRank: candidate.resumeScreenRank, coffeeChatScore: candidate.coffeeChatScore, coffeeChatEvaluationCount: candidate.coffeeChatEvaluationCount } })}
                          />
                        ))}
                      </div>
                      {coffeeView === "list" ? (
                        <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${css.borderLight}`, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                          <button type="button" disabled={tableSubmitting || !candidates.length} onClick={() => submitCoffeeTable(number, candidates)} style={{ border: "none", borderRadius: 10, padding: "12px 20px", background: css.greenDark, color: "#FFF", fontSize: 14, fontWeight: 700, cursor: tableSubmitting || !candidates.length ? "not-allowed" : "pointer", opacity: tableSubmitting || !candidates.length ? 0.6 : 1 }}>
                            {tableSubmitting ? "Submitting table…" : `Submit ${number ? `Table ${number}` : "table"} → ${nextGroupNumber ? `Table ${nextGroupNumber}` : "next"}`}
                          </button>
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {filtered.map((candidate) => (
                  <CandidateInterviewCard key={candidate.id} candidate={candidate} busy={loading} onSave={saveEvaluation} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
