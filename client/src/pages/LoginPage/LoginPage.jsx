import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import logo180 from "@images/180logo.webp";
import { useAuth } from "../../auth/AuthContext";
import { css } from "../../theme/colors";
import { isStaffRole } from "../../utils/auth";

export default function LoginPage() {
  const { login, createAccount, user, loading, isStaff } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState("login");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const requestedPath = location.state?.from?.pathname;
  const redirectTo = requestedPath && requestedPath !== "/login" && requestedPath !== "/no-access"
    ? requestedPath
    : "/";
  const isCreateMode = mode === "create";

  useEffect(() => {
    if (loading || !user) return;
    navigate(isStaff ? redirectTo : "/no-access", { replace: true });
  }, [isStaff, loading, navigate, redirectTo, user]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      if (isCreateMode && password !== confirmPassword) {
        throw new Error("Passwords do not match");
      }

      const loggedInUser = isCreateMode
        ? await createAccount({ email, password, first_name: firstName, last_name: lastName })
        : await login({ email, password });
      navigate(isStaffRole(loggedInUser?.role) ? redirectTo : "/no-access", { replace: true });
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
        <img
          src={logo180}
          alt="180 Degrees Consulting"
          style={{ width: 48, height: 48, objectFit: "contain", display: "block", marginBottom: 22, borderRadius: 14 }}
        />

        <h1 style={{ fontSize: 26, margin: "0 0 8px", letterSpacing: "-0.03em" }}>
          {isCreateMode ? "Create account" : "Sign in"}
        </h1>
        <p style={{ fontSize: 14, color: css.textGray, marginBottom: 28 }}>
          {isCreateMode
            ? "New accounts start as applicants until an admin updates their role."
            : "Log into your account to continue to the epic 180DC recruitment platform."}
        </p>

        {isCreateMode && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle} htmlFor="firstName">First name</label>
              <input
                id="firstName"
                type="text"
                autoComplete="given-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                style={inputStyle}
                placeholder="First"
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="lastName">Last name</label>
              <input
                id="lastName"
                type="text"
                autoComplete="family-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                style={inputStyle}
                placeholder="Last"
              />
            </div>
          </div>
        )}

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

        {isCreateMode && (
          <>
            <label style={{ ...labelStyle, marginTop: 16 }} htmlFor="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              style={inputStyle}
              placeholder="Confirm password"
            />
          </>
        )}

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
          {submitting ? (isCreateMode ? "Creating account..." : "Signing in...") : (isCreateMode ? "Create account" : "Sign in")}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(isCreateMode ? "login" : "create");
            setError("");
            setConfirmPassword("");
          }}
          style={{
            width: "100%",
            marginTop: 14,
            border: "none",
            background: "transparent",
            color: css.greenDark,
            padding: "8px 0",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {isCreateMode ? "Already have an account? Sign in" : "Create new account"}
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
