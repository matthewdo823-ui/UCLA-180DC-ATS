import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthedFetch } from "../../auth/AuthContext";
import { API } from "../../constants/config";
import { css } from "../../theme/colors";
import Topbar from "../../components/Topbar/Topbar";
import { sansFont } from "../../theme/typography";
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
  const authedFetch = useAuthedFetch();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [pendingRoles, setPendingRoles] = useState({});

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await authedFetch(`${API}/users`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load users");
      }
      const data = await res.json();
      setUsers(data.users || []);
      setPendingRoles({});
    } catch (err) {
      setError(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const staffCount = useMemo(
    () => users.filter((u) => u.role === "admin" || u.role === "member").length,
    [users]
  );

  async function handleSaveRole(user) {
    const nextRole = pendingRoles[user.user_id];
    if (!nextRole || nextRole === user.role) return;

    try {
      setSavingId(user.user_id);
      setError("");
      const res = await authedFetch(`${API}/users/${user.user_id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update role");
      }

      const data = await res.json();
      setUsers((prev) => prev.map((u) => (u.user_id === data.user.user_id ? data.user : u)));
      setPendingRoles((prev) => {
        const next = { ...prev };
        delete next[user.user_id];
        return next;
      });
    } catch (err) {
      setError(err.message || "Failed to update role");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div style={{ minHeight: "100%", background: css.pageBg, fontFamily: "'DM Sans', sans-serif" }}>
      <Topbar phaseLabel="Admin · User management" activeLabel="Roles" rightSlot={<></>} />

      <div style={{ padding: "28px 32px 40px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: sansFont, fontSize: 28, fontWeight: 500, color: "#111", margin: "0 0 8px" }}>
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
          <div style={{
            marginBottom: 16,
            padding: "12px 14px",
            borderRadius: 8,
            background: "rgba(226,75,74,0.08)",
            border: "1px solid rgba(226,75,74,0.22)",
            color: "#C0392B",
            fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <div style={{
          background: css.cardWhite,
          border: `1px solid ${css.borderLight}`,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
        }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: css.textGray, fontSize: 14 }}>
              Loading users...
            </div>
          ) : error ? (
            <div style={{ padding: 40, textAlign: "center", color: css.textGray, fontSize: 14 }}>
              <p style={{ margin: "0 0 12px" }}>Could not load the user list.</p>
              <button
                type="button"
                onClick={loadUsers}
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
                  <th style={{ ...thStyle, textAlign: "right" }}>Assign role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const selectedRole = pendingRoles[user.user_id]
                    ?? (user.role === "member" || user.role === "admin" ? user.role : "");
                  const hasChange = Boolean(selectedRole) && selectedRole !== user.role;
                  const isSaving = savingId === user.user_id;

                  return (
                    <tr key={user.user_id} style={{ borderBottom: `1px solid ${css.borderLight}` }}>
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
                            disabled={isSaving}
                            onChange={(e) => setPendingRoles((prev) => ({ ...prev, [user.user_id]: e.target.value }))}
                            style={{
                              border: `1px solid ${css.borderLight}`,
                              borderRadius: 8,
                              padding: "8px 10px",
                              fontSize: 13,
                              color: css.textDark,
                              background: "#FFF",
                              cursor: isSaving ? "not-allowed" : "pointer",
                            }}
                          >
                            {user.role === "applicant" && (
                              <option value="" disabled>Select role</option>
                            )}
                            {ASSIGNABLE_ROLES.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={!hasChange || isSaving}
                            onClick={() => handleSaveRole(user)}
                            style={{
                              border: "none",
                              borderRadius: 8,
                              padding: "8px 14px",
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: !hasChange || isSaving ? "not-allowed" : "pointer",
                              background: hasChange ? css.greenDark : "#E5E7EB",
                              color: hasChange ? "#FFF" : css.textGray,
                              opacity: isSaving ? 0.7 : 1,
                            }}
                          >
                            {isSaving ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
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
