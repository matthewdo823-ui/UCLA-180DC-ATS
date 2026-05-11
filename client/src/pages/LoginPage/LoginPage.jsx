import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { css } from "../../theme/colors";

export default function LoginPage() {
  const { login, user, loading, isStaff } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = location.state?.from?.pathname || "/";

  useEffect(() => {
    if (loading || !user) return;
    navigate(isStaff ? redirectTo : "/no-access", { replace: true });
  }, [isStaff, loading, navigate, redirectTo, user]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const loggedInUser = await login({ email, password });
      const canAccessApp = loggedInUser?.role === "admin" || loggedInUser?.role === "member";
      navigate(canAccessApp ? redirectTo : "/no-access", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

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
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#FFF",
          border: `1px solid ${css.borderLight}`,
          borderRadius: 18,
          boxShadow: "0 18px 60px rgba(17, 24, 39, 0.08)",
          padding: 32,
        }}
      >
        <div style={{ width: 48, height: 48, borderRadius: 14, background: css.greenDark, color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 22 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <path d="M4 22h16" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
          </svg>
        </div>

        <h1 style={{ fontSize: 26, margin: "0 0 8px", letterSpacing: "-0.03em" }}>Sign in</h1>
        <p style={{ fontSize: 14, color: css.textGray, marginBottom: 28 }}>
          Use your ATS account to access resume screening.
        </p>

        <label style={labelStyle} htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          style={inputStyle}
          placeholder="you@example.com"
        />

        <label style={{ ...labelStyle, marginTop: 16 }} htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          style={inputStyle}
          placeholder="Password"
        />

        {error && (
          <div style={{ marginTop: 16, color: css.red, background: "rgba(226,75,74,0.08)", border: "1px solid rgba(226,75,74,0.18)", borderRadius: 10, padding: "10px 12px", fontSize: 13 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: "100%",
            marginTop: 24,
            border: "none",
            borderRadius: 10,
            background: submitting ? "#86A492" : css.greenDark,
            color: "#FFF",
            padding: "14px 16px",
            fontSize: 15,
            fontWeight: 700,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontSize: 13,
  fontWeight: 700,
  color: css.textDark,
  marginBottom: 8,
};

const inputStyle = {
  width: "100%",
  border: `1px solid ${css.borderLight}`,
  borderRadius: 10,
  padding: "13px 14px",
  fontSize: 14,
  color: css.textDark,
  outline: "none",
};
