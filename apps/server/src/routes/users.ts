import { Router } from "express";
import { z } from "zod";

import { hashPassword } from "../auth/session.js";
import { sqlite } from "../db/client.js";
import { getAuthUser, requireAdmin, requireAuth } from "../middleware/auth.js";

const createUserSchema = z.object({
  username: z.string().trim().min(3).max(120),
  password: z.string().min(8).max(200),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200).optional(),
  isAdmin: z.boolean().optional().default(false)
});

const updateUserSchema = z
  .object({
    username: z.string().trim().min(3).max(120).optional(),
    password: z.string().min(8).max(200).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    email: z.string().trim().email().max(200).nullable().optional(),
    isAdmin: z.boolean().optional()
  })
  .refine(
    (payload) =>
      payload.username !== undefined ||
      payload.password !== undefined ||
      payload.name !== undefined ||
      payload.email !== undefined ||
      payload.isAdmin !== undefined,
    {
      message: "At least one field must be provided"
    }
  );

export const usersRouter = Router();

usersRouter.get("/", requireAuth, requireAdmin, (_req, res) => {
  const users = sqlite
    .prepare(
      "SELECT id, username, name, email, is_admin AS isAdmin, created_at AS createdAt FROM users ORDER BY created_at DESC"
    )
    .all();

  res.json({ users });
});

usersRouter.post("/", requireAuth, requireAdmin, (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid payload",
      details: parsed.error.flatten()
    });
  }

  const payload = parsed.data;
  const passwordHash = hashPassword(payload.password);

  try {
    const result = sqlite
      .prepare("INSERT INTO users (username, name, email, password_hash, is_admin) VALUES (?, ?, ?, ?, ?)")
      .run(payload.username, payload.name, payload.email ?? null, passwordHash, payload.isAdmin ? 1 : 0);

    const user = sqlite
      .prepare(
        "SELECT id, username, name, email, is_admin AS isAdmin, created_at AS createdAt FROM users WHERE id = ?"
      )
      .get(result.lastInsertRowid);

    return res.status(201).json({ user });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed: users.username")) {
      return res.status(409).json({ error: "Username already exists" });
    }

    if (error instanceof Error && error.message.includes("UNIQUE constraint failed: users.email")) {
      return res.status(409).json({ error: "Email already exists" });
    }

    return res.status(500).json({ error: "Could not create user" });
  }
});

usersRouter.put("/:userId", requireAuth, requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid payload",
      details: parsed.error.flatten()
    });
  }

  const authUser = getAuthUser(res);
  if (!authUser) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const existingUser = sqlite
    .prepare("SELECT id, is_admin AS isAdmin FROM users WHERE id = ? LIMIT 1")
    .get(userId) as { id: number; isAdmin: number } | undefined;

  if (!existingUser) {
    return res.status(404).json({ error: "User not found" });
  }

  const payload = parsed.data;
  const wantsDemotion = existingUser.isAdmin === 1 && payload.isAdmin === false;
  if (wantsDemotion) {
    const [{ adminCount }] = sqlite.prepare("SELECT COUNT(*) AS adminCount FROM users WHERE is_admin = 1").all() as Array<{
      adminCount: number;
    }>;

    if (adminCount <= 1) {
      return res.status(409).json({ error: "At least one admin user must remain" });
    }
  }

  const updates: string[] = [];
  const values: Array<string | number | null> = [];

  if (payload.username !== undefined) {
    updates.push("username = ?");
    values.push(payload.username);
  }
  if (payload.password !== undefined) {
    updates.push("password_hash = ?");
    values.push(hashPassword(payload.password));
  }
  if (payload.name !== undefined) {
    updates.push("name = ?");
    values.push(payload.name);
  }
  if (payload.email !== undefined) {
    updates.push("email = ?");
    values.push(payload.email ? payload.email : null);
  }
  if (payload.isAdmin !== undefined) {
    if (authUser.id === userId && payload.isAdmin === false) {
      return res.status(409).json({ error: "You cannot remove your own admin rights" });
    }

    updates.push("is_admin = ?");
    values.push(payload.isAdmin ? 1 : 0);
  }

  try {
    sqlite
      .prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`)
      .run(...values, userId);

    const user = sqlite
      .prepare(
        "SELECT id, username, name, email, is_admin AS isAdmin, created_at AS createdAt FROM users WHERE id = ? LIMIT 1"
      )
      .get(userId);

    return res.json({ user });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed: users.username")) {
      return res.status(409).json({ error: "Username already exists" });
    }

    if (error instanceof Error && error.message.includes("UNIQUE constraint failed: users.email")) {
      return res.status(409).json({ error: "Email already exists" });
    }

    return res.status(500).json({ error: "Could not update user" });
  }
});

usersRouter.delete("/:userId", requireAuth, requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  const authUser = getAuthUser(res);
  if (!authUser) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (authUser.id === userId) {
    return res.status(409).json({ error: "You cannot delete your own account" });
  }

  const existingUser = sqlite
    .prepare("SELECT id, is_admin AS isAdmin FROM users WHERE id = ? LIMIT 1")
    .get(userId) as { id: number; isAdmin: number } | undefined;

  if (!existingUser) {
    return res.status(404).json({ error: "User not found" });
  }

  if (existingUser.isAdmin === 1) {
    const [{ adminCount }] = sqlite.prepare("SELECT COUNT(*) AS adminCount FROM users WHERE is_admin = 1").all() as Array<{
      adminCount: number;
    }>;

    if (adminCount <= 1) {
      return res.status(409).json({ error: "At least one admin user must remain" });
    }
  }

  try {
    const result = sqlite.prepare("DELETE FROM users WHERE id = ?").run(userId);
    if (result.changes === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message.includes("FOREIGN KEY constraint failed")) {
      return res.status(409).json({ error: "User cannot be deleted because it owns existing data" });
    }

    return res.status(500).json({ error: "Could not delete user" });
  }
});
