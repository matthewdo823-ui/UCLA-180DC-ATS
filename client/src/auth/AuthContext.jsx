import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { API } from "../constants/config";
import { isStaffRole } from "../utils/auth";
import { queryClient } from "../lib/queryClient";
import { clearDriveFileCache } from "../utils/driveFileCache";
import { clearHeadshotUrlCache } from "../utils/headshotUrl";
import { clearResumeFileCache } from "../utils/resumeFiles";
import { formatNetworkError, formatResponseError } from "../utils/errors";

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
    clearHeadshotUrlCache();
    clearResumeFileCache();
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
      throw formatNetworkError(
        err,
        "signing into your account",
        "Check if backend is running (cd server && npm run dev)."
      );
    }

    if (!res.ok) {
      if (res.status === 401) {
        const error = new Error("Invalid email or password");
        error.status = 401;
        throw error;
      }
      throw await formatResponseError(res, "signing in", "Check /auth/login credentials or server logs.");
    }

    const data = await res.json().catch(() => ({}));
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
      throw formatNetworkError(
        err,
        "creating your account",
        "Check if backend is running (cd server && npm run dev)."
      );
    }

    if (!res.ok) {
      throw await formatResponseError(res, "creating account", "Check /auth/register payload or server logs.");
    }

    const data = await res.json().catch(() => ({}));
    return data;
  }, []);

  const requestPasswordReset = useCallback(async (email) => {
    let res;
    try {
      res = await fetch(`${API}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch (err) {
      throw formatNetworkError(err, "requesting password reset", "Is backend server running?");
    }

    if (!res.ok) {
      throw await formatResponseError(res, "requesting password reset");
    }

    const data = await res.json().catch(() => ({}));
    return data.message;
  }, []);

  const resetPassword = useCallback(async ({ token, password }) => {
    let res;
    try {
      res = await fetch(`${API}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
    } catch (err) {
      throw formatNetworkError(err, "resetting password", "Is backend server running?");
    }

    if (!res.ok) {
      throw await formatResponseError(res, "resetting password");
    }

    const data = await res.json().catch(() => ({}));
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
