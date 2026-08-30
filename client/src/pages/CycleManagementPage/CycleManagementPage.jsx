import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthedFetch } from "../../auth/AuthContext";
import { API } from "../../constants/config";
import { readJsonOrThrow, STALE } from "../../lib/queryClient";
import { qk } from "../../lib/queryKeys";
import { css } from "../../theme/colors";
import Topbar from "../../components/Topbar/Topbar";
import PageLoader from "../../components/PageLoader";
import ErrorBanner from "../../components/ErrorBanner/ErrorBanner";
import { formatResponseError } from "../../utils/errors";
import {
  RUBRIC_IMAGE_OPTIONS,
  RUBRIC_YEAR_KEYS,
  cloneRubricConfig,
  validateRubricDraft,
} from "../../utils/rubric";
import { formatDate } from "../../utils/format";
import { pageTitleStyle, sansFont } from "../../theme/typography";
import { formatRoundTypeLabel, isResumeScreenType } from "../../constants/rounds";
import { formatReviewCountPair } from "../../utils/reviewCounts";

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
      fontWeight: 700,
      padding: "4px 10px",
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      {status}
    </span>
  );
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

const COLUMN_OPTIONS = [
  { value: "", label: "— Skip —" },
  { value: "name", label: "Name" },
  { value: "email", label: "Email" },
  { value: "phone_number", label: "Phone" },
  { value: "major", label: "Major" },
  { value: "gpa", label: "GPA" },
  { value: "year", label: "Year" },
  { value: "pronouns", label: "Pronouns" },
  { value: "urm", label: "URM" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "gm", label: "GM interest" },
  { value: "newbie_training", label: "Newbie training" },
  { value: "why_consulting", label: "Why consulting" },
  { value: "why_180dc", label: "Why 180DC" },
  { value: "why_social_impact", label: "Why social impact" },
  { value: "resume_file_url", label: "Resume upload" },
  { value: "extenuating_circumstances", label: "Extenuating circumstances" },
  { value: "headshot", label: "Headshot" },
];

