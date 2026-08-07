import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthedFetch } from "../../auth/AuthContext";
import { useActiveCycle } from "../../hooks/useActiveCycle";
import { API } from "../../constants/config";
import { css } from "../../theme/colors";
import Topbar from "../../components/Topbar/Topbar";
import { pageTitleStyle, sansFont } from "../../theme/typography";
import { getInitials } from "../../utils/format";

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
                Resume screen avg: {candidate.avgResumeScore}% · {candidate.resumeReviewCount} review{candidate.resumeReviewCount === 1 ? "" : "s"}
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
  const { phaseLabel, activeRound, isInterviewRound, loading: cycleLoading, error: cycleError } = useActiveCycle();
  const [data, setData] = useState({ candidates: [], stats: null, context: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authedFetch(`${API}/interviews/candidates`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not load interview candidates");
      }
      setData(await res.json());
    } catch (e) {
      setError(e.message || "Could not load candidates");
      setData({ candidates: [], stats: null, context: null });
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    if (!cycleLoading && isInterviewRound) loadCandidates();
  }, [cycleLoading, isInterviewRound, loadCandidates]);

  const saveEvaluation = useCallback(async (payload) => {
    const res = await authedFetch(`${API}/interviews/evaluations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Could not save evaluation");
    }
    await loadCandidates();
  }, [authedFetch, loadCandidates]);

  const filtered = useMemo(() => {
    const list = data.candidates || [];
    if (filter === "all") return list;
    return list.filter((c) => (c.evaluation?.decision || "pending") === filter);
  }, [data.candidates, filter]);

  const blocked = !cycleLoading && (!isInterviewRound || cycleError);

  const roundLabel = activeRound?.name || "Interviews";

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: css.bgLight, color: css.textDark, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
      <Topbar phaseLabel={phaseLabel} activeLabel={roundLabel} rightSlot={<></>} />

      <div style={{ maxWidth: 960, margin: "0 auto", width: "100%", padding: "24px 24px 40px" }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ ...pageTitleStyle, margin: "0 0 8px" }}>{roundLabel}</h1>
          <p style={{ margin: 0, color: css.textGray, lineHeight: 1.5 }}>
            Schedule interviews and record pass / fail / hold decisions. Candidates appear here after advancing from the previous round.
          </p>
        </div>

        {blocked ? (
          <div style={{ padding: 40, textAlign: "center", color: css.textGray }}>
            {cycleError || `Interview evaluations are not open. An admin must activate the ${roundLabel} round for this cycle.`}
          </div>
        ) : (
          <>
            {data.stats ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
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

            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
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
            </div>

            {error ? (
              <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, background: "rgba(226,75,74,0.08)", color: css.red }}>{error}</div>
            ) : null}

            {loading || cycleLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: css.textGray }}>Loading candidates…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: css.textGray, lineHeight: 1.6 }}>
                {data.deliberationStarted
                  ? "No candidates were advanced from resume screening. Mark candidates as Advanced on the Scoreboard deliberation view, then return here."
                  : "No candidates ready for interviews yet. Complete resume screening first, or use Scoreboard deliberation to advance candidates."}
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
