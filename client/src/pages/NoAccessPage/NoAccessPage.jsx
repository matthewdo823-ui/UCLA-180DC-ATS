import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { css } from "../../theme/colors";

export default function NoAccessPage() {
  const { user, logout, isStaff } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isStaff) navigate("/", { replace: true });
  }, [isStaff, navigate]);

  return (
    <div style={{
      minHeight: "100vh",
      background: css.bgLight,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      fontFamily: "'DM Sans', sans-serif",
      color: css.textDark,
    }}>
      <div style={{
        width: "100%",
        maxWidth: 480,
        background: "#FFF",
        border: `1px solid ${css.borderLight}`,
        borderRadius: 18,
        padding: 32,
        textAlign: "center",
        boxShadow: "0 18px 60px rgba(17, 24, 39, 0.08)",
      }}>
        <div style={{ fontSize: 13, color: css.textGray, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
          Access restricted
        </div>
        <h1 style={{ fontSize: 26, margin: "0 0 10px", letterSpacing: "-0.03em" }}>
          Your account cannot access the ATS yet.
        </h1>
        <p style={{ color: css.textGray, fontSize: 14, lineHeight: 1.6, marginBottom: 22 }}>
          {user?.email ? `${user.email} is signed in as ${user.role}.` : "This account does not have a staff role."}
          {" "}Only admin and member accounts can view resume screening pages right now.
        </p>
        <button
          type="button"
          onClick={logout}
          style={{
            border: "none",
            borderRadius: 10,
            background: css.greenDark,
            color: "#FFF",
            padding: "12px 18px",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
