import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const API = "http://localhost:3000";
const TOKEN_STORAGE_KEY = "resume_screener_jwt";

const AuthContext = createContext(null);

function getStoredToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

function storeToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(getStoredToken);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));

  const logout = useCallback(() => {
    storeToken(null);
    setToken(null);
    setUser(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      if (!token) {
        setLoading(false);
        setUser(null);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          throw new Error("Session expired");
        }

        const data = await res.json();
        if (!cancelled) setUser(data.user);
      } catch (err) {
        console.warn("Could not load current user:", err);
        if (!cancelled) logout();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadUser();
    return () => {
      cancelled = true;
    };
  }, [logout, token]);

  const login = useCallback(async ({ email, password }) => {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Login failed");
    }

    storeToken(data.token);
    setToken(data.token);
    setUser(data.user);

    return data.user;
  }, []);

  const value = useMemo(() => ({
    token,
    user,
    loading,
    login,
    logout,
    isStaff: user?.role === "admin" || user?.role === "member",
  }), [loading, login, logout, token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuthedFetch() {
  const { token, logout } = useAuth();

  return useCallback(async (url, options = {}) => {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

    if (res.status === 401) logout();
    return res;
  }, [logout, token]);
}
