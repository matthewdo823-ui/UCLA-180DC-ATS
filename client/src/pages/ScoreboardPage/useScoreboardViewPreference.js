import { useEffect, useState } from "react";
import { defaultFilters, SORT_TABS } from "./scoreboardViewModel";

const STORAGE_PREFIX = "ats:scoreboard:view";
const DEFAULT_SORT = "performance_desc";
const REVIEW_FILTERS = new Set(["all", "0", "1", "1+", "2+"]);
const SCORE_FILTERS = new Set(["all", "top", "strong", "low", "pending"]);
const SIGNAL_FILTERS = new Set(["all", "referred", "flagged"]);
const SORT_OPTIONS = new Set(SORT_TABS.map((option) => option.id));

function storageKey(scope) {
  return `${STORAGE_PREFIX}:${scope}`;
}

function stringOrDefault(value, fallback) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function readPreference(scope) {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(scope)) || "null");
    const savedFilters = stored?.filters || {};
    return {
      filters: {
        ...defaultFilters,
        major: stringOrDefault(savedFilters.major, defaultFilters.major),
        year: stringOrDefault(savedFilters.year, defaultFilters.year),
        reviews: REVIEW_FILTERS.has(savedFilters.reviews) ? savedFilters.reviews : defaultFilters.reviews,
        scoreBand: SCORE_FILTERS.has(savedFilters.scoreBand) ? savedFilters.scoreBand : defaultFilters.scoreBand,
        signals: SIGNAL_FILTERS.has(savedFilters.signals) ? savedFilters.signals : defaultFilters.signals,
      },
      sortBy: SORT_OPTIONS.has(stored?.sortBy) ? stored.sortBy : DEFAULT_SORT,
    };
  } catch {
    return { filters: { ...defaultFilters }, sortBy: DEFAULT_SORT };
  }
}

/**
 * Keep the public scoreboard controls stable while a user opens a candidate profile
 * and returns. Committee-decision filters remain transient because they belong to a
 * particular deliberation view rather than the general scoreboard.
 */
export function useScoreboardViewPreference(scope = "active") {
  const [initialPreference] = useState(() => readPreference(scope));
  const [filters, setFilters] = useState(initialPreference.filters);
  const [sortBy, setSortBy] = useState(initialPreference.sortBy);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(scope), JSON.stringify({
        filters: {
          major: filters.major,
          year: filters.year,
          reviews: filters.reviews,
          scoreBand: filters.scoreBand,
          signals: filters.signals,
        },
        sortBy,
      }));
    } catch {
      // Storage restrictions must not prevent filters from working in the current view.
    }
  }, [filters.major, filters.reviews, filters.scoreBand, filters.signals, filters.year, scope, sortBy]);

  return [filters, setFilters, sortBy, setSortBy];
}
