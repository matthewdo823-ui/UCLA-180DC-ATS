import { useEffect, useRef } from "react";
import { useAuthedFetch } from "../auth/AuthContext";
import { API } from "../constants/config";

// The server holds a served resume for 5 minutes (CLAIM_LEASE_SECONDS). While
// the grader is interacting with the page we renew it every minute; once they
// stop, renewals stop and the resume frees itself for other graders.
const HEARTBEAT_MS = 60 * 1000;
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"];

/**
 * Keep this grader's claim on `resumeId` alive while they are active.
 * `onLost` runs when the server reports another grader now holds it.
 *
 * @param {{ kind: "resume"|"frq", resumeId: string|null, onLost: () => void }} args
 */
export function useReviewClaimHeartbeat({ kind, resumeId, onLost }) {
  const authedFetch = useAuthedFetch();
  const onLostRef = useRef(onLost);
  onLostRef.current = onLost;

  useEffect(() => {
    if (!resumeId) return undefined;

    let cancelled = false;
    let inFlight = false;
    let activeSinceBeat = false;
    // The claim was just taken when this resume was served.
    let lastBeatAt = Date.now();

    async function beat() {
      if (inFlight) return;
      inFlight = true;
      activeSinceBeat = false;
      lastBeatAt = Date.now();
      try {
        const res = await authedFetch(`${API}/review-claims/renew`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, resume_id: resumeId }),
        });
        if (!res.ok) return;
        const { held } = await res.json();
        if (!cancelled && held === false) onLostRef.current?.();
      } catch (e) {
        console.warn("Could not renew review claim:", e);
      } finally {
        inFlight = false;
      }
    }

    function markActive() {
      if (document.visibilityState !== "visible") return;
      activeSinceBeat = true;
      // Coming back after going idle: confirm the hold right away rather than
      // on the next tick, so a lost resume is swapped before they start on it.
      if (Date.now() - lastBeatAt > HEARTBEAT_MS * 2) beat();
    }

    const interval = setInterval(() => {
      if (activeSinceBeat && document.visibilityState === "visible") beat();
    }, HEARTBEAT_MS);

    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, markActive, { capture: true, passive: true });
    }
    document.addEventListener("visibilitychange", markActive);

    return () => {
      cancelled = true;
      clearInterval(interval);
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, markActive, { capture: true });
      }
      document.removeEventListener("visibilitychange", markActive);
    };
  }, [authedFetch, kind, resumeId]);
}
