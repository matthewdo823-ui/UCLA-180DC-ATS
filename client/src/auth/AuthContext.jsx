import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { API } from "../constants/config";
import { isStaffRole } from "../utils/auth";
import { queryClient } from "../lib/queryClient";
import { clearDriveFileCache } from "../utils/driveFileCache";

const TOKEN_STORAGE_KEY = "resume_screener_jwt";
const USER_STORAGE_KEY = "resume_screener_user";

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

function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeUser(user) {
  if (user) {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_STORAGE_KEY);
  }
}

function formatAuthError(err) {
  if (err instanceof TypeError && err.message === "Failed to fetch") {
    return new Error("Cannot reach the API server. Make sure the backend is running (cd server && npm start).");
  }
  return err;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(getStoredToken);
  const [user, setUser] = useState(getStoredUser);
  // Optimistic auth: if we have a cached identity, render immediately and verify
  // /auth/me in the background. Only show the blocking loader when we hold a token
  // but have no cached user to render with (e.g. first load after a fresh login on
  // another device, or cleared user cache).
  const [loading, setLoading] = useState(() => Boolean(getStoredToken()) && !getStoredUser());

  const logout = useCallback(() => {
    storeToken(null);
    storeUser(null);
    setToken(null);
    setUser(null);
    setLoading(false);
    // Cached responses were authorized for the session that just ended — drop
    // them so the next sign-in on this browser starts from the server.
    queryClient.clear();
    clearDriveFileCache();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      if (!token) {
        setLoading(false);
        setUser(null);
        return;
      }

      // Note: we don't force loading=true here. The initial state already blocks
      // when there's nothing cached; when a user is cached this runs as a silent
      // background revalidation so the app stays interactive on cold-server loads.
      try {
        const res = await fetch(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          throw new Error("Session expired");
        }

        const data = await res.json();
        if (!cancelled) {
          setUser(data.user);
          storeUser(data.user);
        }
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
    let res;
    try {
      res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    } catch (err) {
      throw formatAuthError(err);
    }
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Login failed");
    }

    storeToken(data.token);
    storeUser(data.user);
    setToken(data.token);
    setUser(data.user);

    return data.user;
  }, []);

  const createAccount = useCallback(async ({ email, password, first_name, last_name }) => {
    let res;
    try {
      res = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, first_name, last_name }),
      });
    } catch (err) {
      throw formatAuthError(err);
    }
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Account creation failed");
    }

    storeToken(data.token);
    storeUser(data.user);
    setToken(data.token);
    setUser(data.user);

    return data.user;
  }, []);

  const requestPasswordReset = useCallback(async (email) => {
    const res = await fetch(`${API}/auth/forgot-password`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not request a password reset");
    return data.message;
  }, []);

  const resetPassword = useCallback(async ({ token, password }) => {
    const res = await fetch(`${API}/auth/reset-password`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not reset password");
    return data.message;
  }, []);

  const value = useMemo(() => ({
    token,
    user,
    loading,
    login,
    createAccount,
    requestPasswordReset,
    resetPassword,
    logout,
    isStaff: isStaffRole(user?.role),
  }), [createAccount, loading, login, logout, requestPasswordReset, resetPassword, token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

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
