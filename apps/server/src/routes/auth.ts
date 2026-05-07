import { Router } from "express";
import { z } from "zod";

import { createSessionToken, hashSessionToken, verifyPassword } from "../auth/session.js";
import { sqlite } from "../db/client.js";
import { getAuthUser, getSessionTokenHash, requireAuth } from "../middleware/auth.js";

const loginSchema = z.object({
  username: z.string().trim().min(3).max(120),
  password: z.string().min(8).max(200)
});

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid payload",
      details: parsed.error.flatten()
    });
  }

  const payload = parsed.data;

  const user = sqlite
    .prepare(
      "SELECT id, username, name, email, is_admin AS isAdmin, password_hash AS passwordHash FROM users WHERE username = ? LIMIT 1"
    )
    .get(payload.username) as
    | { id: number; username: string; name: string; email: string | null; isAdmin: number; passwordHash: string | null }
    | undefined;

  if (!user?.passwordHash || !verifyPassword(payload.password, user.passwordHash)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);

  sqlite
    .prepare(
      `
      INSERT INTO user_sessions (user_id, token_hash, expires_at)
      VALUES (?, ?, DATETIME('now', '+30 days'))
      `
    )
    .run(user.id, tokenHash);

  return res.json({
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      isAdmin: Boolean(user.isAdmin)
    },
    token
  });
});

authRouter.get("/me", requireAuth, (_req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) {
    return res.status(401).json({ error: "Authentication required" });
  }

  return res.json({ user: authUser });
});

authRouter.post("/logout", requireAuth, (_req, res) => {
  const tokenHash = getSessionTokenHash(res);
  if (!tokenHash) {
    return res.status(401).json({ error: "Authentication required" });
  }

  sqlite.prepare("DELETE FROM user_sessions WHERE token_hash = ?").run(tokenHash);
  return res.status(204).send();
});
