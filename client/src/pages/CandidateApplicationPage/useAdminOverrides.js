import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthedFetch } from "../../auth/AuthContext";
import { API } from "../../constants/config";

export default function useAdminOverrides(resumeId, enabled = true) {
  const authedFetch = useAuthedFetch();
  const fetchRef = useRef(authedFetch);
  fetchRef.current = authedFetch;

  const [override, setOverride] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const id = String(resumeId || "").trim();

  // Fetch on mount / resumeId change
  useEffect(() => {
    let cancelled = false;
    if (!enabled || !id) {
      setOverride(null);
      setLoading(false);
      setError("");
      return undefined;
    }

    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetchRef.current(
          `${API}/scoreboard/${encodeURIComponent(id)}/application/admin-override`
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error || "Failed to load admin override");
        }
        if (!cancelled) setOverride(json.override);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Failed to load admin override");
          setOverride(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [enabled, id]);

  const save = useCallback(
    async ({ adminNotes, overrideScore }) => {
      if (!id) {
        setSaveError("Missing application id");
        return null;
      }

      setSaving(true);
      setSaveError("");
      try {
        const body = {};
        if (adminNotes !== undefined) body.adminNotes = adminNotes;
        if (overrideScore !== undefined) body.overrideScore = overrideScore;

        const res = await fetchRef.current(
          `${API}/scoreboard/${encodeURIComponent(id)}/application/admin-override`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error || "Failed to save admin override");
        }
        setOverride(json.override);
        return json.override;
      } catch (err) {
        setSaveError(err?.message || "Failed to save admin override");
        return null;
      } finally {
        setSaving(false);
      }
    },
    [id]
  );

  return {
    override,
    loading,
    error,
    saving,
    saveError,
    save,
  };
}
