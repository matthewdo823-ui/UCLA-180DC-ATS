import { useEffect, useRef, useState } from "react";
import { API } from "../../constants/config";
import { css } from "../../theme/colors";

const iconBtnStyle = (active, disabled, accent) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  padding: 0,
  borderRadius: 6,
  border: `1px solid ${active ? accent : css.borderLight}`,
  background: active ? `${accent}14` : "transparent",
  color: disabled ? css.textGray : accent,
  fontSize: 14,
  lineHeight: 1,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.45 : 1,
});

export default function CandidateSignalActions({
  candidateId,
  resumeId,
  flaggedByMe = false,
  referredByMe = false,
  authedFetch,
  onUpdated,
  dark = false,
}) {
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const wrapRef = useRef(null);

  const canAct = Boolean(candidateId || resumeId);
  const muted = dark ? "#8FA3B8" : css.textGray;
  const panelBg = dark ? "#0B1628" : "#FFF";
  const panelBorder = dark ? "rgba(255,255,255,0.12)" : css.borderLight;
  const panelText = dark ? "#E8EEF4" : css.textDark;

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(null);
        setNote("");
        setError("");
      }
    }
    function onKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(null);
        setNote("");
        setError("");
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function openPopover(type) {
    if (!canAct) return;
    if (type === "flag" && flaggedByMe) return;
    if (type === "refer" && referredByMe) return;
    setOpen(type);
    setNote("");
    setError("");
  }

  async function submit() {
    if (!open || !canAct) return;
    setBusy(true);
    setError("");

    const body = {
      resume_id: resumeId,
      candidate_id: candidateId || undefined,
    };
    const isFlag = open === "flag";
    if (isFlag) body.reason = note.trim() || "Flagged from scoreboard";
    else body.note = note.trim() || null;

    try {
      const res = await authedFetch(`${API}/${isFlag ? "candidate-flags" : "candidate-referrals"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || `Could not ${isFlag ? "flag" : "refer"} candidate`);
      }

      onUpdated?.({
        resumeId,
        candidateId,
        type: open,
        flagCount: json.flagCount,
        referralCount: json.referralCount,
        flaggedByMe: json.flaggedByMe ?? flaggedByMe,
        referredByMe: json.referredByMe ?? referredByMe,
      });
      setOpen(null);
      setNote("");
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", display: "inline-flex", gap: 4, alignItems: "center" }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        title={flaggedByMe ? "You flagged this candidate" : "Flag for admin review"}
        disabled={!canAct || flaggedByMe}
        onClick={() => openPopover("flag")}
        style={iconBtnStyle(open === "flag", !canAct || flaggedByMe, css.amber)}
        aria-label="Flag candidate"
      >
        ⚑
      </button>
      <button
        type="button"
        title={referredByMe ? "You referred this candidate" : "Refer this candidate"}
        disabled={!canAct || referredByMe}
        onClick={() => openPopover("refer")}
        style={iconBtnStyle(open === "refer", !canAct || referredByMe, css.greenDark)}
        aria-label="Refer candidate"
      >
        ★
      </button>

      {open ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 30,
            width: 240,
            padding: 12,
            borderRadius: 8,
            border: `1px solid ${panelBorder}`,
            background: panelBg,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: panelText, marginBottom: 8 }}>
            {open === "flag" ? "Flag candidate" : "Refer candidate"}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 300))}
            placeholder={open === "flag" ? "Reason (optional)" : "Why are you referring them? (optional)"}
            rows={3}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "8px 10px",
              borderRadius: 6,
              border: `1px solid ${panelBorder}`,
              background: dark ? "#141F33" : "#F9FAFB",
              color: panelText,
              fontSize: 12,
              resize: "none",
              fontFamily: "'DM Sans', sans-serif",
            }}
          />
          {error ? (
            <div style={{ marginTop: 8, fontSize: 11, color: css.red, fontWeight: 600 }}>{error}</div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={() => {
                setOpen(null);
                setNote("");
                setError("");
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: `1px solid ${panelBorder}`,
                background: "transparent",
                color: muted,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "none",
                background: open === "flag" ? css.amber : css.greenDark,
                color: open === "flag" ? css.textDark : "#FFF",
                fontSize: 11,
                fontWeight: 700,
                cursor: busy ? "wait" : "pointer",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? "Saving…" : open === "flag" ? "Flag" : "Refer"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CandidateSignalBadges({ flagCount = 0, referralCount = 0, dark = false }) {
  if (!flagCount && !referralCount) return null;

  const badgeBase = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.02em",
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
      {flagCount > 0 ? (
        <span
          style={{
            ...badgeBase,
            background: "rgba(239,159,39,0.12)",
            color: dark ? "#F5C060" : "#B45309",
            border: "1px solid rgba(239,159,39,0.28)",
          }}
          title={`${flagCount} open flag${flagCount === 1 ? "" : "s"}`}
        >
          ⚑ {flagCount}
        </span>
      ) : null}
      {referralCount > 0 ? (
        <span
          style={{
            ...badgeBase,
            background: "rgba(40,98,65,0.12)",
            color: dark ? "#6EE7B8" : css.greenDark,
            border: "1px solid rgba(40,98,65,0.24)",
          }}
          title={`${referralCount} referral${referralCount === 1 ? "" : "s"}`}
        >
          ★ {referralCount}
        </span>
      ) : null}
    </div>
  );
}
