import { FormEvent, useState } from "react";
import { motion } from "motion/react";

import { Login } from "../components/lordicon/icons";
import { Button, Input } from "../components/ui";
import type { AuthResponse } from "../types/auth";

type LoginPageProps = {
  onLoginSuccess: (token: string, user: AuthResponse["user"]) => void;
};

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setLoginLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: username.trim(),
          password
        })
      });

      const payload = (await response.json()) as Partial<AuthResponse> & { error?: string };
      if (!response.ok || !payload.token || !payload.user) {
        throw new Error(payload.error ?? `Login failed with status ${response.status}`);
      }

      onLoginSuccess(payload.token, payload.user);
      setPassword("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setAuthError(message);
    } finally {
      setLoginLoading(false);
    }
  }

  return (
    <section className="grid min-h-[78vh] grid-cols-1 items-center">
      <motion.form
        initial={{ opacity: 0, x: 14, y: 10 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ delay: 0.12, duration: 0.45 }}
        className="relative mx-auto grid w-full max-w-sm gap-4 rounded-[2rem] border border-white/18 bg-slate-900/28 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_20px_60px_rgba(2,8,23,0.42)] backdrop-blur-2xl"
        onSubmit={handleLogin}
      >
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-white/45 to-transparent" />
        <h2 className="text-xl font-semibold text-white">Sign in</h2>
        <label className="grid gap-1 text-sm text-slate-200">
          Username
          <Input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="admin"
            required
          />
        </label>
        <label className="grid gap-1 text-sm text-slate-200">
          Password
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            required
          />
        </label>
        <Button type="submit" disabled={loginLoading} stretch icon={<Login animateOnHover />}>
          {loginLoading ? "Logging in..." : "Log In"}
        </Button>
        {authError ? <p className="m-0 text-sm text-rose-300">{authError}</p> : null}
      </motion.form>
    </section>
  );
}
