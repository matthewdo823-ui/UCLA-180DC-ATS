import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { API } from "../../constants/config";
import { readJsonOrThrow } from "../../lib/queryClient";
import { qk } from "../../lib/queryKeys";
import { css } from "../../theme/colors";
import { formatResponseError } from "../../utils/errors";
import { formatDate } from "../../utils/format";
import { formatPacific, isoToPacificInputs, pacificToIso } from "../../utils/pacificTime";
import ActionButton from "./ActionButton";

const DEFAULT_STEPS = [1, 1.025, 1.05, 1.075, 1.1];
const EXAMPLE_SCORE = 12;
const FIELD_TARGET_OPTIONS = [
  { value: "", label: "Skip" },
  { value: "name", label: "Name" },
  { value: "email", label: "Email" },
  { value: "university_id", label: "University ID" },
];
const MAPPING_BADGE = {
  ok: { label: "Mapped", color: "#1D9E75", bg: "rgba(29,158,117,0.12)" },
  stale: { label: "Form changed", color: css.red, bg: "rgba(226,75,74,0.1)" },
  unconfigured: { label: "Not configured", color: "#C47D12", bg: "rgba(239,159,39,0.12)" },
};

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 6,
  border: `1px solid ${css.borderLight}`,
  fontSize: 13,
  boxSizing: "border-box",
  background: "#FFF",
};
const cellStyle = { padding: "7px 8px", borderBottom: `1px solid ${css.borderLight}`, verticalAlign: "middle" };
const labelStyle = { fontSize: 11, fontWeight: 700, color: css.textGray, textTransform: "uppercase", letterSpacing: "0.05em" };

function Feedback({ error, message }) {
  if (error) return <p style={{ margin: "8px 0 0", fontSize: 12, color: css.red }}>{error}</p>;
  if (message) return <p style={{ margin: "8px 0 0", fontSize: 12, color: "#1D9E75" }}>{message}</p>;
  return null;
}

