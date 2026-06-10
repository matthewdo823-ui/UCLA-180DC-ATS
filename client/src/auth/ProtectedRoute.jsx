import { Navigate, useLocation } from "react-router-dom";
import { css } from "../theme/colors";
import { normalizeRole } from "../utils/auth";
import { useAuth } from "./AuthContext";

const staffRoles = ["admin", "member"];

function LoadingSession() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: css.bgLight, color: css.textGray, fontFamily: "'DM Sans', sans-serif" }}>
      Checking session...
    </div>
  );
}

export default function ProtectedRoute({ children, allowedRoles = staffRoles }) {
  const { token, user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingSession />;

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!user || !allowedRoles.includes(normalizeRole(user.role))) {
    return <Navigate to="/no-access" replace />;
  }

  return children;
}
