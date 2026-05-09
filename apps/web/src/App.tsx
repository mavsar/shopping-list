import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useLocation } from "react-router-dom";

import { AppShell } from "./layouts/AppShell";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { ListDetailsPage } from "./pages/ListDetailsPage";
import { ListsPage } from "./pages/ListsPage";
import { LoginPage } from "./pages/LoginPage";
import type { AuthUser } from "./types/auth";
import { rememberMeCookieKey, tokenStorageKey } from "./ui/constants";

function getCookieValue(name: string): string {
  const value = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
  return value ? decodeURIComponent(value) : "";
}

function setPermanentCookie(name: string, value: string): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax${secure}`;
}

function clearCookie(name: string): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
}

export default function App() {
  const location = useLocation();
  const [token, setToken] = useState<string>(
    () => getCookieValue(rememberMeCookieKey) || sessionStorage.getItem(tokenStorageKey) || localStorage.getItem(tokenStorageKey) || ""
  );
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authError, setAuthError] = useState("");
  const [authChecking, setAuthChecking] = useState<boolean>(
    () => Boolean(getCookieValue(rememberMeCookieKey) || sessionStorage.getItem(tokenStorageKey) || localStorage.getItem(tokenStorageKey))
  );

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`
    }),
    [token]
  );

  useEffect(() => {
    if (!token) {
      setAuthUser(null);
      setAuthChecking(false);
      return;
    }

    async function loadMe() {
      setAuthChecking(true);
      try {
        const response = await fetch("/api/auth/me", {
          headers: authHeaders
        });

        if (!response.ok) {
          setToken("");
          clearCookie(rememberMeCookieKey);
          sessionStorage.removeItem(tokenStorageKey);
          localStorage.removeItem(tokenStorageKey);
          setAuthUser(null);
          setAuthError("Session expired.");
          setAuthChecking(false);
          return;
        }

        const payload = (await response.json()) as { user: AuthUser };
        setAuthUser(payload.user);
      } catch {
        setAuthError("Unable to reach backend API.");
      } finally {
        setAuthChecking(false);
      }
    }

    void loadMe();
  }, [authHeaders, token]);

  function handleLoginSuccess(newToken: string, user: AuthUser, rememberMe: boolean) {
    setToken(newToken);
    if (rememberMe) {
      setPermanentCookie(rememberMeCookieKey, newToken);
      sessionStorage.removeItem(tokenStorageKey);
      localStorage.removeItem(tokenStorageKey);
    } else {
      clearCookie(rememberMeCookieKey);
      sessionStorage.setItem(tokenStorageKey, newToken);
      localStorage.removeItem(tokenStorageKey);
    }
    setAuthUser(user);
    setAuthError("");
    setAuthChecking(false);
  }

  async function handleLogout() {
    if (!token) {
      return;
    }

    await fetch("/api/auth/logout", {
      method: "POST",
      headers: authHeaders
    });

    clearCookie(rememberMeCookieKey);
    sessionStorage.removeItem(tokenStorageKey);
    localStorage.removeItem(tokenStorageKey);
    setToken("");
    setAuthUser(null);
    setAuthChecking(false);
  }

  return (
    <AppShell>
      <Routes location={location}>
        <Route
          path="/login"
          element={
            authChecking ? (
              <p className="mb-2 mt-0 text-sm text-slate-300">Checking session...</p>
            ) : authUser ? (
              <Navigate to="/" replace />
            ) : (
              <>
                {authError ? <p className="mb-2 mt-0 text-sm text-rose-300">{authError}</p> : null}
                <LoginPage onLoginSuccess={handleLoginSuccess} />
              </>
            )
          }
        />
        <Route
          path="/"
          element={
            authChecking ? (
              <p className="text-slate-300">Checking session...</p>
            ) : authUser ? (
              <ListsPage token={token} authUser={authUser} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/admin/users"
          element={
            authChecking ? (
              <p className="text-slate-300">Checking session...</p>
            ) : authUser?.isAdmin ? (
              <AdminUsersPage token={token} authUser={authUser} onLogout={handleLogout} />
            ) : (
              <Navigate to={authUser ? "/" : "/login"} replace />
            )
          }
        />
        <Route
          path="/lists/:listSlug"
          element={
            authChecking ? (
              <p className="text-slate-300">Checking session...</p>
            ) : authUser ? (
              <ListDetailsPage token={token} authUser={authUser} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to={authUser ? "/" : "/login"} replace />} />
      </Routes>
    </AppShell>
  );
}
