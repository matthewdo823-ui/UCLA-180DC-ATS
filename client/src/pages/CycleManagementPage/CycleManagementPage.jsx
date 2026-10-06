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
import { ROUND_TYPES, formatRoundTypeLabel, isResumeScreenType, normalizeRoundType } from "../../constants/rounds";
import { formatReviewCountPair } from "../../utils/reviewCounts";
import {
  canManageTables,
  isClosedPhase,
  isOpenPhase,
} from "../../constants/roundPhases";
import PhaseBadge from "../../components/PhaseBadge/PhaseBadge";
import ActionButton from "../../components/ActionButton/ActionButton";
import PhaseStepper from "./PhaseStepper";

const CYCLE_STATUS_STYLE = {
  active: { bg: "rgba(29,158,117,0.12)", color: "#1D9E75", bd: "rgba(29,158,117,0.28)" },
  draft: { bg: "rgba(239,159,39,0.12)", color: "#C47D12", bd: "rgba(239,159,39,0.28)" },
  archived: { bg: "rgba(107,114,128,0.12)", color: "var(--color-text-muted)", bd: "rgba(107,114,128,0.28)" },
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

const COLUMN_OPTIONS = [
  { value: "", label: "— Skip —" },
  { value: "name", label: "Name" },
  { value: "first_name", label: "First name" },
  { value: "last_name", label: "Last name" },
  { value: "email", label: "Email" },
  { value: "phone_number", label: "Phone" },
  { value: "major", label: "Major" },
  { value: "gpa", label: "GPA" },
  { value: "year", label: "Year" },
  { value: "pronouns", label: "Pronouns" },
  { value: "urm", label: "Diversity identities (multi-select)" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "gm", label: "GM interest" },
  { value: "newbie_training", label: "Newbie training" },
  { value: "why_consulting", label: "Legacy: Why consulting", disabled: true },
  { value: "why_180dc", label: "Legacy: Why 180DC", disabled: true },
  { value: "why_social_impact", label: "Legacy: Why social impact", disabled: true },
  { value: "resume_file_url", label: "Resume upload" },
  { value: "extenuating_circumstances", label: "Extenuating circumstances" },
  { value: "headshot", label: "Headshot" },
  { value: "university_id", label: "University ID" },
  { value: "referral_source", label: "Referral source" },
  { value: "previously_applied", label: "Previously applied" },
  { value: "professional_development", label: "Professional development" },
  { value: "consulting_connect_interest", label: "Consulting Connect interest" },
];

function FormConfigPanel({ cycle, busy, authedFetch, onSaved }) {
  const [expanded, setExpanded] = useState(!cycle.hasFormConfig);
  const [formUrl, setFormUrl] = useState(cycle.googleFormId ? `https://docs.google.com/forms/d/${cycle.googleFormId}/edit` : "");
  const [questions, setQuestions] = useState(cycle.formQuestionCatalog || []);
  const [fieldMap, setFieldMap] = useState(cycle.formFieldMap || {});
  const [gradableQuestionIds, setGradableQuestionIds] = useState(cycle.formGradableQuestionIds || []);
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
    setQuestions(cycle.formQuestionCatalog || []);
    setGradableQuestionIds(cycle.formGradableQuestionIds || []);
    setResumeQuestionId(cycle.formResumeQuestionId || "");
    setHeadshotQuestionId(cycle.formHeadshotQuestionId || "");
    setPanelError("");
    setPanelMessage("");
  }, [cycle.id, cycle.googleFormId, cycle.formFieldMap, cycle.formQuestionCatalog, cycle.formGradableQuestionIds, cycle.formResumeQuestionId, cycle.formHeadshotQuestionId]);

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

      const discoveredQuestions = body.questions || [];
      setQuestions(discoveredQuestions);
      setFieldMap((current) => ({ ...(body.suggestedFieldMap || {}), ...current }));
      setResumeQuestionId((current) => current || body.resumeQuestionId || "");
      setHeadshotQuestionId((current) => current || body.headshotQuestionId || "");
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

      const duplicateTargets = Object.values(cleanedMap).filter((target, index, targets) => targets.indexOf(target) !== index);
      if (duplicateTargets.length) {
        throw new Error(`Each candidate field can only be mapped once. Duplicate: ${[...new Set(duplicateTargets)].join(", ")}`);
      }

      const unresolved = questions.filter((question) => !cleanedMap[question.questionId] && !gradableQuestionIds.includes(question.questionId));
      if (unresolved.length && !window.confirm(`${unresolved.length} question${unresolved.length === 1 ? " is" : "s are"} neither mapped nor marked for grading. Save anyway?`)) {
        return;
      }

      const res = await authedFetch(`${API}/cycles/${cycle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formUrl: formUrl.trim(),
          fieldMap: cleanedMap,
          questionCatalog: questions,
          gradableQuestionIds,
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
  const duplicateTargets = Object.values(fieldMap).filter((target, index, targets) => target && targets.indexOf(target) !== index);
  const unresolvedQuestions = questions.filter((question) => !fieldMap[question.questionId] && !gradableQuestionIds.includes(question.questionId));
  const fieldCount = Object.keys(cycle.formFieldMap || fieldMap).filter((k) => (cycle.formFieldMap || fieldMap)[k]).length;

  return (
    <div style={{
      border: `1px solid ${cycle.hasFormConfig ? "rgba(29,158,117,0.22)" : css.borderLight}`,
      borderRadius: 12,
      padding: expanded ? 16 : "12px 14px",
      background: "var(--color-surface)",
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
        <ActionButton label={saving ? "Saving…" : "Save config"} onClick={handleSave} disabled={panelBusy || !formUrl.trim() || duplicateTargets.length > 0} />
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

      {duplicateTargets.length ? (
        <p style={{ margin: "0 0 10px", padding: "8px 10px", borderRadius: 7, background: "rgba(226,75,74,0.08)", fontSize: 12, color: css.red }}>
          Duplicate destinations must be fixed before saving: {[...new Set(duplicateTargets)].join(", ")}.
        </p>
      ) : unresolvedQuestions.length ? (
        <p style={{ margin: "0 0 10px", padding: "8px 10px", borderRadius: 7, background: "rgba(239,159,39,0.10)", fontSize: 12, color: "var(--color-warning-text)" }}>
          {unresolvedQuestions.length} question{unresolvedQuestions.length === 1 ? " is" : "s are"} neither mapped to a profile field nor marked as a gradable response.
        </p>
      ) : null}

      {mappedQuestions.length ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", color: css.textGray }}>
                <th style={{ padding: "6px 8px", borderBottom: `1px solid ${css.borderLight}` }}>Question</th>
                <th style={{ padding: "6px 8px", borderBottom: `1px solid ${css.borderLight}` }}>Maps to</th>
                <th style={{ padding: "6px 8px", borderBottom: `1px solid ${css.borderLight}`, textAlign: "center" }}>Grade response</th>
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
                        <option key={opt.value || "skip"} value={opt.value} disabled={opt.disabled}>{opt.label}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: "8px", borderBottom: `1px solid ${css.borderLight}`, textAlign: "center", verticalAlign: "top" }}>
                    <input
                      type="checkbox"
                      checked={gradableQuestionIds.includes(q.questionId)}
                      onChange={(event) => {
                        setGradableQuestionIds((current) => event.target.checked
                          ? [...new Set([...current, q.questionId])]
                          : current.filter((questionId) => questionId !== q.questionId));
                      }}
                      aria-label={`Grade response for ${q.title}`}
                    />
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
        background: "var(--color-surface)",
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
              background: "var(--color-surface)",
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
                  background: "var(--color-surface-subtle)",
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
                      background: "var(--color-surface)",
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

function RoundCard({ round, cycle, busy, interviewPool, phaseIssue, onChangePhase, onSaveRubric, onSaveAutoDecisions, onAssignInterviewGroups }) {
  const [expanded, setExpanded] = useState(!isClosedPhase(round.status));
  const [editingRubric, setEditingRubric] = useState(false);
  const [rubricDraft, setRubricDraft] = useState(() => cloneRubricConfig(round.rubricConfig));
  const [rubricError, setRubricError] = useState("");
  const [autoAdvancePercent, setAutoAdvancePercent] = useState(round.autoAdvancePercent ?? 0);
  const [autoRejectPercent, setAutoRejectPercent] = useState(round.autoRejectPercent ?? 0);
  const [autoDecisionError, setAutoDecisionError] = useState("");
  const [interviewGroupCount, setInterviewGroupCount] = useState(round.interviewGroupCount || 1);

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

  useEffect(() => {
    setInterviewGroupCount(round.interviewGroupCount || 1);
  }, [round.interviewGroupCount]);

  useEffect(() => {
    setExpanded(!isClosedPhase(round.status));
    if (isClosedPhase(round.status)) setEditingRubric(false);
  }, [round.status]);

  const isResumeRound = isResumeScreenType(round.type);
  const isCoffeeChatRound = normalizeRoundType(round.type) === ROUND_TYPES.COFFEE_CHAT;
  const isClosed = isClosedPhase(round.status);
  const sortedRounds = [...(cycle.rounds || [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const roundIndex = sortedRounds.findIndex((candidateRound) => candidateRound.id === round.id);
  const priorRound = roundIndex > 0 ? sortedRounds[roundIndex - 1] : null;
  const interviewCandidateCount = isCoffeeChatRound
    ? interviewPool?.roundId === round.id
      ? interviewPool.candidateCount
      : Number(priorRound?.decisionCounts?.advance) || 0
    : 0;
  const numericGroupCount = Number(interviewGroupCount);
  const validGroupCount = Number.isInteger(numericGroupCount)
    && numericGroupCount >= 1
    && numericGroupCount <= Math.max(1, interviewCandidateCount);
  const smallerTableSize = validGroupCount ? Math.floor(interviewCandidateCount / numericGroupCount) : 0;
  const largerTableCount = validGroupCount ? interviewCandidateCount % numericGroupCount : 0;
  const smallerTableCount = validGroupCount ? numericGroupCount - largerTableCount : 0;
  const tableDistribution = !interviewCandidateCount
    ? "No candidates have advanced into Coffee Chats yet."
    : !validGroupCount
      ? `Choose between 1 and ${interviewCandidateCount} tables.`
      : largerTableCount === 0
        ? `${smallerTableSize} candidate${smallerTableSize === 1 ? "" : "s"} per table.`
        : `${largerTableCount} table${largerTableCount === 1 ? "" : "s"} of ${smallerTableSize + 1} · ${smallerTableCount} table${smallerTableCount === 1 ? "" : "s"} of ${smallerTableSize}.`;
  const roundActions = isResumeRound ? (
    <ActionButton
      label={editingRubric ? "Cancel edit" : "Edit rubric"}
      onClick={() => setEditingRubric((v) => !v)}
      disabled={busy}
    />
  ) : null;

  return (
    <div style={{
      border: `1px solid ${css.borderLight}`,
      borderRadius: 12,
      padding: 16,
      background: "var(--color-surface-subtle)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: css.textDark }}>{round.name}</span>
            <PhaseBadge phase={round.status} />
          </div>
          <p style={{ margin: 0, fontSize: 12, color: css.textGray }}>
            Type: {formatRoundTypeLabel(round.type)}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {isClosed ? (
            <ActionButton
              label={expanded ? "Hide details ↑" : "Show details ↓"}
              onClick={() => setExpanded((value) => !value)}
              disabled={busy}
            />
          ) : roundActions}
        </div>
      </div>

      {expanded ? (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${css.borderLight}` }}>
          <PhaseStepper
            round={round}
            busy={busy}
            issue={phaseIssue}
            onChangePhase={(phase) => onChangePhase(round, phase)}
          />
        </div>
      ) : null}

      {expanded && isClosed && roundActions ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", marginTop: 14, paddingTop: 14, borderTop: `1px solid ${css.borderLight}` }}>
          {roundActions}
        </div>
      ) : null}

      {expanded && isResumeRound && !editingRubric && round.rubricConfig ? (
        <p style={{ margin: "12px 0 0", fontSize: 12, color: css.textGray }}>
          Rubric configured for {RUBRIC_YEAR_KEYS.length} year groups · max {round.rubricConfig.maxPerCategory ?? 4} per category
        </p>
      ) : null}

      {expanded && isCoffeeChatRound ? (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${css.borderLight}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: css.textDark }}>Coffee Chat tables</div>
          <p style={{ margin: "4px 0 10px", fontSize: 12, color: css.textGray, lineHeight: 1.4 }}>
            Randomly divide every candidate advanced into this round. Running the split again replaces table assignments but keeps submitted ratings.
          </p>
          <div style={{ display: "flex", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 700, color: css.textGray }}>
              Number of tables
              <input
                type="number"
                min="1"
                max={Math.max(1, interviewCandidateCount)}
                step="1"
                value={interviewGroupCount}
                onChange={(event) => setInterviewGroupCount(event.target.value)}
                disabled={busy || !canManageTables(round.status)}
                style={{ width: 110, padding: "7px 8px", border: `1px solid ${css.borderLight}`, borderRadius: 6 }}
              />
            </label>
            <ActionButton
              label={round.interviewGroupCount > 1
                ? `Randomize ${interviewCandidateCount} candidates into ${validGroupCount ? numericGroupCount : "—"} tables`
                : `Split ${interviewCandidateCount} candidates into ${validGroupCount ? numericGroupCount : "—"} tables`}
              variant="primary"
              disabled={busy || !canManageTables(round.status) || !interviewCandidateCount || !validGroupCount}
              onClick={() => onAssignInterviewGroups(round.id, numericGroupCount, round.interviewGroupCount > 1)}
            />
            {!canManageTables(round.status) ? <span style={{ fontSize: 12, color: css.textGray }}>Tables can only be built while Coffee Chats are in setup or grading.</span> : null}
          </div>
          <p style={{ margin: "9px 0 0", fontSize: 12, fontWeight: 600, color: validGroupCount ? css.greenDark : css.textGray }}>
            {tableDistribution}
          </p>
        </div>
      ) : null}

      {expanded ? <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${css.borderLight}` }}>
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
      </div> : null}

      {expanded && isResumeRound && editingRubric ? (
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

function CycleCard({ cycle, busy, authedFetch, interviewPool, phaseIssues, onReload, onActivate, onArchive, onChangeRoundPhase, onSaveRubric, onSaveAutoDecisions, onAssignInterviewGroups }) {
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
        <div style={{ borderTop: `1px solid ${css.borderLight}`, padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 12, background: "var(--color-surface-subtle)" }}>
          <FormConfigPanel cycle={cycle} busy={busy} authedFetch={authedFetch} onSaved={onReload} />

          {(cycle.rounds || []).map((round) => (
            <RoundCard
              key={round.id}
              round={round}
              cycle={cycle}
              busy={busy}
              interviewPool={interviewPool}
              phaseIssue={phaseIssues?.[round.id] || null}
              onChangePhase={onChangeRoundPhase}
              onSaveRubric={onSaveRubric}
              onSaveAutoDecisions={onSaveAutoDecisions}
              onAssignInterviewGroups={onAssignInterviewGroups}
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
        <div style={{ borderTop: `1px solid ${css.borderLight}`, padding: "18px 22px 22px", background: "var(--color-surface-subtle)" }}>
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
  // Guard failures are per-round and render inside that round's card, so they
  // stay next to the thing the admin has to fix.
  const [phaseIssues, setPhaseIssues] = useState({});
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
  const activeRound = activeCycle?.rounds?.find((round) => isOpenPhase(round.status)) || null;
  const activeCoffeeChatRound = normalizeRoundType(activeRound?.type) === ROUND_TYPES.COFFEE_CHAT
    ? activeRound
    : null;
  const interviewPoolQuery = useQuery({
    queryKey: qk.interviewCandidates(),
    queryFn: async () => {
      const res = await authedFetch(`${API}/interviews/candidates`);
      return readJsonOrThrow(res, "loading the Coffee Chat pool", "Check GET /interviews/candidates in server/src/routes/interviewRoutes.js");
    },
    enabled: Boolean(activeCoffeeChatRound),
    staleTime: STALE.dashboard,
  });
  const interviewPool = activeCoffeeChatRound ? {
    roundId: activeCoffeeChatRound.id,
    candidateCount: interviewPoolQuery.data?.candidates?.length
      ?? (Number(activeCycle?.rounds?.find((round) => round.sortOrder < activeCoffeeChatRound.sortOrder)?.decisionCounts?.advance) || 0),
  } : null;

  const changeRoundPhase = useCallback(async (round, phase) => {
    setBusy(true);
    setActionError(null);

    const postPhase = (confirm) => authedFetch(`${API}/rounds/${round.id}/phase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase, confirm }),
    });

    try {
      let res = await postPhase(false);
      let payload = res.ok ? null : await res.json().catch(() => null);

      // Warnings are overridable, hard blockers are not. Ask once, then retry
      // with the admin's consent attached.
      if (!res.ok && payload?.requiresConfirmation && !(payload.blockers || []).length) {
        const prompt = payload.warnings?.[0]?.message || payload.error;
        if (!window.confirm(`${prompt}\n\nContinue anyway?`)) {
          setPhaseIssues((prev) => ({ ...prev, [round.id]: null }));
          return;
        }
        res = await postPhase(true);
        payload = res.ok ? null : await res.json().catch(() => null);
      }

      if (!res.ok) {
        // The body is already consumed, so build the fallback message here
        // rather than handing the response to formatResponseError.
        if (!payload?.error) {
          throw new Error(`Could not change the round phase (HTTP ${res.status}).`);
        }
        setPhaseIssues((prev) => ({ ...prev, [round.id]: payload }));
        return;
      }

      setPhaseIssues((prev) => ({ ...prev, [round.id]: null }));
      await reloadCycles();
      await queryClient.invalidateQueries({ queryKey: qk.interviewCandidates() });
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  }, [authedFetch, reloadCycles, queryClient]);

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

      <div style={{ maxWidth: 1360, margin: "0 auto", width: "100%", boxSizing: "border-box", padding: "24px 32px 40px" }}>
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
              }} style={{ border: "none", borderRadius: 7, padding: "9px 14px", background: selected ? css.greenDark : "transparent", color: selected ? "var(--color-on-primary)" : css.textGray, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
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
            {activeCycle.rounds?.find((r) => isOpenPhase(r.status)) ? (
              <> · <strong>Open round:</strong> {activeCycle.rounds.find((r) => isOpenPhase(r.status)).name}</>
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
              color: "var(--color-on-primary)",
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
                interviewPool={cycle.id === activeCycleId ? interviewPool : null}
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
                phaseIssues={phaseIssues}
                onChangeRoundPhase={changeRoundPhase}
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
                onAssignInterviewGroups={(roundId, groupCount, replacing) => runAction(async () => {
                  if (replacing && !window.confirm("Randomize the Coffee Chat tables again? Existing ratings will stay attached to candidates.")) return;
                  const res = await authedFetch(`${API}/interviews/groups`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ round_id: roundId, group_count: groupCount }),
                  });
                  if (!res.ok) {
                    throw await formatResponseError(res, "creating Coffee Chat tables");
                  }
                  await queryClient.invalidateQueries({ queryKey: qk.interviewCandidates() });
                })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
