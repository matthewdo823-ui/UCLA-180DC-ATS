import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthedFetch } from "../../auth/AuthContext";
import { API } from "../../constants/config";
import { css } from "../../theme/colors";
import Topbar from "../../components/Topbar/Topbar";

const serifFont = "Georgia, 'Times New Roman', serif";

const CYCLE_STATUS_STYLE = {
  active: { bg: "rgba(29,158,117,0.12)", color: "#1D9E75", bd: "rgba(29,158,117,0.28)" },
  draft: { bg: "rgba(239,159,39,0.12)", color: "#C47D12", bd: "rgba(239,159,39,0.28)" },
  archived: { bg: "rgba(107,114,128,0.12)", color: "#6B7280", bd: "rgba(107,114,128,0.28)" },
};

const ROUND_STATUS_STYLE = {
  active: { bg: "rgba(29,158,117,0.12)", color: "#1D9E75", bd: "rgba(29,158,117,0.28)" },
  draft: { bg: "rgba(239,159,39,0.12)", color: "#C47D12", bd: "rgba(239,159,39,0.28)" },
  closed: { bg: "rgba(107,114,128,0.12)", color: "#6B7280", bd: "rgba(107,114,128,0.28)" },
};

function StatusBadge({ status, styles }) {
  const style = styles[status] || styles.draft;
  return (
    <span style={{
      background: style.bg,
      color: style.color,
      border: `1px solid ${style.bd}`,
      borderRadius: 999,
      fontSize: 10,
      fontWeight: 800,
      padding: "4px 10px",
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      {status}
    </span>
  );
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function ActionButton({ label, onClick, disabled, variant = "secondary" }) {
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: `1px solid ${isPrimary ? css.greenDark : isDanger ? css.red : css.borderLight}`,
        background: isPrimary ? css.greenDark : "#FFF",
        color: isPrimary ? "#FFF" : isDanger ? css.red : css.textDark,
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {label}
    </button>
  );
}

function RoundCard({ round, cycle, busy, onActivate, onClose, onSaveRubric }) {
  const [editingRubric, setEditingRubric] = useState(false);
  const [rubricText, setRubricText] = useState("");
  const [rubricError, setRubricError] = useState("");

  useEffect(() => {
    if (!editingRubric) {
      setRubricText(round.rubricConfig ? JSON.stringify(round.rubricConfig, null, 2) : "");
      setRubricError("");
    }
  }, [round.rubricConfig, editingRubric]);

  const isResumeRound = round.type === "resume_screen";

  return (
    <div style={{
      border: `1px solid ${css.borderLight}`,
      borderRadius: 12,
      padding: 16,
      background: "#FAFBFA",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: css.textDark }}>{round.name}</span>
            <StatusBadge status={round.status} styles={ROUND_STATUS_STYLE} />
          </div>
          <p style={{ margin: 0, fontSize: 12, color: css.textGray }}>
            Type: {round.type === "resume_screen" ? "Resume screen" : "Interview management"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {round.status !== "active" ? (
            <ActionButton label="Activate round" onClick={() => onActivate(round.id)} disabled={busy || cycle.status !== "active"} variant="primary" />
          ) : (
            <ActionButton label="Close round" onClick={() => onClose(round.id)} disabled={busy} variant="danger" />
          )}
          {isResumeRound ? (
            <ActionButton
              label={editingRubric ? "Cancel edit" : "Edit rubric"}
              onClick={() => setEditingRubric((v) => !v)}
              disabled={busy}
            />
          ) : null}
        </div>
      </div>

      {isResumeRound && editingRubric ? (
        <div style={{ marginTop: 14 }}>
          <p style={{ margin: "0 0 8px", fontSize: 11, color: css.textGray, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Rubric config (JSON)
          </p>
          <textarea
            value={rubricText}
            onChange={(e) => {
              setRubricText(e.target.value);
              setRubricError("");
            }}
            style={{
              width: "100%",
              minHeight: 220,
              padding: 12,
              borderRadius: 8,
              border: `1px solid ${css.borderLight}`,
              fontFamily: "'DM Mono', monospace",
              fontSize: 12,
              boxSizing: "border-box",
              resize: "vertical",
            }}
          />
          {rubricError ? (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: css.red }}>{rubricError}</p>
          ) : null}
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <ActionButton
              label="Save rubric"
              variant="primary"
              disabled={busy}
              onClick={async () => {
                try {
                  const parsed = JSON.parse(rubricText);
                  setRubricError("");
                  await onSaveRubric(round.id, parsed);
                  setEditingRubric(false);
                } catch {
                  setRubricError("Invalid JSON. Check syntax and try again.");
                }
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CycleCard({ cycle, busy, onActivate, onArchive, onActivateRound, onCloseRound, onSaveRubric }) {
  const [expanded, setExpanded] = useState(cycle.isActive);

  return (
    <div style={{
      background: css.cardWhite,
      border: `1px solid ${cycle.isActive ? "rgba(29,158,117,0.35)" : css.borderLight}`,
      borderRadius: 14,
      overflow: "hidden",
      boxShadow: cycle.isActive ? "0 4px 18px rgba(29,158,117,0.08)" : "0 1px 2px rgba(0,0,0,0.02)",
    }}>
      <div style={{ padding: "18px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <h3 style={{ fontFamily: serifFont, fontSize: 20, margin: 0, color: css.textDark }}>{cycle.name}</h3>
              <StatusBadge status={cycle.status} styles={CYCLE_STATUS_STYLE} />
              {cycle.isActive ? (
                <span style={{ fontSize: 10, fontWeight: 800, color: "#1D9E75", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Site-wide active
                </span>
              ) : null}
            </div>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: css.textGray }}>
              Slug: {cycle.slug} · Created {formatDate(cycle.createdAt)}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: css.textGray }}>
              {cycle.counts?.candidates ?? 0} candidates · {cycle.counts?.resumes ?? 0} resumes · {cycle.counts?.reviews ?? 0} reviews
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {!cycle.isActive && cycle.status !== "archived" ? (
              <ActionButton label="Activate cycle" onClick={() => onActivate(cycle.id)} disabled={busy} variant="primary" />
            ) : null}
            {cycle.status !== "archived" ? (
              <ActionButton label="Archive" onClick={() => onArchive(cycle.id)} disabled={busy || cycle.isActive} variant="danger" />
            ) : null}
            <ActionButton label={expanded ? "Hide rounds" : "View rounds"} onClick={() => setExpanded((v) => !v)} disabled={busy} />
          </div>
        </div>
      </div>

      {expanded ? (
        <div style={{ borderTop: `1px solid ${css.borderLight}`, padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 12, background: "#FCFDFC" }}>
          {(cycle.rounds || []).map((round) => (
            <RoundCard
              key={round.id}
              round={round}
              cycle={cycle}
              busy={busy}
              onActivate={onActivateRound}
              onClose={onCloseRound}
              onSaveRubric={onSaveRubric}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function CycleManagementPage() {
  const authedFetch = useAuthedFetch();
  const [cycles, setCycles] = useState([]);
  const [activeCycleId, setActiveCycleId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newCycleName, setNewCycleName] = useState("");

  const loadCycles = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authedFetch(`${API}/cycles`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not load cycles");
      }
      const data = await res.json();
      setCycles(Array.isArray(data.cycles) ? data.cycles : []);
      setActiveCycleId(data.activeCycleId || null);
    } catch (e) {
      setError(e.message || "Could not load cycles");
      setCycles([]);
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    loadCycles();
  }, [loadCycles]);

  const activeCycle = useMemo(
    () => cycles.find((c) => c.id === activeCycleId) || cycles.find((c) => c.isActive) || null,
    [cycles, activeCycleId]
  );

  async function runAction(action) {
    setBusy(true);
    setError("");
    try {
      await action();
      await loadCycles();
    } catch (e) {
      setError(e.message || "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateCycle(e) {
    e.preventDefault();
    const name = newCycleName.trim();
    if (!name) return;

    await runAction(async () => {
      const res = await authedFetch(`${API}/cycles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not create cycle");
      }
      setNewCycleName("");
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: css.bgLight, color: css.textDark, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
      <Topbar phaseLabel="Admin · Cycle management" activeLabel="Recruiting cycles" rightSlot={<></>} />

      <div style={{ maxWidth: 960, margin: "0 auto", width: "100%", padding: "24px 24px 40px" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: serifFont, fontSize: 30, margin: "0 0 8px", color: css.textDark }}>Cycle management</h1>
          <p style={{ margin: 0, fontSize: 14, color: css.textGray, lineHeight: 1.5 }}>
            Create recruiting cycles (e.g. Winter 26), activate one site-wide, and manage rounds within each cycle.
            Only one cycle is active at a time. Close a round before activating the next.
          </p>
        </div>

        {activeCycle ? (
          <div style={{
            marginBottom: 20,
            padding: "14px 16px",
            borderRadius: 12,
            border: "1px solid rgba(29,158,117,0.25)",
            background: "rgba(29,158,117,0.06)",
            fontSize: 13,
            color: css.textDark,
          }}>
            <strong>Active cycle:</strong> {activeCycle.name}
            {activeCycle.rounds?.find((r) => r.status === "active") ? (
              <> · <strong>Active round:</strong> {activeCycle.rounds.find((r) => r.status === "active").name}</>
            ) : (
              <> · <span style={{ color: css.textGray }}>No active round</span></>
            )}
          </div>
        ) : null}

        <form onSubmit={handleCreateCycle} style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginBottom: 20,
          padding: 16,
          background: css.cardWhite,
          border: `1px solid ${css.borderLight}`,
          borderRadius: 12,
        }}>
          <input
            type="text"
            value={newCycleName}
            onChange={(e) => setNewCycleName(e.target.value)}
            placeholder='New cycle name, e.g. "Winter 26"'
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${css.borderLight}`,
              fontSize: 14,
            }}
          />
          <button
            type="submit"
            disabled={busy || !newCycleName.trim()}
            style={{
              border: `1px solid ${css.greenDark}`,
              background: css.greenDark,
              color: "#FFF",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: busy || !newCycleName.trim() ? "not-allowed" : "pointer",
              opacity: busy || !newCycleName.trim() ? 0.55 : 1,
            }}
          >
            Create cycle
          </button>
        </form>

        {error ? (
          <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 10, background: "rgba(226,75,74,0.08)", border: "1px solid rgba(226,75,74,0.18)", color: css.red, fontSize: 13 }}>
            {error}
          </div>
        ) : null}

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: css.textGray }}>Loading cycles…</div>
        ) : cycles.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: css.textGray }}>No cycles yet. Create one to get started.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {cycles.map((cycle) => (
              <CycleCard
                key={cycle.id}
                cycle={cycle}
                busy={busy}
                onActivate={(id) => runAction(async () => {
                  const res = await authedFetch(`${API}/cycles/${id}/activate`, { method: "POST" });
                  if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.error || "Could not activate cycle");
                  }
                })}
                onArchive={(id) => runAction(async () => {
                  const res = await authedFetch(`${API}/cycles/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: "archived" }),
                  });
                  if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.error || "Could not archive cycle");
                  }
                })}
                onActivateRound={(roundId) => runAction(async () => {
                  const res = await authedFetch(`${API}/rounds/${roundId}/activate`, { method: "POST" });
                  if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.error || "Could not activate round");
                  }
                })}
                onCloseRound={(roundId) => runAction(async () => {
                  const res = await authedFetch(`${API}/rounds/${roundId}/close`, { method: "POST" });
                  if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.error || "Could not close round");
                  }
                })}
                onSaveRubric={(roundId, rubricConfig) => runAction(async () => {
                  const res = await authedFetch(`${API}/rounds/${roundId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ rubricConfig }),
                  });
                  if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.error || "Could not save rubric");
                  }
                })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
