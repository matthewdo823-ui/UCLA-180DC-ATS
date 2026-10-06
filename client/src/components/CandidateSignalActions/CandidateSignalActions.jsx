import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { API } from "../../constants/config";
import { css } from "../../theme/colors";

const MIN_NOTE_LENGTH = 20;
const PANEL_WIDTH = 240;
const PANEL_GAP = 6;

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
  const [panelPos, setPanelPos] = useState(null);
  const wrapRef = useRef(null);
  const panelRef = useRef(null);

  const canAct = Boolean(candidateId || resumeId);
  const muted = dark ? "#8FA3B8" : css.textGray;
  const panelBg = dark ? "#0B1628" : "var(--color-surface)";
  const panelBorder = dark ? "rgba(255,255,255,0.12)" : css.borderLight;
  const panelText = dark ? "#E8EEF4" : css.textDark;

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      const inWrap = wrapRef.current?.contains(event.target);
      const inPanel = panelRef.current?.contains(event.target);
      if (!inWrap && !inPanel) {
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

  // The popover is portaled to <body> so scroll/overflow containers (e.g. the
  // scoreboard card) can't clip it. Position it under the buttons, or above
  // them when there isn't room below.
  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      return undefined;
    }
    function place() {
      const anchor = wrapRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const panelHeight = panelRef.current?.offsetHeight || 0;
      const below = anchor.bottom + PANEL_GAP;
      const fitsBelow = below + panelHeight <= window.innerHeight - 8;
      const top = fitsBelow ? below : Math.max(8, anchor.top - PANEL_GAP - panelHeight);
      const left = Math.min(
        Math.max(8, anchor.right - PANEL_WIDTH),
        window.innerWidth - PANEL_WIDTH - 8,
      );
      setPanelPos((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, error]);

  function openPopover(type) {
    if (!canAct) return;
    if (type === "flag" && flaggedByMe) return;
    if (type === "refer" && referredByMe) return;
    setOpen(type);
    setNote("");
    setError("");
  }

  const trimmedNote = note.trim();
  const noteTooShort = trimmedNote.length < MIN_NOTE_LENGTH;

  async function submit() {
    if (!open || !canAct || noteTooShort) return;
    setBusy(true);
    setError("");

    const body = {
      resume_id: resumeId,
      candidate_id: candidateId || undefined,
    };
    const isFlag = open === "flag";
    if (isFlag) body.reason = trimmedNote;
    else body.note = trimmedNote;

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

      {open ? createPortal(
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            top: panelPos?.top ?? 0,
            left: panelPos?.left ?? 0,
            visibility: panelPos ? "visible" : "hidden",
            zIndex: 1000,
            width: PANEL_WIDTH,
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
            onKeyDown={(e) => {
              // Enter submits; Shift+Enter still inserts a newline.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (!busy) submit();
              }
            }}
            autoFocus
            placeholder={open === "flag" ? "Reason (required, min 20 characters)" : "Why are you referring them? (required, min 20 characters)"}
            rows={3}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "8px 10px",
              borderRadius: 6,
              border: `1px solid ${panelBorder}`,
              background: dark ? "#141F33" : "var(--color-surface-subtle)",
              color: panelText,
              fontSize: 12,
              resize: "none",
              fontFamily: "'DM Sans', sans-serif",
            }}
          />
          <div style={{ marginTop: 4, fontSize: 10, fontWeight: 600, color: noteTooShort ? css.amber : css.textGray }}>
            {trimmedNote.length}/{MIN_NOTE_LENGTH} characters minimum
          </div>
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
              disabled={busy || noteTooShort}
              onClick={submit}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "none",
                background: open === "flag" ? css.amber : css.greenDark,
                color: open === "flag" ? css.textDark : "var(--color-on-primary)",
                fontSize: 11,
                fontWeight: 700,
                cursor: busy || noteTooShort ? "not-allowed" : "pointer",
                opacity: busy || noteTooShort ? 0.5 : 1,
              }}
            >
              {busy ? "Saving…" : open === "flag" ? "Flag" : "Refer"}
            </button>
          </div>
        </div>,
        document.body,
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
            color: dark ? "#F5C060" : "var(--color-warning-text)",
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
