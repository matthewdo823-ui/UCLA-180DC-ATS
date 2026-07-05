import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthedFetch } from "../../auth/AuthContext";
import { API } from "../../constants/config";

function buildOverrideMap(overrides) {
  const map = {};
  (overrides || []).forEach((row) => {
    if (row?.reviewId) map[row.reviewId] = row;
  });
  return map;
}

export default function useReviewOverrides(resumeId, enabled = true) {
  const authedFetch = useAuthedFetch();
  const fetchRef = useRef(authedFetch);
  fetchRef.current = authedFetch;

  const id = String(resumeId || "").trim();

  const [overrideByReviewId, setOverrideByReviewId] = useState({});
  const [loading, setLoading] = useState(Boolean(enabled && id));
  const [error, setError] = useState("");
  const [savingReviewId, setSavingReviewId] = useState(null);
  const [saveError, setSaveError] = useState("");

  const load = useCallback(async () => {
    if (!id) {
      setOverrideByReviewId({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetchRef.current(
        `${API}/scoreboard/${encodeURIComponent(id)}/review-overrides`
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Failed to load review overrides");
      }
      setOverrideByReviewId(buildOverrideMap(json.overrides));
    } catch (err) {
      setError(err?.message || "Failed to load review overrides");
      setOverrideByReviewId({});
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!enabled || !id) {
      setOverrideByReviewId({});
      setLoading(false);
      setError("");
      return undefined;
    }

    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();

    return () => { cancelled = true; };
  }, [enabled, id, load]);

  const save = useCallback(
    async ({ reviewId, adminNotes, overrideScores }) => {
      const reviewKey = String(reviewId || "").trim();
      if (!id || !reviewKey) {
        setSaveError("Missing review");
        return null;
      }

      setSavingReviewId(reviewKey);
      setSaveError("");
      try {
        const body = {};
        if (adminNotes !== undefined) body.adminNotes = adminNotes;
        if (overrideScores !== undefined) body.overrideScores = overrideScores;

        const res = await fetchRef.current(
          `${API}/scoreboard/${encodeURIComponent(id)}/review-overrides/${encodeURIComponent(reviewKey)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error || "Failed to save review override");
        }

        setOverrideByReviewId((prev) => {
          const next = { ...prev };
          if (json.override) {
            next[reviewKey] = json.override;
          } else {
            delete next[reviewKey];
          }
          return next;
        });
        return json.override;
      } catch (err) {
        setSaveError(err?.message || "Failed to save review override");
        return null;
      } finally {
        setSavingReviewId(null);
      }
    },
    [id]
  );

  return {
    overrideByReviewId,
    loading,
    error,
    savingReviewId,
    saveError,
    save,
    reload: load,
  };
}
