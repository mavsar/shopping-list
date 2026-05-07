import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useLocation } from "react-router-dom";

import { AppShell } from "./layouts/AppShell";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { ListDetailsPage } from "./pages/ListDetailsPage";
import { ListsPage } from "./pages/ListsPage";
import { LoginPage } from "./pages/LoginPage";
import type { AuthUser } from "./types/auth";
import { tokenStorageKey } from "./ui/constants";

export default function App() {
  const location = useLocation();
  const [token, setToken] = useState<string>(() => localStorage.getItem(tokenStorageKey) ?? "");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authError, setAuthError] = useState("");
  const [authChecking, setAuthChecking] = useState<boolean>(() => Boolean(localStorage.getItem(tokenStorageKey)));

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

  function handleLoginSuccess(newToken: string, user: AuthUser) {
    setToken(newToken);
    localStorage.setItem(tokenStorageKey, newToken);
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

    localStorage.removeItem(tokenStorageKey);
    setToken("");
    setAuthUser(null);
    setAuthChecking(false);
  }

  return (
    <AppShell>
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
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
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}
