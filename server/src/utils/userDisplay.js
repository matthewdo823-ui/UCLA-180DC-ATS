function getUserName(user = {}) {
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || null;
}

function serializeUser(user) {
  if (!user) return null;

  return {
    user_id: user.user_id,
    email: user.email,
    role: user.role,
    account_status: user.account_status,
    first_name: user.first_name,
    last_name: user.last_name,
    created_at: user.created_at,
    last_login: user.last_login,
    approved_at: user.approved_at,
    approved_by: user.approved_by,
    deactivated_at: user.deactivated_at,
    deactivated_by: user.deactivated_by,
  };
}

module.exports = {
  getUserName,
  serializeUser,
};
