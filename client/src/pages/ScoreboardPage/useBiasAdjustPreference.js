import { useEffect, useState } from "react";

const STORAGE_KEY = "ats:scoreboard:bias-adjust";

export function useBiasAdjustPreference() {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {
      // Storage restrictions must not prevent toggling scores in the current view.
    }
  }, [enabled]);

  return [enabled, setEnabled];
}