function Badge({ label, color, bg }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color, background: bg, borderRadius: 999, padding: "3px 8px", letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function formEditUrl(formId) {
  return formId ? `https://docs.google.com/forms/d/${formId}/edit` : "";
}

async function sendJson(authedFetch, url, method, body, context) {
  const res = await authedFetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await formatResponseError(res, context);
  return res.json().catch(() => ({}));
}

function InterestMultiplierEditor({ cycle, busy, authedFetch, onSaved }) {
  const saved = Array.isArray(cycle.interestMultiplierSteps) ? cycle.interestMultiplierSteps : DEFAULT_STEPS;
  const savedKey = saved.join(",");
  const [draft, setDraft] = useState(() => saved.map(String));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => { setDraft(saved.map(String)); }, [cycle.id, savedKey]);

  const values = draft.map((v) => Number(v));
  const invalidIndex = draft.findIndex((v, i) => v.trim() === "" || !Number.isFinite(values[i]) || values[i] <= 0 || values[i] > 10);
  const decreasing = invalidIndex === -1 && values.some((v, i) => i > 0 && v < values[i - 1]);
  const dirty = values.join(",") !== savedKey;

  function updateRow(index, value) {
    setDraft((prev) => prev.map((v, i) => (i === index ? value : v)));
    setMessage("");
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await sendJson(authedFetch, `${API}/cycles/${cycle.id}`, "PATCH", { interestMultiplierSteps: values }, "saving multipliers");
      setMessage("Multipliers saved. Scoreboard rankings update on the next load.");
      await onSaved();
    } catch (e) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ border: `1px solid ${css.borderLight}`, borderRadius: 10, padding: 14, background: "#FFF" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline", marginBottom: 8 }}>
        <h5 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: css.textDark }}>Multiplier by events attended</h5>
        <span style={{ fontSize: 11, color: css.textGray }}>The last row applies to that many events or more. Scores can exceed 100%.</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: "left", color: css.textGray }}>
              <th style={cellStyle}>Events attended</th>
              <th style={cellStyle}>Multiplier</th>
              <th style={cellStyle}>A score of {EXAMPLE_SCORE} becomes</th>
            </tr>
          </thead>
          <tbody>
            {draft.map((value, index) => {
              const numeric = values[index];
              const valid = Number.isFinite(numeric) && numeric > 0;
              const isLast = index === draft.length - 1;
              return (
                <tr key={index}>
                  <td style={cellStyle}>{index}{isLast && draft.length > 1 ? "+" : ""}</td>
                  <td style={cellStyle}>
                    <span style={{ color: css.textGray, marginRight: 4 }}>×</span>
                    <input
                      type="number"
                      step="0.005"
                      min="0"
                      max="10"
                      value={value}
                      aria-label={`Multiplier for ${index} events`}
                      onChange={(e) => updateRow(index, e.target.value)}
                      style={{ ...inputStyle, width: 90, borderColor: index === invalidIndex ? css.red : css.borderLight }}
                    />
                  </td>
                  <td style={{ ...cellStyle, color: css.textGray }}>
                    {valid ? `${(EXAMPLE_SCORE * numeric).toFixed(2)}${numeric !== 1 ? ` (${numeric > 1 ? "+" : ""}${(EXAMPLE_SCORE * (numeric - 1)).toFixed(2)})` : ""}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {invalidIndex !== -1 ? (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: css.red }}>Each multiplier must be a number above 0 and at most 10.</p>
      ) : decreasing ? (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#C47D12" }}>Heads up: a row is lower than the one above it, so attending more events would lower a score.</p>
      ) : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <ActionButton label="Add row" onClick={() => setDraft((prev) => [...prev, prev[prev.length - 1] || "1"])} disabled={busy || saving || draft.length >= 20} />
        <ActionButton label="Remove last" onClick={() => setDraft((prev) => prev.slice(0, -1))} disabled={busy || saving || draft.length <= 1} />
        {dirty ? <ActionButton label="Discard changes" onClick={() => setDraft(saved.map(String))} disabled={busy || saving} /> : null}
        <ActionButton label={saving ? "Saving…" : "Save multipliers"} onClick={handleSave} disabled={busy || saving || !dirty || invalidIndex !== -1} variant="primary" />
      </div>
      <Feedback error={error} message={message} />
    </div>
  );
}

function InterestEventPanel({ event, authedFetch, onChanged }) {
  const initialClose = isoToPacificInputs(event.closesAt);
  const [expanded, setExpanded] = useState(event.mappingStatus !== "ok");
  const [name, setName] = useState(event.name);
  const [closeDate, setCloseDate] = useState(initialClose.date);
  const [closeTime, setCloseTime] = useState(initialClose.time);
  const [formUrl, setFormUrl] = useState(formEditUrl(event.googleFormId));
  const [questions, setQuestions] = useState([]);
  const [fieldMap, setFieldMap] = useState(event.fieldMap || {});
  const [formTitle, setFormTitle] = useState(event.formTitle || "");
  const [working, setWorking] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const badge = event.googleFormId ? MAPPING_BADGE[event.mappingStatus] || MAPPING_BADGE.unconfigured : { label: "No form", color: css.textGray, bg: "rgba(107,114,128,0.12)" };
  const closed = new Date(event.closesAt).getTime() < Date.now();
  const counts = event.counts || {};

  function applyServerEvent(next) {
    const close = isoToPacificInputs(next.closesAt);
    setName(next.name);
    setCloseDate(close.date);
    setCloseTime(close.time);
    setFormUrl(formEditUrl(next.googleFormId));
    setFieldMap(next.fieldMap || {});
    setFormTitle(next.formTitle || "");
  }

  async function run(kind, action) {
    setWorking(kind);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(e.message || "Something went wrong");
    } finally {
      setWorking(null);
    }
  }

  const handleDiscover = () => run("discover", async () => {
    const body = await sendJson(authedFetch, `${API}/interest-events/${event.id}/discover-fields`, "POST", { formUrl: formUrl.trim() }, "discovering form fields");
    const discovered = body.questions || [];
    const suggested = body.suggestedFieldMap || {};
    // Same form: keep mappings whose questions still exist and fill gaps from title hints.
    // Different form: start from the suggestions.
    let nextMap = suggested;
    if (body.formId === event.googleFormId) {
      const liveIds = new Set(discovered.map((q) => q.questionId));
      const kept = Object.fromEntries(Object.entries(fieldMap).filter(([id]) => liveIds.has(id)));
      const keptTargets = new Set(Object.values(kept));
      const fill = Object.fromEntries(Object.entries(suggested).filter(([id, target]) => !keptTargets.has(target) && !kept[id]));
      nextMap = { ...fill, ...kept };
    }
    setQuestions(discovered);
    setFieldMap(nextMap);
    setFormTitle(body.formTitle || "");
    setMessage(`Found ${discovered.length} questions. Check the mapping, then save.`);
  });

  const handleSave = () => run("save", async () => {
    const closesAt = pacificToIso(closeDate, closeTime);
    if (!name.trim()) throw new Error("Event name is required");
    if (!closesAt) throw new Error("Enter the form close date and time");
    const payload = { name: name.trim(), closesAt, formUrl: formUrl.trim() || null };
    if (questions.length) Object.assign(payload, { fieldMap, formTitle });
    const body = await sendJson(authedFetch, `${API}/interest-events/${event.id}`, "PATCH", payload, "saving the event");
    if (body.event) applyServerEvent(body.event);
    setQuestions([]);
    setMessage(body.reclassified ? `Saved. ${body.reclassified} entries re-checked against the new settings.` : "Saved.");
    await onChanged();
  });

  const handleSync = () => run("sync", async () => {
    const body = await sendJson(authedFetch, `${API}/interest-events/${event.id}/sync`, "POST", null, "syncing responses");
    const result = body.result || {};
    setMessage(result.mappingStatus === "stale"
      ? "Responses were saved, but the form changed. Re-map fields to count them."
      : `Sync complete. ${result.ingested ?? 0} responses fetched, ${result.classified ?? 0} entries updated.`);
    await onChanged();
  });

  const handleDelete = () => {
    const total = (counts.counted || 0) + (counts.unmatched || 0) + (counts.late || 0) + (counts.dismissed || 0);
    if (!window.confirm(`Delete "${event.name}"${total ? ` and its ${total} attendance entries` : ""}? Candidates lose credit for this event.`)) return;
    run("delete", async () => {
      await sendJson(authedFetch, `${API}/interest-events/${event.id}`, "DELETE", null, "deleting the event");
      await onChanged();
    });
  };

  function setTarget(questionId, target) {
    setFieldMap((prev) => {
      const next = {};
      Object.entries(prev).forEach(([id, t]) => {
        if (id !== questionId && t !== target) next[id] = t;
      });
      if (target) next[questionId] = target;
      return next;
    });
  }

  const mappedSummary = Object.entries(event.fieldMap || {})
    .map(([, target]) => FIELD_TARGET_OPTIONS.find((o) => o.value === target)?.label || target)
    .join(", ");
  const isBusy = Boolean(working);

  return (
    <div style={{ border: `1px solid ${event.mappingStatus === "stale" ? "rgba(226,75,74,0.4)" : css.borderLight}`, borderRadius: 10, padding: "12px 14px", background: "#FFF" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: css.textDark }}>{event.name}</span>
            <Badge {...badge} />
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: css.textGray }}>
            {closed ? "Closed" : "Closes"} {formatPacific(event.closesAt)}
            {" · "}{counts.counted || 0} counted · {counts.unmatched || 0} unmatched · {counts.late || 0} late
            {event.lastSyncAt ? ` · Synced ${formatDate(event.lastSyncAt, { style: "short" })}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {event.googleFormId ? (
            <ActionButton label={working === "sync" ? "Syncing…" : "Sync now"} onClick={handleSync} disabled={isBusy} variant="primary" />
          ) : null}
          <ActionButton label={expanded ? "Collapse" : "Edit"} onClick={() => setExpanded((v) => !v)} disabled={isBusy} />
        </div>
      </div>

      {event.mappingStatus === "stale" && event.mappingError ? (
        <p style={{ margin: "10px 0 0", padding: "8px 10px", borderRadius: 8, background: "rgba(226,75,74,0.08)", color: css.red, fontSize: 12, fontWeight: 600 }}>
          {event.mappingError}
        </p>
      ) : null}

      {!expanded ? <Feedback error={error} message={message} /> : (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 2fr) minmax(140px, 1fr) minmax(120px, 1fr)", gap: 8 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={labelStyle}>Event name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={labelStyle}>Form closes (PT)</span>
              <input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={labelStyle}>Time (PT)</span>
              <input type="time" step="1" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} style={inputStyle} />
            </label>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={labelStyle}>Google Form edit URL</span>
            <input
              type="url"
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder="https://docs.google.com/forms/d/.../edit"
              style={inputStyle}
            />
          </label>
          <p style={{ margin: 0, fontSize: 11, color: css.textGray }}>
            Share the form with the service account as an editor, then discover its questions and map Name, Email, and University ID.
            {formTitle ? ` Form: ${formTitle}.` : ""}
          </p>

          {questions.length ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: css.textGray }}>
                    <th style={cellStyle}>Question</th>
                    <th style={cellStyle}>Used as</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.map((q) => (
                    <tr key={q.questionId}>
                      <td style={cellStyle}>
                        {q.title}
                        <div style={{ fontSize: 10, color: css.textGray, marginTop: 2 }}>{q.questionId}</div>
                      </td>
                      <td style={{ ...cellStyle, minWidth: 160 }}>
                        <select value={fieldMap[q.questionId] || ""} onChange={(e) => setTarget(q.questionId, e.target.value)} style={{ ...inputStyle, width: "100%", padding: "6px 8px" }}>
                          {FIELD_TARGET_OPTIONS.map((opt) => <option key={opt.value || "skip"} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : mappedSummary ? (
            <p style={{ margin: 0, fontSize: 12, color: css.textGray }}>Mapped fields: {mappedSummary}. Discover fields to change the mapping.</p>
          ) : null}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ActionButton label={working === "discover" ? "Discovering…" : "Discover fields"} onClick={handleDiscover} disabled={isBusy || !formUrl.trim()} variant="primary" />
            <ActionButton label={working === "save" ? "Saving…" : "Save event"} onClick={handleSave} disabled={isBusy} />
            <ActionButton label={working === "delete" ? "Deleting…" : "Delete event"} onClick={handleDelete} disabled={isBusy} variant="danger" />
          </div>
          <Feedback error={error} message={message} />
        </div>
      )}
    </div>
  );
}

function AddEventForm({ cycleId, authedFetch, onAdded }) {
  const [name, setName] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [closeTime, setCloseTime] = useState("23:59:59");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleAdd() {
    setError("");
    const closesAt = pacificToIso(closeDate, closeTime);
    if (!name.trim() || !closesAt) {
      setError("Enter an event name and the form's close date and time.");
      return;
    }
    setSaving(true);
    try {
      await sendJson(authedFetch, `${API}/cycles/${cycleId}/interest-events`, "POST", { name: name.trim(), closesAt }, "adding the event");
      setName("");
      setCloseDate("");
      setCloseTime("23:59:59");
      await onAdded();
    } catch (e) {
      setError(e.message || "Could not add the event");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ border: `1px dashed ${css.borderLight}`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "2 1 180px" }}>
          <span style={labelStyle}>New event</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Info Session" style={inputStyle} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 140px" }}>
          <span style={labelStyle}>Form closes (PT)</span>
          <input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 120px" }}>
          <span style={labelStyle}>Time (PT)</span>
          <input type="time" step="1" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} style={inputStyle} />
        </label>
        <ActionButton label={saving ? "Adding…" : "Add event"} onClick={handleAdd} disabled={saving} variant="primary" />
      </div>
      <Feedback error={error} />
    </div>
  );
}

