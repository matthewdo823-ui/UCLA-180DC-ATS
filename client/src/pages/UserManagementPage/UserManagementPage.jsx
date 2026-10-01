import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, useAuthedFetch } from "../../auth/AuthContext";
import { readJsonOrThrow, STALE } from "../../lib/queryClient";
import { qk } from "../../lib/queryKeys";
import { API } from "../../constants/config";
import { css } from "../../theme/colors";
import Topbar from "../../components/Topbar/Topbar";
import PageLoader from "../../components/PageLoader";
import ErrorBanner from "../../components/ErrorBanner/ErrorBanner";
import { formatResponseError } from "../../utils/errors";
import { pageTitleStyle } from "../../theme/typography";
import { displayName, formatDate } from "../../utils/format";

const ASSIGNABLE_ROLES = [
  { value: "member", label: "Member" },
  { value: "board", label: "Board" },
  { value: "admin", label: "Admin" },
];

const FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "deactivated", label: "Inactive" },
];

function roleBadgeStyle(role) {
  switch (role) {
    case "admin":
      return { background: "rgba(29,158,117,0.12)", color: css.greenDark, border: "1px solid rgba(29,158,117,0.28)" };
    case "board":
      return { background: "rgba(155,89,182,0.12)", color: "#8E44AD", border: "1px solid rgba(155,89,182,0.28)" };
    case "member":
      return { background: "rgba(91,163,224,0.12)", color: "#4A7FB8", border: "1px solid rgba(91,163,224,0.28)" };
    default:
      return { background: "rgba(107,114,128,0.1)", color: css.textGray, border: `1px solid ${css.borderLight}` };
  }
}

function statusBadgeStyle(status) {
  switch (status) {
    case "active":
      return { background: "rgba(29,158,117,0.12)", color: css.greenDark, border: "1px solid rgba(29,158,117,0.28)" };
    case "pending":
      return { background: "rgba(239,159,39,0.12)", color: "#9A6200", border: "1px solid rgba(239,159,39,0.3)" };
    default:
      return { background: "rgba(226,75,74,0.09)", color: "#C0392B", border: "1px solid rgba(226,75,74,0.22)" };
  }
}

function Badge({ children, style }) {
  return <span style={{ ...badgeStyle, ...style }}>{children}</span>;
}