function FormConfigPanel({ cycle, busy, authedFetch, onSaved }) {
  const [expanded, setExpanded] = useState(!cycle.hasFormConfig);
  const [formUrl, setFormUrl] = useState(cycle.googleFormId ? `https://docs.google.com/forms/d/${cycle.googleFormId}/edit` : "");
  const [questions, setQuestions] = useState([]);
  const [fieldMap, setFieldMap] = useState(cycle.formFieldMap || {});
  const [resumeQuestionId, setResumeQuestionId] = useState(cycle.formResumeQuestionId || "");
  const [headshotQuestionId, setHeadshotQuestionId] = useState(cycle.formHeadshotQuestionId || "");
  const [formTitle, setFormTitle] = useState("");
  const [panelError, setPanelError] = useState("");
  const [panelMessage, setPanelMessage] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setFormUrl(cycle.googleFormId ? `https://docs.google.com/forms/d/${cycle.googleFormId}/edit` : "");
    setFieldMap(cycle.formFieldMap || {});
    setResumeQuestionId(cycle.formResumeQuestionId || "");
    setHeadshotQuestionId(cycle.formHeadshotQuestionId || "");
    setPanelError("");
    setPanelMessage("");
  }, [cycle.id, cycle.googleFormId, cycle.formFieldMap, cycle.formResumeQuestionId, cycle.formHeadshotQuestionId]);

  async function handleDiscover() {
    setDiscovering(true);
    setPanelError("");
    setPanelMessage("");
    try {
      const res = await authedFetch(`${API}/cycles/${cycle.id}/discover-form-fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formUrl: formUrl.trim() }),
      });
      if (!res.ok) throw await formatResponseError(res, "discovering form fields");
      const body = await res.json().catch(() => ({}));

      setQuestions(body.questions || []);
      setFieldMap(body.suggestedFieldMap || {});
      setResumeQuestionId(body.resumeQuestionId || "");
      setHeadshotQuestionId(body.headshotQuestionId || "");
      setFormTitle(body.formTitle || "");
      setPanelMessage(`Found ${body.questions?.length || 0} questions. Review mappings, then save.`);
    } catch (e) {
      setPanelError(e.message || "Discovery failed");
    } finally {
      setDiscovering(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setPanelError("");
    setPanelMessage("");
    try {
      const cleanedMap = {};
      Object.entries(fieldMap).forEach(([qid, col]) => {
        if (col) cleanedMap[qid] = col;
      });

      const res = await authedFetch(`${API}/cycles/${cycle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formUrl: formUrl.trim(),
          fieldMap: cleanedMap,
          resumeQuestionId: resumeQuestionId || null,
          headshotQuestionId: headshotQuestionId || null,
        }),
      });
      if (!res.ok) throw await formatResponseError(res, "saving form configuration");
      setPanelMessage("Form config saved.");
      setExpanded(false);
      await onSaved();
    } catch (e) {
      setPanelError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setPanelError("");
    setPanelMessage("");
    try {
      const res = await authedFetch(`${API}/cycles/${cycle.id}/sync-form`, { method: "POST" });
      if (!res.ok) throw await formatResponseError(res, "syncing form responses");
      const body = await res.json().catch(() => ({}));
      setPanelMessage(`Sync complete. ${body.processed ?? 0} responses processed, ${body.errors ?? 0} errors.`);
      await onSaved();
    } catch (e) {
      setPanelError(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const mappedQuestions = questions.length
    ? questions
    : Object.keys(fieldMap).map((questionId) => ({ questionId, title: questionId }));

  const panelBusy = busy || discovering || saving || syncing;
  const fieldCount = Object.keys(cycle.formFieldMap || fieldMap).filter((k) => (cycle.formFieldMap || fieldMap)[k]).length;

  return (
    <div style={{
      border: `1px solid ${cycle.hasFormConfig ? "rgba(29,158,117,0.22)" : css.borderLight}`,
      borderRadius: 12,
      padding: expanded ? 16 : "12px 14px",
      background: "#FFF",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: expanded ? "flex-start" : "center", marginBottom: expanded ? 10 : 0 }}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 8,
            border: "none",
            background: "transparent",
            padding: 0,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: 12, color: css.textGray, lineHeight: 1 }}>{expanded ? "▾" : "▸"}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: css.textDark }}>Google Form sync</h4>
              {cycle.hasFormConfig ? (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#1D9E75", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  Configured
                </span>
              ) : null}
            </div>
            {expanded ? (
              <p style={{ margin: "4px 0 0", fontSize: 12, color: css.textGray, lineHeight: 1.45 }}>
                Paste the form <strong>edit</strong> URL for this cycle. Share the form with your service account email as editor.
                Use a separate form copy per cycle.
              </p>
            ) : (
              <p style={{ margin: "4px 0 0", fontSize: 12, color: css.textGray }}>
                {cycle.hasFormConfig
                  ? `${fieldCount} field mappings${cycle.lastFormSyncAt ? ` · Last sync ${formatDate(cycle.lastFormSyncAt, { style: "short" })}` : ""}`
                  : "Not configured — click to set up"}
              </p>
            )}
          </div>
        </button>
        {!expanded ? (
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {cycle.hasFormConfig ? (
              <ActionButton label={syncing ? "Syncing…" : "Sync now"} onClick={handleSync} disabled={panelBusy} variant="primary" />
            ) : null}
            <ActionButton label="Edit" onClick={() => setExpanded(true)} disabled={panelBusy} />
          </div>
        ) : null}
      </div>

      {!expanded ? (
        <>
          {panelError ? <p style={{ margin: "8px 0 0", fontSize: 12, color: css.red }}>{panelError}</p> : null}
          {panelMessage ? <p style={{ margin: "8px 0 0", fontSize: 12, color: "#1D9E75" }}>{panelMessage}</p> : null}
        </>
      ) : null}

      {expanded ? (
        <>
      <input
        type="url"
        value={formUrl}
        onChange={(e) => setFormUrl(e.target.value)}
        placeholder="https://docs.google.com/forms/d/.../edit"
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 8,
          border: `1px solid ${css.borderLight}`,
          fontSize: 13,
          boxSizing: "border-box",
          marginBottom: 10,
        }}
      />

      {formTitle ? (
        <p style={{ margin: "0 0 10px", fontSize: 12, color: css.textGray }}>Form: {formTitle}</p>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <ActionButton label={discovering ? "Discovering…" : "Discover fields"} onClick={handleDiscover} disabled={panelBusy || !formUrl.trim()} variant="primary" />
        <ActionButton label={saving ? "Saving…" : "Save config"} onClick={handleSave} disabled={panelBusy || !formUrl.trim()} />
        <ActionButton label={syncing ? "Syncing…" : "Sync now"} onClick={handleSync} disabled={panelBusy || !cycle.hasFormConfig} variant="primary" />
        {cycle.hasFormConfig ? (
          <ActionButton label="Collapse" onClick={() => setExpanded(false)} disabled={panelBusy} />
        ) : null}
      </div>

      {cycle.lastFormSyncAt ? (
        <p style={{ margin: "0 0 10px", fontSize: 11, color: css.textGray }}>
          Last sync: {formatDate(cycle.lastFormSyncAt, { style: "short" })}
        </p>
      ) : null}

      {panelError ? (
        <p style={{ margin: "0 0 10px", fontSize: 12, color: css.red }}>{panelError}</p>
      ) : null}
      {panelMessage ? (
        <p style={{ margin: "0 0 10px", fontSize: 12, color: "#1D9E75" }}>{panelMessage}</p>
      ) : null}

      {mappedQuestions.length ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", color: css.textGray }}>
                <th style={{ padding: "6px 8px", borderBottom: `1px solid ${css.borderLight}` }}>Question</th>
                <th style={{ padding: "6px 8px", borderBottom: `1px solid ${css.borderLight}` }}>Maps to</th>
              </tr>
            </thead>
            <tbody>
              {mappedQuestions.map((q) => (
                <tr key={q.questionId}>
                  <td style={{ padding: "8px", borderBottom: `1px solid ${css.borderLight}`, verticalAlign: "top" }}>
                    {q.title}
                    <div style={{ fontSize: 10, color: css.textGray, marginTop: 2 }}>{q.questionId}</div>
                  </td>
                  <td style={{ padding: "8px", borderBottom: `1px solid ${css.borderLight}`, minWidth: 180 }}>
                    <select
                      value={fieldMap[q.questionId] || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        setFieldMap((prev) => {
                          const next = { ...prev };
                          if (value) next[q.questionId] = value;
                          else delete next[q.questionId];
                          return next;
                        });
                        if (value === "resume_file_url") setResumeQuestionId(q.questionId);
                        if (value === "headshot") setHeadshotQuestionId(q.questionId);
                      }}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1px solid ${css.borderLight}` }}
                    >
                      {COLUMN_OPTIONS.map((opt) => (
                        <option key={opt.value || "skip"} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : cycle.formFieldMap && Object.keys(cycle.formFieldMap).length ? (
        <p style={{ margin: 0, fontSize: 12, color: css.textGray }}>
          {Object.keys(cycle.formFieldMap).length} field mappings saved. Click &quot;Discover fields&quot; to edit.
        </p>
      ) : null}
        </>
      ) : null}
    </div>
  );
}

function RubricEditor({ draft, onChange, error }) {
  function updateYear(yearKey, patch) {
    onChange({
      ...draft,
      byYear: {
        ...draft.byYear,
        [yearKey]: { ...draft.byYear[yearKey], ...patch },
      },
    });
  }

  function updateMetric(yearKey, index, value) {
    const metrics = [...draft.byYear[yearKey].metrics];
    metrics[index] = value;
    updateYear(yearKey, { metrics });
  }

  function addMetric(yearKey) {
    updateYear(yearKey, { metrics: [...draft.byYear[yearKey].metrics, ""] });
  }

  function removeMetric(yearKey, index) {
    const metrics = draft.byYear[yearKey].metrics.filter((_, i) => i !== index);
    updateYear(yearKey, { metrics });
  }

  const inputStyle = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 6,
    border: `1px solid ${css.borderLight}`,
    fontSize: 13,
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 8,
        background: "#FFF",
        border: `1px solid ${css.borderLight}`,
      }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: css.textDark, whiteSpace: "nowrap" }}>
          Max score per category
        </label>
        <input
          type="number"
          min={1}
          max={10}
          value={draft.maxPerCategory}
          onChange={(e) => onChange({ ...draft, maxPerCategory: Number(e.target.value) })}
          style={{ ...inputStyle, width: 72 }}
        />
        <span style={{ fontSize: 12, color: css.textGray }}>Typically 4 for 0–4 scoring</span>
      </div>

      {RUBRIC_YEAR_KEYS.map(({ key, title }) => {
        const entry = draft.byYear[key];
        const maxScore = entry.metrics.filter((m) => m.trim()).length * (draft.maxPerCategory || 4);
        return (
          <div
            key={key}
            style={{
              padding: 14,
              borderRadius: 10,
              border: `1px solid ${css.borderLight}`,
              background: "#FFF",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: css.textDark }}>{title}</span>
              <span style={{ fontSize: 11, color: css.textGray }}>Max total: {maxScore || "—"}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: css.textGray, marginBottom: 4 }}>
                  Display label
                </label>
                <input
                  type="text"
                  value={entry.label}
                  onChange={(e) => updateYear(key, { label: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: css.textGray, marginBottom: 4 }}>
                  Rubric image
                </label>
                <select
                  value={entry.imageUrl}
                  onChange={(e) => updateYear(key, { imageUrl: e.target.value })}
                  style={inputStyle}
                >
                  {RUBRIC_IMAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {entry.imageUrl ? (
              <img
                src={entry.imageUrl}
                alt={`${title} rubric`}
                style={{
                  width: "100%",
                  maxHeight: 120,
                  objectFit: "contain",
                  borderRadius: 8,
                  border: `1px solid ${css.borderLight}`,
                  marginBottom: 12,
                  background: "#FAFBFA",
                }}
              />
            ) : null}

            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: css.textGray, marginBottom: 6 }}>
              Scoring categories
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {entry.metrics.map((metric, index) => (
                <div key={`${key}-${index}`} style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    value={metric}
                    placeholder={`Category ${index + 1}`}
                    onChange={(e) => updateMetric(key, index, e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => removeMetric(key, index)}
                    disabled={entry.metrics.length <= 1}
                    style={{
                      border: `1px solid ${css.borderLight}`,
                      background: "#FFF",
                      color: entry.metrics.length <= 1 ? css.textGray : css.red,
                      borderRadius: 6,
                      padding: "0 10px",
                      fontSize: 12,
                      cursor: entry.metrics.length <= 1 ? "not-allowed" : "pointer",
                      opacity: entry.metrics.length <= 1 ? 0.5 : 1,
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => addMetric(key)}
              style={{
                marginTop: 8,
                border: `1px dashed ${css.borderLight}`,
                background: "transparent",
                color: css.textGray,
                borderRadius: 6,
                padding: "6px 10px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              + Add category
            </button>
          </div>
        );
      })}

      {error ? (
        <p style={{ margin: 0, fontSize: 12, color: css.red }}>{error}</p>
      ) : null}
    </div>
  );
}

function RoundCard({ round, cycle, busy, onActivate, onClose, onSaveRubric, onSaveAutoDecisions }) {
  const [editingRubric, setEditingRubric] = useState(false);
  const [rubricDraft, setRubricDraft] = useState(() => cloneRubricConfig(round.rubricConfig));
  const [rubricError, setRubricError] = useState("");
  const [autoAdvancePercent, setAutoAdvancePercent] = useState(round.autoAdvancePercent ?? 0);
  const [autoRejectPercent, setAutoRejectPercent] = useState(round.autoRejectPercent ?? 0);
  const [autoDecisionError, setAutoDecisionError] = useState("");

  useEffect(() => {
    if (!editingRubric) {
      setRubricDraft(cloneRubricConfig(round.rubricConfig));
      setRubricError("");
    }
  }, [round.rubricConfig, editingRubric]);

  useEffect(() => {
    setAutoAdvancePercent(round.autoAdvancePercent ?? 0);
    setAutoRejectPercent(round.autoRejectPercent ?? 0);
    setAutoDecisionError("");
  }, [round.autoAdvancePercent, round.autoRejectPercent]);

  const isResumeRound = isResumeScreenType(round.type);

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
            Type: {formatRoundTypeLabel(round.type)}
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

      {isResumeRound && !editingRubric && round.rubricConfig ? (
        <p style={{ margin: "12px 0 0", fontSize: 12, color: css.textGray }}>
          Rubric configured for {RUBRIC_YEAR_KEYS.length} year groups · max {round.rubricConfig.maxPerCategory ?? 4} per category
        </p>
      ) : null}

      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${css.borderLight}` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: css.textDark }}>Deliberation auto-decisions</div>
        <p style={{ margin: "4px 0 10px", fontSize: 12, color: css.textGray, lineHeight: 1.4 }}>
          Configure rank cutoffs here, then use <strong>Apply cutoffs</strong> in scoreboard deliberation. Existing manual decisions are never replaced.
        </p>
        <div style={{ display: "flex", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 700, color: css.textGray }}>
            Top % · Advance
            <input type="number" min="0" max="100" step="1" value={autoAdvancePercent}
              onChange={(e) => { setAutoAdvancePercent(e.target.value); setAutoDecisionError(""); }}
              disabled={busy} style={{ width: 100, padding: "7px 8px", border: `1px solid ${css.borderLight}`, borderRadius: 6 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 700, color: css.textGray }}>
            Bottom % · Reject
            <input type="number" min="0" max="100" step="1" value={autoRejectPercent}
              onChange={(e) => { setAutoRejectPercent(e.target.value); setAutoDecisionError(""); }}
              disabled={busy} style={{ width: 100, padding: "7px 8px", border: `1px solid ${css.borderLight}`, borderRadius: 6 }} />
          </label>
          <ActionButton label="Save percentages" disabled={busy} onClick={async () => {
            const advance = Number(autoAdvancePercent);
            const reject = Number(autoRejectPercent);
            if (!Number.isFinite(advance) || !Number.isFinite(reject) || advance < 0 || reject < 0 || advance > 100 || reject > 100 || advance + reject > 100) {
              setAutoDecisionError("Enter percentages from 0–100 that total no more than 100.");
              return;
            }
            await onSaveAutoDecisions(round.id, advance, reject);
          }} />
        </div>
        {autoDecisionError ? <p style={{ margin: "8px 0 0", fontSize: 12, color: css.red }}>{autoDecisionError}</p> : null}
      </div>

      {isResumeRound && editingRubric ? (
        <div style={{ marginTop: 14 }}>
          <RubricEditor
            draft={rubricDraft}
            onChange={(next) => {
              setRubricDraft(next);
              setRubricError("");
            }}
            error={rubricError}
          />
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <ActionButton
              label="Save rubric"
              variant="primary"
              disabled={busy}
              onClick={async () => {
                const cleaned = cloneRubricConfig(rubricDraft);
                cleaned.byYear = Object.fromEntries(
                  Object.entries(cleaned.byYear).map(([yearKey, entry]) => [
                    yearKey,
                    { ...entry, metrics: entry.metrics.map((m) => m.trim()).filter(Boolean) },
                  ])
                );
                const validationError = validateRubricDraft(cleaned);
                if (validationError) {
                  setRubricError(validationError);
                  return;
                }
                setRubricError("");
                await onSaveRubric(round.id, cleaned);
                setEditingRubric(false);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CycleCard({ cycle, busy, authedFetch, onReload, onActivate, onArchive, onActivateRound, onCloseRound, onSaveRubric, onSaveAutoDecisions }) {
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
              <h3 style={{ fontFamily: sansFont, fontSize: 20, margin: 0, color: css.textDark }}>{cycle.name}</h3>
              <StatusBadge status={cycle.status} styles={CYCLE_STATUS_STYLE} />
              {cycle.isActive ? (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#1D9E75", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Site-wide active
                </span>
              ) : null}
            </div>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: css.textGray }}>
              Slug: {cycle.slug} · Created {formatDate(cycle.createdAt, { style: "short" })}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: css.textGray }}>
              {cycle.counts?.candidates ?? 0} candidates · {cycle.counts?.resumes ?? 0} resumes · {formatReviewCountPair(cycle.counts?.resumeReviews, cycle.counts?.frqReviews)}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {!cycle.isActive ? (
              <ActionButton
                label={cycle.status === "archived" ? "Reactivate cycle" : "Activate cycle"}
                onClick={() => onActivate(cycle.id)}
                disabled={busy}
                variant="primary"
              />
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
          <FormConfigPanel cycle={cycle} busy={busy} authedFetch={authedFetch} onSaved={onReload} />
          {(cycle.rounds || []).map((round) => (
            <RoundCard
              key={round.id}
              round={round}
              cycle={cycle}
              busy={busy}
              onActivate={onActivateRound}
              onClose={onCloseRound}
              onSaveRubric={onSaveRubric}
              onSaveAutoDecisions={onSaveAutoDecisions}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PastCycleCard({ cycle, busy, onReactivate, onViewCandidates }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      background: css.cardWhite,
      border: `1px solid ${css.borderLight}`,
      borderRadius: 14,
      overflow: "hidden",
      boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
    }}>
      <div style={{ padding: "20px 22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 7 }}>
              <h3 style={{ fontFamily: sansFont, fontSize: 20, margin: 0, color: css.textDark }}>{cycle.name}</h3>
              <StatusBadge status={cycle.status} styles={CYCLE_STATUS_STYLE} />
            </div>
            <p style={{ margin: "0 0 7px", fontSize: 12, color: css.textGray }}>
              Created {formatDate(cycle.createdAt, { style: "short" })}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: css.textGray }}>
              {cycle.counts?.candidates ?? 0} candidates · {cycle.counts?.resumes ?? 0} resumes · {formatReviewCountPair(cycle.counts?.resumeReviews, cycle.counts?.frqReviews)}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ActionButton label="View candidates" onClick={() => onViewCandidates(cycle.id)} disabled={busy || !(cycle.counts?.candidates > 0)} variant="primary" />
            <ActionButton label={expanded ? "Hide history" : "View history"} onClick={() => setExpanded((value) => !value)} disabled={busy} />
            <ActionButton label="Reactivate" onClick={() => onReactivate(cycle.id)} disabled={busy} />
          </div>
        </div>
      </div>

      {expanded ? (
        <div style={{ borderTop: `1px solid ${css.borderLight}`, padding: "18px 22px 22px", background: "#FCFDFC" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, overflowX: "auto" }}>
            {(cycle.rounds || []).map((round, index) => {
              const decisions = round.decisionCounts || {};
              const total = (decisions.advance || 0) + (decisions.hold || 0) + (decisions.reject || 0) + (decisions.pending || 0);
              return (
                <div key={round.id} style={{ minWidth: 190, padding: 15, borderRadius: 10, border: `1px solid ${css.borderLight}`, background: css.cardWhite }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: css.textGray, textTransform: "uppercase", letterSpacing: "0.07em" }}>Stage {index + 1}</div>
                  <div style={{ marginTop: 6, fontSize: 15, fontWeight: 700, color: css.textDark }}>{round.name}</div>
                  {total > 0 ? (
                    <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 10px", fontSize: 11, color: css.textGray }}>
                      <span><strong style={{ color: css.green }}>{decisions.advance || 0}</strong> advanced</span>
                      <span><strong style={{ color: css.red }}>{decisions.reject || 0}</strong> rejected</span>
                      <span><strong style={{ color: css.amber }}>{decisions.hold || 0}</strong> held</span>
                      <span><strong style={{ color: css.textDark }}>{decisions.pending || 0}</strong> pending</span>
                    </div>
                  ) : (
                    <div style={{ marginTop: 12, fontSize: 11, color: css.textGray }}>No decisions recorded</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function CycleManagementPage() {
  const authedFetch = useAuthedFetch();
  const navigate = useNavigate();
  const [viewParams, setViewParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  // Action errors live here; the query owns load errors — merged into `error` below.
  const [actionError, setActionError] = useState(null);
  const [newCycleName, setNewCycleName] = useState("");
  const [cycleView, setCycleView] = useState(() => viewParams.get("view") === "past" ? "past" : "current");

  const cyclesQuery = useQuery({
    queryKey: qk.cycles(),
    queryFn: async () => {
      const res = await authedFetch(`${API}/cycles`);
      return readJsonOrThrow(res, "loading cycles", "Check GET /cycles in server/src/routes/cycleRoutes.js");
    },
    staleTime: STALE.dashboard,
  });

  const cycles = useMemo(
    () => (Array.isArray(cyclesQuery.data?.cycles) ? cyclesQuery.data.cycles : []),
    [cyclesQuery.data]
  );
  const activeCycleId = cyclesQuery.data?.activeCycleId || null;
  const loading = cyclesQuery.isPending;
  const error = actionError || cyclesQuery.error;

  // Expiring ["cycles"] also expires ["cycles","active"] (hierarchical key), so
  // activating a cycle or round here refreshes the active-cycle entry every page reads.
  const reloadCycles = useCallback(
    () => queryClient.invalidateQueries({ queryKey: qk.cycles() }),
    [queryClient]
  );

  const activeCycle = useMemo(
    () => cycles.find((c) => c.id === activeCycleId) || cycles.find((c) => c.isActive) || null,
    [cycles, activeCycleId]
  );
  const currentCycles = useMemo(
    () => cycles.filter((cycle) => cycle.status !== "archived"),
    [cycles]
  );
  const pastCycles = useMemo(
    () => cycles.filter((cycle) => cycle.status === "archived"),
    [cycles]
  );

  async function runAction(action) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      await reloadCycles();
    } catch (e) {
      setActionError(e);
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
        throw await formatResponseError(res, "creating recruiting cycle");
      }
      setNewCycleName("");
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: css.bgLight, color: css.textDark, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
      <Topbar phaseLabel="Admin · Cycle management" activeLabel="Recruiting cycles" rightSlot={<></>} />

      <div style={{ maxWidth: 960, margin: "0 auto", width: "100%", padding: "24px 24px 40px" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ ...pageTitleStyle, margin: "0 0 8px" }}>Cycle management</h1>
          <p style={{ margin: 0, fontSize: 14, color: css.textGray, lineHeight: 1.5 }}>
            Create recruiting cycles (e.g. Winter 26), link a Google Form per cycle, and manage rounds within each cycle.
            Only one cycle is active at a time. Close a round before activating the next. Archived cycles can be reactivated here.
          </p>
        </div>

        <div role="tablist" aria-label="Cycle views" style={{ display: "inline-flex", gap: 4, padding: 4, marginBottom: 20, borderRadius: 10, border: `1px solid ${css.borderLight}`, background: css.cardWhite }}>
          {[
            { value: "current", label: `Present cycle${currentCycles.length > 1 ? "s" : ""}` },
            { value: "past", label: `Past cycles (${pastCycles.length})` },
          ].map((tab) => {
            const selected = cycleView === tab.value;
            return (
              <button key={tab.value} type="button" role="tab" aria-selected={selected} onClick={() => {
                setCycleView(tab.value);
                setViewParams(tab.value === "past" ? { view: "past" } : {});
              }} style={{ border: "none", borderRadius: 7, padding: "9px 14px", background: selected ? css.greenDark : "transparent", color: selected ? "#FFF" : css.textGray, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                {tab.label}
              </button>
            );
          })}
        </div>

        {cycleView === "current" && activeCycle ? (
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

        {cycleView === "current" ? <form onSubmit={handleCreateCycle} style={{
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
        </form> : null}

        {error ? (
          <ErrorBanner
            error={error}
            onDismiss={actionError ? () => setActionError(null) : undefined}
            onRetry={cyclesQuery.isError ? () => cyclesQuery.refetch() : undefined}
            style={{ marginBottom: 16 }}
          />
        ) : null}

        {loading ? (
          <PageLoader />
        ) : cycles.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: css.textGray }}>No cycles yet. Create one to get started.</div>
        ) : cycleView === "past" ? (
          pastCycles.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: css.textGray }}>No archived cycles yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {pastCycles.map((cycle) => (
                <PastCycleCard
                  key={cycle.id}
                  cycle={cycle}
                  busy={busy}
                  onViewCandidates={(cycleId) => navigate(`/scoreboard?cycleId=${encodeURIComponent(cycleId)}`)}
                  onReactivate={(id) => runAction(async () => {
                    const res = await authedFetch(`${API}/cycles/${id}/activate`, { method: "POST" });
                    if (!res.ok) throw await formatResponseError(res, "reactivating cycle");
                    setCycleView("current");
                  })}
                />
              ))}
            </div>
          )
        ) : (
          currentCycles.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: css.textGray }}>No present cycle. Create one above or reactivate a past cycle.</div>
          ) : <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {currentCycles.map((cycle) => (
              <CycleCard
                key={cycle.id}
                cycle={cycle}
                busy={busy}
                authedFetch={authedFetch}
                onReload={reloadCycles}
                onActivate={(id) => runAction(async () => {
                  const res = await authedFetch(`${API}/cycles/${id}/activate`, { method: "POST" });
                  if (!res.ok) {
                    throw await formatResponseError(res, "activating cycle");
                  }
                })}
                onArchive={(id) => runAction(async () => {
                  const res = await authedFetch(`${API}/cycles/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: "archived" }),
                  });
                  if (!res.ok) {
                    throw await formatResponseError(res, "archiving cycle");
                  }
                })}
                onActivateRound={(roundId) => runAction(async () => {
                  const res = await authedFetch(`${API}/rounds/${roundId}/activate`, { method: "POST" });
                  if (!res.ok) {
                    throw await formatResponseError(res, "activating round");
                  }
                })}
                onCloseRound={(roundId) => runAction(async () => {
                  const res = await authedFetch(`${API}/rounds/${roundId}/close`, { method: "POST" });
                  if (!res.ok) {
                    throw await formatResponseError(res, "closing round");
                  }
                })}
                onSaveRubric={(roundId, rubricConfig) => runAction(async () => {
                  const res = await authedFetch(`${API}/rounds/${roundId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ rubricConfig }),
                  });
                  if (!res.ok) {
                    throw await formatResponseError(res, "saving rubric");
                  }
                })}
                onSaveAutoDecisions={(roundId, autoAdvancePercent, autoRejectPercent) => runAction(async () => {
                  const res = await authedFetch(`${API}/rounds/${roundId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ autoAdvancePercent, autoRejectPercent }),
                  });
                  if (!res.ok) {
                    throw await formatResponseError(res, "saving automatic decision percentages");
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
