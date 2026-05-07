import type { NextFunction, Request, Response } from "express";

import { sqlite } from "../db/client.js";
import { hashSessionToken } from "../auth/session.js";

type AuthUser = {
  id: number;
  username: string;
  name: string;
  email: string | null;
  isAdmin: boolean;
};

export function getAuthUser(res: Response): AuthUser | null {
  return (res.locals.authUser as AuthUser | undefined) ?? null;
}

export function getSessionTokenHash(res: Response): string | null {
  return (res.locals.sessionTokenHash as string | undefined) ?? null;
}

export function requireAdmin(_req: Request, res: Response, next: NextFunction): void {
  const authUser = getAuthUser(res);
  if (!authUser) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  if (!authUser.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  next();
}

function extractToken(req: Request): string | null {
  const authorization = req.header("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  const headerToken = req.header("x-auth-token");
  if (headerToken) {
    return headerToken.trim();
  }

  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const tokenHash = hashSessionToken(token);
  const session = sqlite
    .prepare(
      `
      SELECT s.id AS sessionId, s.user_id AS userId, u.username, u.name, u.email, u.is_admin AS isAdmin
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
      LIMIT 1
      `
    )
    .get(tokenHash) as
    | { sessionId: number; userId: number; username: string; name: string; email: string | null; isAdmin: number }
    | undefined;

  if (!session) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  sqlite
    .prepare("UPDATE user_sessions SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(session.sessionId);

  res.locals.authUser = {
    id: session.userId,
    username: session.username,
    name: session.name,
    email: session.email,
    isAdmin: Boolean(session.isAdmin)
  } satisfies AuthUser;
  res.locals.sessionTokenHash = tokenHash;

  next();
}