function InterestReviewQueue({ cycleId, authedFetch, onChanged }) {
  const [selection, setSelection] = useState({});
  const [workingId, setWorkingId] = useState(null);
  const [error, setError] = useState("");

  const queueQuery = useQuery({
    queryKey: qk.interestAttendance(cycleId),
    queryFn: async () => {
      const res = await authedFetch(`${API}/cycles/${cycleId}/interest-attendance?status=unmatched,late`);
      return readJsonOrThrow(res, "loading the review queue", "Check GET /cycles/:cycleId/interest-attendance in server/src/routes/interestRoutes.js");
    },
  });
  const entries = queueQuery.data?.entries || [];
  const candidates = queueQuery.data?.candidates || [];

  async function resolve(entry, action) {
    const candidateId = selection[entry.id] ?? entry.matchedCandidate?.id ?? entry.suggestedCandidate?.id ?? "";
    if (action === "match" && !candidateId) {
      setError("Pick a candidate to match first.");
      return;
    }
    setWorkingId(entry.id);
    setError("");
    try {
      await sendJson(authedFetch, `${API}/interest-attendance/${entry.id}`, "PATCH", action === "match" ? { action, candidateId } : { action }, "updating the entry");
      await onChanged();
    } catch (e) {
      setError(e.message || "Update failed");
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div style={{ border: `1px solid ${css.borderLight}`, borderRadius: 10, padding: 14, background: "#FFF" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap", marginBottom: 8 }}>
        <h5 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: css.textDark }}>
          Review queue{entries.length ? ` (${entries.length})` : ""}
        </h5>
        <span style={{ fontSize: 11, color: css.textGray }}>Unmatched and late entries don&apos;t count until resolved.</span>
      </div>
      {queueQuery.isPending ? (
        <p style={{ margin: 0, fontSize: 12, color: css.textGray }}>Loading…</p>
      ) : queueQuery.error ? (
        <p style={{ margin: 0, fontSize: 12, color: css.red }}>{queueQuery.error.message}</p>
      ) : !entries.length ? (
        <p style={{ margin: 0, fontSize: 12, color: "#1D9E75" }}>Nothing needs review.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.map((entry) => {
            const selected = selection[entry.id] ?? entry.matchedCandidate?.id ?? entry.suggestedCandidate?.id ?? "";
            const canApprove = entry.status === "late" && entry.matchedCandidate && selected === entry.matchedCandidate.id;
            const rowBusy = workingId === entry.id;
            return (
              <div key={entry.id} style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, background: css.surfaceMuted }}>
                <div style={{ minWidth: 220, flex: "1 1 260px" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: css.textDark }}>{entry.submittedName || "No name given"}</span>
                    <Badge {...(entry.status === "late"
                      ? { label: "Late", color: css.red, bg: "rgba(226,75,74,0.1)" }
                      : { label: "Unmatched", color: "#C47D12", bg: "rgba(239,159,39,0.12)" })} />
                  </div>
                  <p style={{ margin: "3px 0 0", fontSize: 12, color: css.textGray }}>
                    {entry.eventName} · submitted {formatPacific(entry.submittedAt)}
                  </p>
                  <p style={{ margin: "3px 0 0", fontSize: 12, color: css.textDark }}>
                    {entry.submittedEmail || "no email"} · UID {entry.submittedUniversityId || "—"}
                  </p>
                  {entry.otherAnswers?.length ? (
                    <p style={{ margin: "3px 0 0", fontSize: 11, color: css.textGray }}>{entry.otherAnswers.join(" · ")}</p>
                  ) : null}
                  {entry.matchedCandidate ? (
                    <p style={{ margin: "3px 0 0", fontSize: 11, color: css.textGray }}>Matches {entry.matchedCandidate.name}, but was submitted after the form closed.</p>
                  ) : entry.suggestedCandidate ? (
                    <p style={{ margin: "3px 0 0", fontSize: 11, color: css.textGray }}>Suggested by name: {entry.suggestedCandidate.name} ({entry.suggestedCandidate.email})</p>
                  ) : null}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <select
                    value={selected}
                    aria-label="Candidate to credit"
                    onChange={(e) => setSelection((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                    style={{ ...inputStyle, maxWidth: 260, padding: "6px 8px" }}
                  >
                    <option value="">Choose a candidate…</option>
                    {candidates.map((c) => <option key={c.id} value={c.id}>{c.name || "Unnamed"} — {c.email}</option>)}
                  </select>
                  {canApprove ? (
                    <ActionButton label="Approve late" onClick={() => resolve(entry, "approve")} disabled={rowBusy} variant="primary" />
                  ) : (
                    <ActionButton label={entry.status === "late" ? "Match & count" : "Match"} onClick={() => resolve(entry, "match")} disabled={rowBusy || !selected} variant="primary" />
                  )}
                  <ActionButton label="Dismiss" onClick={() => resolve(entry, "dismiss")} disabled={rowBusy} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Feedback error={error} />
    </div>
  );
}

export default function DemonstratedInterestSection({ cycle, busy, authedFetch, onCycleSaved }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const eventsQuery = useQuery({
    queryKey: qk.interestEvents(cycle.id),
    queryFn: async () => {
      const res = await authedFetch(`${API}/cycles/${cycle.id}/interest-events`);
      return readJsonOrThrow(res, "loading Demonstrated Interest events", "Run server/sql/add_demonstrated_interest.sql and check server/src/routes/interestRoutes.js");
    },
  });
  const events = eventsQuery.data?.events || [];
  const needsReview = events.reduce((sum, e) => sum + (e.counts?.unmatched || 0) + (e.counts?.late || 0), 0);
  const staleCount = events.filter((e) => e.mappingStatus === "stale").length;

  // Attendance changes move scores, so expire the scoreboard and profile caches too.
  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.interestEvents(cycle.id) }),
      queryClient.invalidateQueries({ queryKey: qk.interestAttendance(cycle.id) }),
      queryClient.invalidateQueries({ queryKey: qk.scoreboardRoot() }),
      queryClient.invalidateQueries({ queryKey: qk.candidateApplicationsRoot() }),
    ]);
  }

  async function handleStepsSaved() {
    await Promise.all([onCycleSaved(), queryClient.invalidateQueries({ queryKey: qk.scoreboardRoot() })]);
  }

  const summary = eventsQuery.isPending
    ? "Loading…"
    : eventsQuery.error
      ? "Not available. Has the Demonstrated Interest migration been run?"
      : `${events.length} event${events.length === 1 ? "" : "s"}${needsReview ? ` · ${needsReview} need review` : ""}${staleCount ? ` · ${staleCount} form${staleCount === 1 ? "" : "s"} changed` : ""}`;

  return (
    <div style={{ border: `1px solid ${staleCount ? "rgba(226,75,74,0.4)" : css.borderLight}`, borderRadius: 12, padding: expanded ? 16 : "12px 14px", background: "#FFF" }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, border: "none", background: "transparent", padding: 0, cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ fontSize: 12, color: css.textGray, lineHeight: 1 }}>{expanded ? "▾" : "▸"}</span>
        <div style={{ minWidth: 0 }}>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: css.textDark }}>Demonstrated Interest</h4>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: css.textGray }}>
            {expanded ? "Event attendance, logged through one Google Form per event, multiplies each candidate's Resume + FRQ score." : summary}
          </p>
        </div>
      </button>

      {expanded ? (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <InterestMultiplierEditor cycle={cycle} busy={busy} authedFetch={authedFetch} onSaved={handleStepsSaved} />

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h5 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: css.textDark }}>Events</h5>
            {eventsQuery.error ? (
              <p style={{ margin: 0, fontSize: 12, color: css.red }}>{eventsQuery.error.message}</p>
            ) : null}
            {events.map((event) => (
              <InterestEventPanel key={event.id} event={event} authedFetch={authedFetch} onChanged={refreshAll} />
            ))}
            {!eventsQuery.error ? <AddEventForm cycleId={cycle.id} authedFetch={authedFetch} onAdded={refreshAll} /> : null}
          </div>

          {!eventsQuery.error && events.length ? (
            <InterestReviewQueue cycleId={cycle.id} authedFetch={authedFetch} onChanged={refreshAll} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