function ActionButton({ children, disabled = false, tone = "neutral", ...props }) {
  const colors = tone === "primary"
    ? { background: css.greenDark, color: "#FFF", border: `1px solid ${css.greenDark}` }
    : tone === "danger"
      ? { background: "#FFF", color: "#C0392B", border: "1px solid rgba(226,75,74,0.35)" }
      : { background: "#FFF", color: css.textDark, border: `1px solid ${css.borderLight}` };

  return (
    <button
      type="button"
      disabled={disabled}
      {...props}
      style={{
        ...actionButtonStyle,
        ...colors,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const authedFetch = useAuthedFetch();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(null);
  const [pendingRoles, setPendingRoles] = useState({});
  const [filter, setFilter] = useState("all");
  const [actionError, setActionError] = useState(null);
  const [notice, setNotice] = useState("");

  const usersQuery = useQuery({
    queryKey: qk.users(),
    queryFn: async () => {
      const res = await authedFetch(`${API}/users`);
      return readJsonOrThrow(res, "loading users", "Check GET /users in server/src/routes/userRoutes.js");
    },
    staleTime: STALE.dashboard,
  });

  const users = usersQuery.data?.users ?? [];
  const counts = useMemo(() => ({
    all: users.length,
    pending: users.filter((user) => user.account_status === "pending").length,
    active: users.filter((user) => user.account_status === "active").length,
    deactivated: users.filter((user) => user.account_status === "deactivated").length,
  }), [users]);
  const visibleUsers = useMemo(
    () => filter === "all" ? users : users.filter((user) => user.account_status === filter),
    [filter, users]
  );

  function updateCachedUser(updatedUser) {
    queryClient.setQueryData(qk.users(), (old) => old
      ? { ...old, users: old.users.map((user) => user.user_id === updatedUser.user_id ? updatedUser : user) }
      : old);
  }

  function removeCachedUser(userId) {
    queryClient.setQueryData(qk.users(), (old) => old
      ? { ...old, users: old.users.filter((user) => user.user_id !== userId) }
      : old);
  }

  function clearPendingRole(userId) {
    setPendingRoles((previous) => {
      const next = { ...previous };
      delete next[userId];
      return next;
    });
  }

  async function request(path, { method = "POST", body } = {}) {
    const res = await authedFetch(`${API}${path}`, {
      method,
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw await formatResponseError(res, "updating account access");
    return res.json().catch(() => ({}));
  }

  async function runAction(user, action, operation, successMessage) {
    try {
      setBusy({ userId: user.user_id, action });
      setActionError(null);
      setNotice("");
      await operation();
      setNotice(successMessage);
    } catch (error) {
      setActionError(error);
    } finally {
      setBusy(null);
    }
  }

  function handleSaveRole(user) {
    const role = pendingRoles[user.user_id];
    if (!role || role === user.role) return;
    runAction(user, "role", async () => {
      const data = await request(`/users/${user.user_id}/role`, { method: "PATCH", body: { role } });
      updateCachedUser(data.user);
      clearPendingRole(user.user_id);
    }, `Updated ${displayName(user)}'s role.`);
  }

  function handleApprove(user) {
    const role = pendingRoles[user.user_id];
    if (!role) {
      setActionError(new Error(`Choose a role before approving ${user.email}.`));
      return;
    }
    runAction(user, "approve", async () => {
      const data = await request(`/users/${user.user_id}/approve`, { body: { role } });
      updateCachedUser(data.user);
      clearPendingRole(user.user_id);
    }, `Approved ${displayName(user)} as ${role}.`);
  }

  function handleReject(user) {
    if (!window.confirm(`Reject and permanently remove the pending request from ${user.email}?`)) return;
    runAction(user, "reject", async () => {
      await request(`/users/${user.user_id}`, { method: "DELETE" });
      removeCachedUser(user.user_id);
      clearPendingRole(user.user_id);
    }, `Rejected ${displayName(user)}'s request.`);
  }

  function handleDeactivate(user) {
    if (!window.confirm(`Deactivate ${user.email}? They will immediately lose access to the ATS.`)) return;
    runAction(user, "deactivate", async () => {
      const data = await request(`/users/${user.user_id}/deactivate`);
      updateCachedUser(data.user);
    }, `Deactivated ${displayName(user)}.`);
  }

  function handleReactivate(user) {
    runAction(user, "reactivate", async () => {
      const data = await request(`/users/${user.user_id}/reactivate`);
      updateCachedUser(data.user);
    }, `Reactivated ${displayName(user)}.`);
  }

  return (
    <div style={{ minHeight: "100%", background: css.pageBg, fontFamily: "'DM Sans', sans-serif" }}>
      <Topbar phaseLabel="Admin · User management" activeLabel="Access" rightSlot={<></>} />

      <div style={{ padding: "28px 32px 40px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ ...pageTitleStyle, margin: "0 0 8px" }}>Team access</h1>
          <p style={{ margin: 0, fontSize: 14, color: css.textGray, lineHeight: 1.5 }}>
            Approve new requests, assign staff roles, and deactivate accounts that should no longer use the ATS.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {FILTERS.map((item) => {
            const selected = filter === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                style={{
                  ...statCardStyle,
                  borderColor: selected ? css.greenDark : css.borderLight,
                  boxShadow: selected ? `0 0 0 1px ${css.greenDark}` : "none",
                  cursor: "pointer",
                }}
              >
                <span style={statLabelStyle}>{item.label}</span>
                <span style={statValueStyle}>{counts[item.value]}</span>
              </button>
            );
          })}
        </div>

        {usersQuery.error && (
          <ErrorBanner error={usersQuery.error} onRetry={() => usersQuery.refetch()} style={{ marginBottom: 16 }} />
        )}
        {actionError && (
          <ErrorBanner error={actionError} onDismiss={() => setActionError(null)} style={{ marginBottom: 16 }} />
        )}
        {notice && <div style={noticeStyle}>{notice}</div>}

        <div style={tableCardStyle}>
          {usersQuery.isPending ? (
            <PageLoader />
          ) : usersQuery.error ? (
            <div style={{ padding: 40, textAlign: "center", color: css.textGray, fontSize: 14 }}>
              Could not load the user list.
            </div>
          ) : visibleUsers.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: css.textGray, fontSize: 14 }}>
              No {filter === "all" ? "users" : `${filter} accounts`} found.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${css.borderLight}`, background: "#FAFBFA" }}>
                    <th style={thStyle}>Person</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Current role</th>
                    <th style={thStyle}>Last login</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Access controls</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((user) => {
                    const status = user.account_status || "active";
                    const selectedRole = pendingRoles[user.user_id]
                      ?? (["member", "board", "admin"].includes(user.role) ? user.role : "");
                    const roleChanged = Boolean(selectedRole) && selectedRole !== user.role;
                    const isBusy = busy?.userId === user.user_id;
                    const isCurrentUser = currentUser?.user_id === user.user_id;

                    return (
                      <tr key={user.user_id} style={{ borderBottom: `1px solid ${css.borderLight}` }}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600, color: css.textDark }}>{displayName(user)}</div>
                          <div style={{ color: css.textGray, fontSize: 12, marginTop: 2 }}>{user.email}</div>
                        </td>
                        <td style={tdStyle}>
                          <Badge style={statusBadgeStyle(status)}>{status === "deactivated" ? "inactive" : status}</Badge>
                        </td>
                        <td style={tdStyle}><Badge style={roleBadgeStyle(user.role)}>{user.role}</Badge></td>
                        <td style={{ ...tdStyle, color: css.textGray, fontSize: 13 }}>
                          {formatDate(user.last_login, { fallback: "Never", style: "datetime" })}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                            {status !== "deactivated" && (
                              <select
                                aria-label={`Role for ${user.email}`}
                                value={selectedRole}
                                disabled={isBusy}
                                onChange={(event) => setPendingRoles((previous) => ({ ...previous, [user.user_id]: event.target.value }))}
                                style={selectStyle}
                              >
                                {!selectedRole && <option value="">Select role</option>}
                                {ASSIGNABLE_ROLES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                              </select>
                            )}

                            {status === "pending" && <>
                              <ActionButton tone="primary" disabled={!selectedRole || isBusy} onClick={() => handleApprove(user)}>
                                {busy?.action === "approve" && isBusy ? "Approving…" : "Approve"}
                              </ActionButton>
                              <ActionButton tone="danger" disabled={isBusy} onClick={() => handleReject(user)}>
                                {busy?.action === "reject" && isBusy ? "Rejecting…" : "Reject"}
                              </ActionButton>
                            </>}

                            {status === "active" && <>
                              <ActionButton tone="primary" disabled={!roleChanged || isBusy} onClick={() => handleSaveRole(user)}>
                                {busy?.action === "role" && isBusy ? "Saving…" : "Save role"}
                              </ActionButton>
                              <ActionButton
                                tone="danger"
                                disabled={isBusy || isCurrentUser}
                                title={isCurrentUser ? "You cannot deactivate your own account" : ""}
                                onClick={() => handleDeactivate(user)}
                              >
                                {busy?.action === "deactivate" && isBusy ? "Deactivating…" : "Deactivate"}
                              </ActionButton>
                            </>}

                            {status === "deactivated" && (
                              <ActionButton tone="primary" disabled={isBusy} onClick={() => handleReactivate(user)}>
                                {busy?.action === "reactivate" && isBusy ? "Reactivating…" : "Reactivate"}
                              </ActionButton>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const badgeStyle = {
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  padding: "4px 10px",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const thStyle = {
  textAlign: "left",
  padding: "14px 18px",
  fontSize: 11,
  fontWeight: 700,
  color: css.textGray,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
};

const tdStyle = { padding: "16px 18px", fontSize: 14, verticalAlign: "middle" };
const statCardStyle = { appearance: "none", textAlign: "left", background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 10, padding: "12px 18px", minWidth: 120 };
const statLabelStyle = { display: "block", fontSize: 11, fontWeight: 700, color: css.textGray, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 };
const statValueStyle = { fontSize: 22, fontWeight: 700, color: css.textDark };
const tableCardStyle = { background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" };
const selectStyle = { border: `1px solid ${css.borderLight}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, color: css.textDark, background: "#FFF" };
const actionButtonStyle = { borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" };
const noticeStyle = { marginBottom: 16, padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(29,158,117,0.25)", background: "rgba(29,158,117,0.08)", color: css.greenDark, fontSize: 13, fontWeight: 600 };
