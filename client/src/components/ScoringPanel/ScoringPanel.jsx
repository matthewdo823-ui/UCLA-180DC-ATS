import { css } from "../../theme/colors";
import { RUBRIC_MAX_PER_CATEGORY } from "../../constants/config";
import { getRubricMaxScore } from "../../utils/rubric";
import MetricRow from "./MetricRow";
import ActionBtn from "./ActionBtn";

export default function ScoringPanel({
  rubric,
  scores,
  onScore,
  notes,
  onNotes,
  onAction,
  onReset,
  scoringComplete = true,
  submitError = "",
}) {
  if (!rubric || !rubric.metrics?.length) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: css.textGray, fontSize: 13 }}>
        No rubric configured for this candidate year.
      </div>
    );
  }

  const maxPerCategory = rubric.maxPerCategory || RUBRIC_MAX_PER_CATEGORY;
  const maxScore = getRubricMaxScore(rubric);
  const total = rubric.metrics.reduce((sum, m) => sum + (Number(scores[m]) || 0), 0);
  const scoredCount = rubric.metrics.filter((m) => {
    const v = Number(scores[m]);
    return Number.isFinite(v) && v >= 1 && v <= maxPerCategory;
  }).length;
  const scoreColor = total >= maxScore * 0.75 ? css.greenDark : total >= maxScore * 0.5 ? css.amber : css.red;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", paddingBottom: 16, scrollbarWidth: "thin", scrollbarColor: `${css.borderLight} transparent` }}>
      {rubric.imageUrl ? (
        <div
          style={{
            background: css.cardWhite,
            border: `1px solid ${css.borderLight}`,
            borderRadius: 12,
            padding: "12px 14px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: css.greenDark, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8 }}>
            {rubric.label} rubric
          </div>
          <img
            src={rubric.imageUrl}
            alt={`${rubric.label} scoring rubric`}
            style={{ width: "100%", height: "auto", display: "block", borderRadius: 8, border: `1px solid ${css.borderLight}` }}
          />
        </div>
      ) : null}

      <div style={{ background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 12, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: css.greenDark, letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>⚖️</span>
            SCORING RUBRIC
          </div>
          <span style={{ fontSize: 11, color: css.textGray, fontWeight: 500 }}>Rate 1–{maxPerCategory} per category</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {rubric.metrics.map(m => (
            <MetricRow key={m} metric={m} value={scores[m]} onScore={onScore} maxScore={maxPerCategory} />
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", background: css.cardWhite, borderRadius: 12, border: `1px solid ${css.borderLight}`, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 32, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: scoreColor, lineHeight: 1 }}>{total}</span>
            <span style={{ fontSize: 14, color: css.textGray, fontFamily: "'DM Mono', monospace" }}>/ {maxScore}</span>
          </div>
          <div style={{ fontSize: 11, color: css.textGray, fontWeight: 500 }}>
            Categories scored <span style={{ fontWeight: 700, color: css.textDark }}>{scoredCount}</span> / {rubric.metrics.length}
          </div>
        </div>
        <div style={{ fontSize: 10, color: css.textGray, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 }}>Aggregate Score</div>

        <div style={{ height: 6, background: css.bgLight, borderRadius: 3, overflow: "hidden", marginTop: 12 }}>
          <div style={{ height: "100%", width: "100%", background: scoreColor, transformOrigin: "left", transform: `scaleX(${maxScore ? total / maxScore : 0})`, transition: "transform 0.3s ease" }} />
        </div>
      </div>

      <div style={{ background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 12, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: css.greenDark, letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>📝</span>
            NOTES
          </div>
          <span style={{ fontSize: 11, color: css.textGray, fontWeight: 500, fontFamily: "'DM Mono', monospace" }}>{notes.length} / 300</span>
        </div>
        <textarea
          value={notes}
          onChange={e => onNotes(e.target.value.slice(0, 300))}
          placeholder="Add notes about this candidate — strengths, flags, notable context..."
          style={{ width: "100%", height: 80, padding: "12px 14px", background: "#F9FAFB", border: `1px solid ${css.borderLight}`, borderRadius: 8, color: css.textDark, fontSize: 13, fontFamily: "'DM Sans', sans-serif", resize: "none", outline: "none", boxSizing: "border-box" }}
        />
      </div>

      {submitError ? (
        <div style={{ padding: "10px 14px", background: "rgba(220,38,38,0.06)", border: `1px solid rgba(220,38,38,0.2)`, borderRadius: 8, color: css.red, fontSize: 13 }}>
          {submitError}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 12 }}>
        {onReset ? (
          <ActionBtn
            label="↺ Reset"
            style={{ borderColor: css.borderLight, color: css.textGray, bg: css.cardWhite, hoverBg: css.bgLight }}
            disabled={total === 0 && notes.length === 0}
            title="Clear all scores and notes for this resume"
            onClick={onReset}
          />
        ) : null}
        {[
          { type: "flag",   label: "⚑ Flag",    style: { borderColor: css.amber, color: css.amber, bg: css.cardWhite, hoverBg: "rgba(239,159,39,0.05)" } },
          { type: "pass",   label: "✓ Complete", style: { borderColor: css.greenDark, color: css.cardWhite, bg: css.greenDark, hoverBg: "#1F4E33" } },
        ].map(({ type, label, style }) => (
          <ActionBtn
            key={type}
            label={label}
            style={style}
            disabled={!scoringComplete}
            title={!scoringComplete ? `Rate each rubric category from 1 to ${maxPerCategory} first` : undefined}
            onClick={() => onAction(type)}
          />
        ))}
      </div>
    </div>
  );
}
