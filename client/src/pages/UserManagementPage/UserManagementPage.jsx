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
  { value: "admin", label: "Admin" },
];

function roleBadgeStyle(role) {
  switch (role) {
    case "admin":
      return { background: "rgba(29,158,117,0.12)", color: css.greenDark, border: "1px solid rgba(29,158,117,0.28)" };
    case "member":
      return { background: "rgba(91,163,224,0.12)", color: "#4A7FB8", border: "1px solid rgba(91,163,224,0.28)" };
    default:
      return { background: "rgba(107,114,128,0.1)", color: css.textGray, border: `1px solid ${css.borderLight}` };
  }
}

function RoleBadge({ role }) {
  return (
    <span style={{
      ...roleBadgeStyle(role),
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 700,
      padding: "4px 10px",
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      {role}
    </span>
  );
}

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const authedFetch = useAuthedFetch();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [pendingRoles, setPendingRoles] = useState({});
  const [saveNotice, setSaveNotice] = useState("");
  // Separate from the load error so a failed save doesn't clobber (or get
  // clobbered by) the query's own error state.
  const [saveError, setSaveError] = useState(null);

  const usersQuery = useQuery({
    queryKey: qk.users(),
    queryFn: async () => {
      const res = await authedFetch(`${API}/users`);
      return readJsonOrThrow(res, "loading users", "Check GET /users in server/src/routes/userRoutes.js");
    },
    staleTime: STALE.dashboard,
  });

  const users = usersQuery.data?.users ?? [];
  const loading = usersQuery.isPending;
  const error = saveError || usersQuery.error;

  const staffCount = useMemo(
    () => users.filter((u) => u.role === "admin" || u.role === "member").length,
    [users]
  );

  const changedUsers = useMemo(
    () => users.filter((user) => pendingRoles[user.user_id] && pendingRoles[user.user_id] !== user.role),
    [pendingRoles, users]
  );

  async function handleSaveAll() {
    if (!changedUsers.length || saving) return;

    try {
      setSaving(true);
      setSaveError(null);
      setSaveNotice("");
      const savedIds = [];

      for (const user of changedUsers) {
        const nextRole = pendingRoles[user.user_id];
        const res = await authedFetch(`${API}/users/${user.user_id}/role`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: nextRole }),
        });

        if (!res.ok) {
          throw await formatResponseError(res, nextRole === "applicant" ? "removing a team member" : "updating user roles");
        }

        const data = await res.json();
        queryClient.setQueryData(qk.users(), (old) =>
          old ? { ...old, users: old.users.map((row) => (row.user_id === data.user.user_id ? data.user : row)) } : old
        );
        savedIds.push(user.user_id);
      }

      setPendingRoles((prev) => {
        const next = { ...prev };
        savedIds.forEach((id) => delete next[id]);
        return next;
      });
      setSaveNotice(`Saved ${savedIds.length} team ${savedIds.length === 1 ? "change" : "changes"}.`);
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  }

  function toggleRemoval(user) {
    if (user.user_id === currentUser?.user_id || user.role === "applicant") return;
    setSaveNotice("");
    setPendingRoles((prev) => {
      const next = { ...prev };
      if (next[user.user_id] === "applicant") delete next[user.user_id];
      else next[user.user_id] = "applicant";
      return next;
    });
  }

  return (
    <div style={{ minHeight: "100%", background: css.pageBg, fontFamily: "'DM Sans', sans-serif" }}>
      <Topbar phaseLabel="Admin · User management" activeLabel="Roles" rightSlot={<></>} />

      <div style={{ padding: "28px 32px 40px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ ...pageTitleStyle, margin: "0 0 8px" }}>
            Team roles
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: css.textGray, lineHeight: 1.5 }}>
            Assign member or admin access to registered users. Applicants cannot use the ATS until promoted.
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <div style={statCardStyle}>
            <span style={statLabelStyle}>Total users</span>
            <span style={statValueStyle}>{users.length}</span>
          </div>
          <div style={statCardStyle}>
            <span style={statLabelStyle}>Staff</span>
            <span style={statValueStyle}>{staffCount}</span>
          </div>
        </div>

        {error && (
          <ErrorBanner
            error={error}
            onDismiss={saveError ? () => setSaveError(null) : undefined}
            onRetry={usersQuery.isError ? () => usersQuery.refetch() : undefined}
            style={{ marginBottom: 16 }}
          />
        )}
        {saveNotice ? (
          <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(29,158,117,0.25)", background: "rgba(29,158,117,0.08)", color: css.greenDark, fontSize: 13, fontWeight: 600 }}>
            {saveNotice}
          </div>
        ) : null}

        <div style={{
          background: css.cardWhite,
          border: `1px solid ${css.borderLight}`,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
        }}>
          {loading ? (
            <PageLoader />
          ) : error ? (
            <div style={{ padding: 40, textAlign: "center", color: css.textGray, fontSize: 14 }}>
              <p style={{ margin: "0 0 12px" }}>Could not load the user list.</p>
              <button
                type="button"
                onClick={() => usersQuery.refetch()}
                style={{
                  border: `1px solid ${css.borderLight}`,
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  background: "#FFF",
                  color: css.textDark,
                }}
              >
                Retry
              </button>
            </div>
          ) : users.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: css.textGray, fontSize: 14 }}>
              No users found.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${css.borderLight}`, background: "#FAFBFA" }}>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Current role</th>
                  <th style={thStyle}>Last login</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Team access</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const pendingRole = pendingRoles[user.user_id];
                  const pendingRemoval = pendingRole === "applicant" && user.role !== "applicant";
                  const selectedRole = pendingRemoval
                    ? user.role
                    : pendingRole
                    ?? (user.role === "member" || user.role === "admin" ? user.role : "");
                  const isSelf = user.user_id === currentUser?.user_id;

                  return (
                    <tr key={user.user_id} style={{ borderBottom: `1px solid ${css.borderLight}`, background: pendingRemoval ? "rgba(197,48,48,0.05)" : "transparent" }}>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 600, color: css.textDark }}>{displayName(user)}</span>
                      </td>
                      <td style={tdStyle}>{user.email}</td>
                      <td style={tdStyle}><RoleBadge role={user.role} /></td>
                      <td style={{ ...tdStyle, color: css.textGray, fontSize: 13 }}>{formatDate(user.last_login, { fallback: "Never", style: "datetime" })}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <select
                            value={selectedRole}
                            disabled={saving || pendingRemoval}
                            onChange={(e) => {
                              setSaveNotice("");
                              setPendingRoles((prev) => ({ ...prev, [user.user_id]: e.target.value }));
                            }}
                            style={{
                              border: `1px solid ${css.borderLight}`,
                              borderRadius: 8,
                              padding: "8px 10px",
                              fontSize: 13,
                              color: css.textDark,
                              background: "#FFF",
                              cursor: saving || pendingRemoval ? "not-allowed" : "pointer",
                              opacity: pendingRemoval ? 0.55 : 1,
                            }}
                          >
                            {user.role === "applicant" && (
                              <option value="" disabled>Select role</option>
                            )}
                            {ASSIGNABLE_ROLES.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          {pendingRemoval ? (
                            <span style={{ color: css.red, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>Will remove</span>
                          ) : null}
                          {user.role !== "applicant" ? (
                            <button
                              type="button"
                              disabled={saving || isSelf}
                              onClick={() => toggleRemoval(user)}
                              title={isSelf ? "You cannot remove your own account from this pane" : pendingRemoval ? "Undo removal" : "Remove from team"}
                              aria-label={pendingRemoval ? `Undo removal of ${displayName(user)}` : `Remove ${displayName(user)} from team`}
                              style={{
                                width: 34,
                                height: 34,
                                display: "grid",
                                placeItems: "center",
                                border: "1px solid rgba(197,48,48,0.28)",
                                borderRadius: 8,
                                background: pendingRemoval ? "rgba(197,48,48,0.13)" : "rgba(197,48,48,0.06)",
                                color: css.red,
                                cursor: saving || isSelf ? "not-allowed" : "pointer",
                                opacity: isSelf ? 0.35 : 1,
                              }}
                            >
                              {pendingRemoval ? "↶" : "🗑"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!loading && users.length > 0 ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "14px 18px", borderTop: `1px solid ${css.borderLight}`, background: "#FAFBFA" }}>
              <span style={{ color: changedUsers.length ? css.textDark : css.textGray, fontSize: 12, fontWeight: 600 }}>
                {changedUsers.length ? `${changedUsers.length} unsaved ${changedUsers.length === 1 ? "change" : "changes"}` : "No unsaved changes"}
              </span>
              <button
                type="button"
                disabled={!changedUsers.length || saving}
                onClick={handleSaveAll}
                style={{
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 18px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: !changedUsers.length || saving ? "not-allowed" : "pointer",
                  background: changedUsers.length ? css.greenDark : "#E5E7EB",
                  color: changedUsers.length ? "#FFF" : css.textGray,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Saving changes…" : "Save changes"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const thStyle = {
  textAlign: "left",
  padding: "14px 18px",
  fontSize: 11,
  fontWeight: 700,
  color: css.textGray,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
};

const tdStyle = {
  padding: "16px 18px",
  fontSize: 14,
  verticalAlign: "middle",
};

const statCardStyle = {
  background: css.cardWhite,
  border: `1px solid ${css.borderLight}`,
  borderRadius: 10,
  padding: "14px 18px",
  minWidth: 120,
};

const statLabelStyle = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: css.textGray,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 4,
};

const statValueStyle = {
  fontSize: 22,
  fontWeight: 700,
  color: css.textDark,
};
