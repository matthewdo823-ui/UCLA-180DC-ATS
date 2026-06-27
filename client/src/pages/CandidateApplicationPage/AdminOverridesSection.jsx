import { useEffect, useState } from "react";
import { css } from "../../theme/colors";
import { cardGreen, cardPale } from "./constants";
import SectionCard from "./components/SectionCard";
import useAdminOverrides from "./useAdminOverrides";

export default function AdminOverridesSection({ resumeId, onOverrideSaved }) {
  const { override, loading, saving, saveError, save } = useAdminOverrides(resumeId);

  const [notes, setNotes] = useState("");
  const [scoreStr, setScoreStr] = useState("");

  useEffect(() => {
    if (loading) return;
    setNotes(override?.adminNotes || "");
    setScoreStr(override?.overrideScore != null ? String(override.overrideScore) : "");
  }, [loading, override?.id, override?.adminNotes, override?.overrideScore]);

  const hasChanges = notes !== (override?.adminNotes || "") ||
    (scoreStr !== "" ? String(Number(scoreStr)) : "") !== (override?.overrideScore != null ? String(override.overrideScore) : "");

  const handleSave = async () => {
    const scoreNum = scoreStr.trim() !== "" ? Number(scoreStr) : null;
    const result = await save({ adminNotes: notes, overrideScore: scoreNum });
    if (result !== null && onOverrideSaved) {
      onOverrideSaved(result);
    }
  };

  const handleClear = async () => {
    setNotes("");
    setScoreStr("");
    const result = await save({ adminNotes: "", overrideScore: null });
    if (result === null && onOverrideSaved) {
      onOverrideSaved(null);
    }
  };

  if (loading) {
    return (
      <SectionCard title="Admin override">
        <p style={{ margin: 0, fontSize: 13, color: css.textGray }}>Loading…</p>
      </SectionCard>
    );
  }

  const isOverridden = override?.overrideScore != null;
  const lastUpdated = override?.updatedAt
    ? new Date(override.updatedAt).toLocaleString()
    : null;

  return (
    <SectionCard title="Admin override">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Score override */}
        <div>
          <p
            style={{
              margin: "0 0 6px",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: css.textGray,
            }}
          >
            Score override
          </p>
          <input
            type="number"
            min={0}
            max={100}
            step="any"
            value={scoreStr}
            onChange={(e) => setScoreStr(e.target.value)}
            placeholder="Override normalized score (0–100)"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${isOverridden ? "rgba(226,75,74,0.35)" : css.borderLight}`,
              background: isOverridden ? "#FFF8F8" : css.cardWhite,
              fontSize: 14,
              fontWeight: 600,
              color: isOverridden ? "#E24B4A" : css.textDark,
              outline: "none",
              boxSizing: "border-box",
              fontFamily: "'DM Mono', monospace",
            }}
          />
          {isOverridden && (
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#E24B4A", fontWeight: 600 }}>
              ⚠ Score overridden — replaces computed score on the scoreboard and application view.
            </p>
          )}
        </div>

        {/* Admin notes */}
        <div>
          <p
            style={{
              margin: "0 0 6px",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: css.textGray,
            }}
          >
            Admin notes
          </p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 5000))}
            placeholder="Private admin notes about this candidate — not visible to reviewers…"
            rows={5}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${css.borderLight}`,
              background: css.cardWhite,
              fontSize: 13,
              lineHeight: 1.5,
              color: css.textDark,
              outline: "none",
              resize: "vertical",
              boxSizing: "border-box",
              fontFamily: "'DM Sans', sans-serif",
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <span style={{ fontSize: 11, color: css.textGray, fontFamily: "'DM Mono', monospace" }}>
              {notes.length} / 5000
            </span>
            {lastUpdated && (
              <span style={{ fontSize: 11, color: css.textGray }}>
                Last saved {lastUpdated}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || saving}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              background: hasChanges ? cardGreen : css.borderLight,
              color: hasChanges ? cardPale : css.textGray,
              fontSize: 13,
              fontWeight: 700,
              cursor: hasChanges && !saving ? "pointer" : "default",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {saving ? "Saving…" : "Save override"}
          </button>
          {(override?.adminNotes || override?.overrideScore != null) && (
            <button
              type="button"
              onClick={handleClear}
              disabled={saving}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: `1px solid #E24B4A`,
                background: "transparent",
                color: "#E24B4A",
                fontSize: 12,
                fontWeight: 600,
                cursor: saving ? "default" : "pointer",
              }}
            >
              Clear all
            </button>
          )}
        </div>

        {saveError && (
          <p style={{ margin: 0, fontSize: 12, color: "#E24B4A" }}>{saveError}</p>
        )}
      </div>
    </SectionCard>
  );
}
