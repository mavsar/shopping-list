import { FormEvent, useState } from "react";
import { motion } from "motion/react";

import { Login } from "../components/lordicon/icons";
import { Button, Checkbox, Input } from "../components/ui";
import type { AuthResponse } from "../types/auth";

type LoginPageProps = {
  onLoginSuccess: (token: string, user: AuthResponse["user"], rememberMe: boolean) => void;
};

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [authError, setAuthError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setLoginLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password })
      });

      const payload = (await response.json()) as Partial<AuthResponse> & { error?: string };
      if (!response.ok || !payload.token || !payload.user) {
        throw new Error(payload.error ?? `Prijava ni uspela (status ${response.status}).`);
      }

      onLoginSuccess(payload.token, payload.user, rememberMe);
      setPassword("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Neznana napaka");
    } finally {
      setLoginLoading(false);
    }
  }

  return (
    <section className="grid min-h-[100svh] grid-cols-1 items-center py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.4 }}
        className="mx-auto w-full max-w-sm"
      >
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src="/logo-icon.svg" alt="" className="h-20 w-20 drop-shadow-[0_12px_20px_rgba(46,122,76,0.35)]" />
          <div>
            <h1 className="m-0 text-2xl font-semibold tracking-tight text-ink">Nakupovalni seznam</h1>
            <p className="m-0 mt-1 text-sm text-ink-muted">Skupni seznami in recepti za vso družino</p>
          </div>
        </div>

        <form
          className="grid gap-4 rounded-3xl border border-line bg-surface p-5 shadow-card"
          onSubmit={handleLogin}
        >
          <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
            Uporabniško ime
            <Input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="admin"
              autoComplete="username"
              autoCapitalize="none"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
            Geslo
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </label>
          <Checkbox checked={rememberMe} onCheckedChange={setRememberMe}>
            Zapomni si me na tej napravi
          </Checkbox>
          <Button type="submit" disabled={loginLoading} stretch size="lg" icon={<Login animateOnHover />}>
            {loginLoading ? "Prijavljam…" : "Prijava"}
          </Button>
          {authError ? <p className="m-0 text-sm text-tomato-deep">{authError}</p> : null}
        </form>
      </motion.div>
    </section>
  );
}
