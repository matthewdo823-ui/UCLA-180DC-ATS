import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthedFetch } from "../../auth/AuthContext";
import { API } from "../../constants/config";
import { readJsonOrThrow, STALE } from "../../lib/queryClient";
import { qk } from "../../lib/queryKeys";
import { css } from "../../theme/colors";
import Topbar from "../../components/Topbar/Topbar";
import PageLoader from "../../components/PageLoader";
import { pageTitleStyle } from "../../theme/typography";

const CANDIDATE_FILTERS = [
  { value: "all", label: "All" },
  { value: "unassigned", label: "Unassigned" },
  { value: "assigned", label: "Assigned" },
  { value: "pending", label: "Pending" },
];

function matchesCandidateFilter(candidate, filter) {
  if (filter === "unassigned") return candidate.assignedCount === 0;
  if (filter === "assigned") return candidate.assignedCount > 0;
  if (filter === "pending") return candidate.pendingCount > 0;
  return true;
}

function matchesSearch(candidate, term) {
  if (!term) return true;
  const haystack = [candidate.name, candidate.year, candidate.major]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(term);
}

function useSelection() {
  const [selected, setSelected] = useState(() => new Set());

  const toggle = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setMany = useCallback((ids, shouldSelect) => {
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (shouldSelect ? next.add(id) : next.delete(id)));
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  return { selected, toggle, setMany, clear };
}

export default function AssignmentsPage() {
  const authedFetch = useAuthedFetch();
  const queryClient = useQueryClient();
  // Separate from the query's load error so a failed assign doesn't wipe the board.
  const [mutationError, setMutationError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [candidateFilter, setCandidateFilter] = useState("all");

  const candidateSelection = useSelection();
  const graderSelection = useSelection();

  const boardQuery = useQuery({
    queryKey: qk.assignments(),
    queryFn: async () => {
      const res = await authedFetch(`${API}/assignments`);
      return readJsonOrThrow(res, "Failed to load assignments");
    },
    staleTime: STALE.dashboard,
  });

  const board = boardQuery.data ?? null;
  const loading = boardQuery.isPending;
  const error = mutationError
    || (boardQuery.error ? (boardQuery.error.message || "Failed to load assignments") : "");

  // Mutations refetch by expiring the cache entry rather than hand-rolling a reload.
  const reloadBoard = useCallback(
    () => queryClient.invalidateQueries({ queryKey: qk.assignments() }),
    [queryClient]
  );

  const candidates = board?.candidates || [];
  const graders = board?.graders || [];

  const visibleCandidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    return candidates.filter(
      (candidate) => matchesCandidateFilter(candidate, candidateFilter) && matchesSearch(candidate, term)
    );
  }, [candidates, candidateFilter, search]);

  const selectedCandidateIds = useMemo(
    () => [...candidateSelection.selected],
    [candidateSelection.selected]
  );
  const selectedGraderIds = useMemo(() => [...graderSelection.selected], [graderSelection.selected]);
  const pairCount = selectedCandidateIds.length * selectedGraderIds.length;

  const allVisibleSelected =
    visibleCandidates.length > 0 &&
    visibleCandidates.every((candidate) => candidateSelection.selected.has(candidate.resumeId));

  async function submitAssignment(method) {
    if (!pairCount || saving) return;

    try {
      setSaving(true);
      setMutationError("");
      setNotice("");

      const res = await authedFetch(`${API}/assignments`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeIds: selectedCandidateIds, graderIds: selectedGraderIds }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update assignments");

      if (method === "POST") {
        const skipped = data.skipped ? ` (${data.skipped} already assigned)` : "";
        setNotice(`Assigned ${data.created || 0} candidate–grader pairs${skipped}.`);
      } else {
        setNotice(`Removed ${data.removed || 0} assignments.`);
      }

      candidateSelection.clear();
      graderSelection.clear();
      await reloadBoard();
    } catch (err) {
      setMutationError(err.message || "Failed to update assignments");
    } finally {
      setSaving(false);
    }
  }

  async function removeAssignment(assignmentId) {
    try {
      setMutationError("");
      setNotice("");
      const res = await authedFetch(`${API}/assignments/${encodeURIComponent(assignmentId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to remove assignment");
      }
      await reloadBoard();
    } catch (err) {
      setMutationError(err.message || "Failed to remove assignment");
    }
  }

  return (
    <div style={{ minHeight: "100%", background: css.bgLight, fontFamily: "'DM Sans', sans-serif" }}>
      <Topbar
        phaseLabel={board?.context?.cycle?.name ? `Admin · ${board.context.cycle.name}` : "Admin · Assignments"}
        activeLabel="Assignments"
        rightSlot={<></>}
      />

      <div style={{ padding: "28px 32px 40px", maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ ...pageTitleStyle, margin: "0 0 8px" }}>
            Grading assignments
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: css.textGray, lineHeight: 1.5, maxWidth: 720 }}>
            Pin specific candidates to specific graders. Assigned candidates are served first in the
            screener; once a grader clears their assignments they drop back into the shared priority
            queue automatically.
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <StatCard label="Candidates" value={board?.stats?.candidates ?? 0} />
          <StatCard label="Graders" value={board?.stats?.graders ?? 0} />
          <StatCard label="Assignments" value={board?.stats?.assignments ?? 0} />
          <StatCard label="Pending" value={board?.stats?.pendingAssignments ?? 0} />
        </div>

        {error && <Banner tone="error">{error}</Banner>}
        {notice && <Banner tone="success">{notice}</Banner>}

        {loading ? (
          <PageLoader />
        ) : !board ? (
          <div style={{ ...cardStyle, padding: 40, textAlign: "center", color: css.textGray, fontSize: 14 }}>
            <p style={{ margin: "0 0 12px" }}>Could not load the assignment board.</p>
            <button type="button" onClick={() => boardQuery.refetch()} style={secondaryButtonStyle}>Retry</button>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)", gap: 16 }}>
              <section style={{ ...cardStyle, display: "flex", flexDirection: "column", minHeight: 420 }}>
                <div style={panelHeaderStyle}>
                  <div>
                    <span style={panelTitleStyle}>Candidates</span>
                    <span style={panelCountStyle}>
                      {candidateSelection.selected.size} of {visibleCandidates.length} selected
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      candidateSelection.setMany(
                        visibleCandidates.map((candidate) => candidate.resumeId),
                        !allVisibleSelected
                      )
                    }
                    style={secondaryButtonStyle}
                  >
                    {allVisibleSelected ? "Clear shown" : "Select all shown"}
                  </button>
                </div>

                <div style={{ display: "flex", gap: 8, padding: "12px 16px", flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, year, or major"
                    style={{
                      flex: "1 1 220px",
                      border: `1px solid ${css.borderLight}`,
                      borderRadius: 8,
                      padding: "9px 12px",
                      fontSize: 13,
                      color: css.textDark,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  />
                  {CANDIDATE_FILTERS.map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setCandidateFilter(filter.value)}
                      style={chipStyle(candidateFilter === filter.value)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                <div style={{ flex: 1, overflowY: "auto", maxHeight: 460, borderTop: `1px solid ${css.borderLight}` }}>
                  {visibleCandidates.length === 0 ? (
                    <div style={{ padding: 32, textAlign: "center", color: css.textGray, fontSize: 13 }}>
                      No candidates match this filter.
                    </div>
                  ) : (
                    visibleCandidates.map((candidate) => {
                      const checked = candidateSelection.selected.has(candidate.resumeId);
                      return (
                        <label
                          key={candidate.resumeId}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            padding: "12px 16px",
                            borderBottom: `1px solid ${css.borderLight}`,
                            cursor: "pointer",
                            background: checked ? "rgba(40,98,65,0.05)" : "transparent",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => candidateSelection.toggle(candidate.resumeId)}
                            style={{ width: 16, height: 16, cursor: "pointer", accentColor: css.greenDark }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: css.textDark }}>
                              {candidate.name}
                            </div>
                            <div style={{ fontSize: 12, color: css.textGray, marginTop: 2 }}>
                              {[candidate.year, candidate.major].filter(Boolean).join(" · ") || "—"}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                            <span style={metaPillStyle}>{candidate.reviewCount} reviews</span>
                            {candidate.assignedCount > 0 && (
                              <span style={{ ...metaPillStyle, ...assignedPillStyle }}>
                                {candidate.pendingCount > 0
                                  ? `${candidate.pendingCount} pending`
                                  : `${candidate.assignedCount} done`}
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </section>

              <section style={{ ...cardStyle, display: "flex", flexDirection: "column", minHeight: 420 }}>
                <div style={panelHeaderStyle}>
                  <div>
                    <span style={panelTitleStyle}>Graders</span>
                    <span style={panelCountStyle}>
                      {graderSelection.selected.size} of {graders.length} selected
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      graderSelection.setMany(
                        graders.map((grader) => grader.id),
                        graderSelection.selected.size !== graders.length
                      )
                    }
                    style={secondaryButtonStyle}
                  >
                    {graderSelection.selected.size === graders.length ? "Clear all" : "Select all"}
                  </button>
                </div>

                <div style={{ flex: 1, overflowY: "auto", maxHeight: 520, borderTop: `1px solid ${css.borderLight}` }}>
                  {graders.length === 0 ? (
                    <div style={{ padding: 32, textAlign: "center", color: css.textGray, fontSize: 13 }}>
                      No graders yet. Promote users to member or admin first.
                    </div>
                  ) : (
                    graders.map((grader) => {
                      const checked = graderSelection.selected.has(grader.id);
                      return (
                        <label
                          key={grader.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            padding: "12px 16px",
                            borderBottom: `1px solid ${css.borderLight}`,
                            cursor: "pointer",
                            background: checked ? "rgba(40,98,65,0.05)" : "transparent",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => graderSelection.toggle(grader.id)}
                            style={{ width: 16, height: 16, cursor: "pointer", accentColor: css.greenDark }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: css.textDark }}>{grader.name}</div>
                            <div style={{ fontSize: 12, color: css.textGray, marginTop: 2 }}>{grader.email}</div>
                          </div>
                          <span style={{ ...metaPillStyle, ...(grader.pendingCount ? assignedPillStyle : {}) }}>
                            {grader.pendingCount} pending
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </section>
            </div>

            <div
              style={{
                ...cardStyle,
                marginTop: 16,
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: css.textDark }}>
                  {selectedCandidateIds.length} candidates × {selectedGraderIds.length} graders
                </div>
                <div style={{ fontSize: 13, color: css.textGray, marginTop: 2 }}>
                  {pairCount
                    ? `${pairCount} assignments — every selected candidate goes to every selected grader.`
                    : "Select candidates and graders to assign in bulk."}
                </div>
              </div>
              <button
                type="button"
                disabled={!pairCount || saving}
                onClick={() => submitAssignment("DELETE")}
                style={{ ...secondaryButtonStyle, opacity: !pairCount || saving ? 0.5 : 1 }}
              >
                Unassign
              </button>
              <button
                type="button"
                disabled={!pairCount || saving}
                onClick={() => submitAssignment("POST")}
                style={{
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 20px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: !pairCount || saving ? "not-allowed" : "pointer",
                  background: pairCount ? css.greenDark : "#E5E7EB",
                  color: pairCount ? "#FFF" : css.textGray,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Working..." : "Assign"}
              </button>
            </div>

            <AssignmentTable
              graders={graders}
              assignments={board.assignments || []}
              candidates={candidates}
              onRemove={removeAssignment}
            />
          </>
        )}
      </div>
    </div>
  );
}

function AssignmentTable({ graders, assignments, candidates, onRemove }) {
  const candidateNames = useMemo(() => {
    const lookup = {};
    candidates.forEach((candidate) => {
      lookup[candidate.resumeId] = candidate.name;
    });
    return lookup;
  }, [candidates]);

  const byGrader = useMemo(() => {
    const groups = new Map(graders.map((grader) => [grader.id, { grader, rows: [] }]));
    assignments.forEach((row) => {
      const group = groups.get(row.graderId);
      if (group) group.rows.push(row);
    });
    return [...groups.values()].filter((group) => group.rows.length > 0);
  }, [graders, assignments]);

  if (!byGrader.length) {
    return (
      <div style={{ ...cardStyle, marginTop: 16, padding: 32, textAlign: "center", color: css.textGray, fontSize: 13 }}>
        No assignments yet. Everyone is grading from the shared priority queue.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      {byGrader.map(({ grader, rows }) => {
        const pending = rows.filter((row) => !row.completed).length;
        return (
          <div key={grader.id} style={{ ...cardStyle, overflow: "hidden" }}>
            <div style={{ ...panelHeaderStyle, borderBottom: `1px solid ${css.borderLight}` }}>
              <div>
                <span style={panelTitleStyle}>{grader.name}</span>
                <span style={panelCountStyle}>
                  {pending} pending · {rows.length - pending} completed
                </span>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "14px 16px" }}>
              {rows.map((row) => (
                <span
                  key={row.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    borderRadius: 999,
                    padding: "6px 8px 6px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    border: `1px solid ${row.completed ? "rgba(29,158,117,0.28)" : css.borderLight}`,
                    background: row.completed ? "rgba(29,158,117,0.10)" : "#FAFBFA",
                    color: row.completed ? "#1D7A5B" : css.textDark,
                  }}
                >
                  {row.completed ? "✓ " : ""}
                  {candidateNames[row.resumeId] || "Unknown candidate"}
                  <button
                    type="button"
                    onClick={() => onRemove(row.id)}
                    title="Remove assignment"
                    style={{
                      border: "none",
                      background: "transparent",
                      color: css.textGray,
                      cursor: "pointer",
                      fontSize: 14,
                      lineHeight: 1,
                      padding: "0 2px",
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ ...cardStyle, padding: "14px 18px", minWidth: 130 }}>
      <span
        style={{
          display: "block",
          fontSize: 11,
          fontWeight: 700,
          color: css.textGray,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 4,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 22, fontWeight: 700, color: css.textDark }}>{value}</span>
    </div>
  );
}

function Banner({ tone, children }) {
  const palette = tone === "error"
    ? { bg: "rgba(226,75,74,0.08)", border: "rgba(226,75,74,0.22)", color: "#C0392B" }
    : { bg: "rgba(29,158,117,0.08)", border: "rgba(29,158,117,0.22)", color: "#1D7A5B" };

  return (
    <div
      style={{
        marginBottom: 16,
        padding: "12px 14px",
        borderRadius: 8,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.color,
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}

const cardStyle = {
  background: css.cardWhite,
  border: `1px solid ${css.borderLight}`,
  borderRadius: 12,
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const panelHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "14px 16px",
};

const panelTitleStyle = {
  fontSize: 15,
  fontWeight: 700,
  color: css.textDark,
  marginRight: 10,
};

const panelCountStyle = {
  fontSize: 12,
  color: css.textGray,
};

const metaPillStyle = {
  borderRadius: 999,
  border: `1px solid ${css.borderLight}`,
  background: "#FAFBFA",
  color: css.textGray,
  fontSize: 11,
  fontWeight: 700,
  padding: "3px 9px",
  whiteSpace: "nowrap",
};

const assignedPillStyle = {
  border: "1px solid rgba(29,158,117,0.28)",
  background: "rgba(29,158,117,0.10)",
  color: "#1D7A5B",
};

const secondaryButtonStyle = {
  border: `1px solid ${css.borderLight}`,
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  background: "#FFF",
  color: css.textDark,
  fontFamily: "'DM Sans', sans-serif",
};

function chipStyle(active) {
  return {
    border: `1px solid ${active ? css.greenDark : css.borderLight}`,
    borderRadius: 999,
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    background: active ? css.greenDark : "#FFF",
    color: active ? "#FFF" : css.textGray,
    fontFamily: "'DM Sans', sans-serif",
  };
}
