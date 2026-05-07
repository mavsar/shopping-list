import { Router } from "express";
import { z } from "zod";

import { sqlite } from "../db/client.js";
import { normalizeTitle, unitValues } from "../domain/items.js";
import { getAuthUser, requireAuth } from "../middleware/auth.js";
import { parseId } from "../utils/ids.js";

const createListSchema = z.object({
  name: z.string().trim().min(1).max(200)
});
const updateListSchema = createListSchema;

const addMemberSchema = z.object({
  userId: z.number().int().positive(),
  role: z.enum(["owner", "editor", "viewer"]).default("editor")
});

const createListItemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  quantity: z.number().positive().max(9999).default(1),
  unit: z.enum(unitValues).default("pcs")
});

const listItemsQuerySchema = z.object({
  status: z.enum(["active", "completed", "removed", "all"]).optional()
});

const patchListItemSchema = z.object({
  status: z.enum(["active", "completed", "removed"]).optional(),
  quantity: z.number().positive().max(9999).optional(),
  unit: z.enum(unitValues).optional()
});

export const listsRouter = Router();

type ListRole = "owner" | "editor" | "viewer";

function getListRole(listId: number, userId: number): ListRole | null {
  const membership = sqlite
    .prepare("SELECT role FROM list_members WHERE list_id = ? AND user_id = ? LIMIT 1")
    .get(listId, userId) as { role: ListRole } | undefined;

  return membership?.role ?? null;
}

listsRouter.get("/", requireAuth, (_req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const lists = sqlite
    .prepare(
      `
      SELECT l.id, l.name, l.created_by_user_id AS createdByUserId, l.created_at AS createdAt, l.updated_at AS updatedAt
      FROM shopping_lists l
      JOIN list_members m ON m.list_id = l.id
      WHERE m.user_id = ?
      ORDER BY l.updated_at DESC
      `
    )
    .all(authUser.id);

  return res.json({ lists });
});

listsRouter.post("/", requireAuth, (req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const parsed = createListSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid payload",
      details: parsed.error.flatten()
    });
  }

  const payload = parsed.data;

  const createList = sqlite.transaction(() => {
    const listInsert = sqlite
      .prepare("INSERT INTO shopping_lists (name, created_by_user_id) VALUES (?, ?)")
      .run(payload.name, authUser.id);

    const listId = Number(listInsert.lastInsertRowid);

    sqlite
      .prepare("INSERT INTO list_members (list_id, user_id, role) VALUES (?, ?, 'owner')")
      .run(listId, authUser.id);

    return sqlite
      .prepare(
        "SELECT id, name, created_by_user_id AS createdByUserId, created_at AS createdAt, updated_at AS updatedAt FROM shopping_lists WHERE id = ?"
      )
      .get(listId);
  });

  const list = createList();
  return res.status(201).json({ list });
});

listsRouter.put("/:listId", requireAuth, (req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const listId = typeof req.params.listId === "string" ? parseId(req.params.listId) : null;
  if (!listId) {
    return res.status(400).json({ error: "Invalid listId" });
  }

  const parsed = updateListSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid payload",
      details: parsed.error.flatten()
    });
  }

  const list = sqlite.prepare("SELECT id FROM shopping_lists WHERE id = ?").get(listId);
  if (!list) {
    return res.status(404).json({ error: "List not found" });
  }

  const role = getListRole(listId, authUser.id);
  if (!role) {
    return res.status(403).json({ error: "You are not a member of this list" });
  }

  if (role === "viewer") {
    return res.status(403).json({ error: "Viewers cannot rename lists" });
  }

  sqlite
    .prepare("UPDATE shopping_lists SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(parsed.data.name, listId);

  const updatedList = sqlite
    .prepare(
      "SELECT id, name, created_by_user_id AS createdByUserId, created_at AS createdAt, updated_at AS updatedAt FROM shopping_lists WHERE id = ?"
    )
    .get(listId);

  return res.json({ list: updatedList });
});

listsRouter.delete("/:listId", requireAuth, (req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const listId = typeof req.params.listId === "string" ? parseId(req.params.listId) : null;
  if (!listId) {
    return res.status(400).json({ error: "Invalid listId" });
  }

  const list = sqlite.prepare("SELECT id FROM shopping_lists WHERE id = ?").get(listId);
  if (!list) {
    return res.status(404).json({ error: "List not found" });
  }

  const role = getListRole(listId, authUser.id);
  if (!role) {
    return res.status(403).json({ error: "You are not a member of this list" });
  }

  if (role !== "owner") {
    return res.status(403).json({ error: "Only list owners can delete lists" });
  }

  sqlite.prepare("DELETE FROM shopping_lists WHERE id = ?").run(listId);
  return res.status(204).send();
});

listsRouter.post("/:listId/members", requireAuth, (req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const listId = typeof req.params.listId === "string" ? parseId(req.params.listId) : null;
  if (!listId) {
    return res.status(400).json({ error: "Invalid listId" });
  }

  const parsed = addMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid payload",
      details: parsed.error.flatten()
    });
  }

  const list = sqlite.prepare("SELECT id FROM shopping_lists WHERE id = ?").get(listId);
  if (!list) {
    return res.status(404).json({ error: "List not found" });
  }

  const role = getListRole(listId, authUser.id);
  if (!role) {
    return res.status(403).json({ error: "You are not a member of this list" });
  }

  if (role !== "owner") {
    return res.status(403).json({ error: "Only list owners can manage members" });
  }

  const user = sqlite.prepare("SELECT id FROM users WHERE id = ?").get(parsed.data.userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  sqlite
    .prepare(
      `
      INSERT INTO list_members (list_id, user_id, role)
      VALUES (?, ?, ?)
      ON CONFLICT(list_id, user_id) DO UPDATE SET role = excluded.role
      `
    )
    .run(listId, parsed.data.userId, parsed.data.role);

  return res.status(201).json({ ok: true });
});

listsRouter.get("/:listId/items", requireAuth, (req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const listId = typeof req.params.listId === "string" ? parseId(req.params.listId) : null;
  if (!listId) {
    return res.status(400).json({ error: "Invalid listId" });
  }

  const parsed = listItemsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid query parameters",
      details: parsed.error.flatten()
    });
  }

  const status = parsed.data.status ?? "active";

  const role = getListRole(listId, authUser.id);
  if (!role) {
    return res.status(403).json({ error: "You are not a member of this list" });
  }

  const statement =
    status === "all"
      ? sqlite.prepare(
          `
          SELECT li.id, li.list_id AS listId, li.item_id AS itemId, i.title, i.image_url AS imageUrl, li.quantity, li.unit, li.status, li.created_at AS createdAt, li.updated_at AS updatedAt
          FROM list_items li
          JOIN items i ON i.id = li.item_id
          WHERE li.list_id = ?
          ORDER BY li.created_at DESC
          `
        )
      : sqlite.prepare(
          `
          SELECT li.id, li.list_id AS listId, li.item_id AS itemId, i.title, i.image_url AS imageUrl, li.quantity, li.unit, li.status, li.created_at AS createdAt, li.updated_at AS updatedAt
          FROM list_items li
          JOIN items i ON i.id = li.item_id
          WHERE li.list_id = ? AND li.status = ?
          ORDER BY li.created_at DESC
          `
        );

  const items = status === "all" ? statement.all(listId) : statement.all(listId, status);
  return res.json({ items });
});

listsRouter.post("/:listId/items", requireAuth, (req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const listId = typeof req.params.listId === "string" ? parseId(req.params.listId) : null;
  if (!listId) {
    return res.status(400).json({ error: "Invalid listId" });
  }

  const parsed = createListItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid payload",
      details: parsed.error.flatten()
    });
  }

  const list = sqlite.prepare("SELECT id FROM shopping_lists WHERE id = ?").get(listId);
  if (!list) {
    return res.status(404).json({ error: "List not found" });
  }

  const role = getListRole(listId, authUser.id);
  if (!role) {
    return res.status(403).json({ error: "You are not a member of this list" });
  }

  if (role === "viewer") {
    return res.status(403).json({ error: "Viewers cannot modify list items" });
  }

  const payload = parsed.data;
  const normalizedTitle = normalizeTitle(payload.title);

  const assignItem = sqlite.transaction(() => {
    let createdItem = false;
    let itemId: number;

    const existingItem = sqlite
      .prepare("SELECT id, title, image_url AS imageUrl FROM items WHERE normalized_title = ?")
      .get(normalizedTitle) as { id: number; title: string; imageUrl: string | null } | undefined;

    if (existingItem) {
      itemId = existingItem.id;
    } else {
      const itemInsert = sqlite
        .prepare("INSERT INTO items (normalized_title, title) VALUES (?, ?)")
        .run(normalizedTitle, payload.title);

      itemId = Number(itemInsert.lastInsertRowid);
      createdItem = true;
    }

    const activeListItem = sqlite
      .prepare("SELECT id, quantity FROM list_items WHERE list_id = ? AND item_id = ? AND status = 'active' LIMIT 1")
      .get(listId, itemId) as { id: number; quantity: number } | undefined;

    if (activeListItem) {
      sqlite
        .prepare(
          "UPDATE list_items SET quantity = ?, unit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        )
        .run(activeListItem.quantity + payload.quantity, payload.unit, activeListItem.id);

      const listItem = sqlite
        .prepare(
          `
          SELECT li.id, li.list_id AS listId, li.item_id AS itemId, i.title, i.image_url AS imageUrl, li.quantity, li.unit, li.status
          FROM list_items li
          JOIN items i ON i.id = li.item_id
          WHERE li.id = ?
          `
        )
        .get(activeListItem.id);

      return { listItem, createdItem, reusedAssignment: true };
    }

    const historicalListItem = sqlite
      .prepare(
        "SELECT id FROM list_items WHERE list_id = ? AND item_id = ? AND status IN ('completed', 'removed') ORDER BY updated_at DESC LIMIT 1"
      )
      .get(listId, itemId) as { id: number } | undefined;

    if (historicalListItem) {
      sqlite
        .prepare(
          "UPDATE list_items SET quantity = ?, unit = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        )
        .run(payload.quantity, payload.unit, historicalListItem.id);

      const listItem = sqlite
        .prepare(
          `
          SELECT li.id, li.list_id AS listId, li.item_id AS itemId, i.title, i.image_url AS imageUrl, li.quantity, li.unit, li.status
          FROM list_items li
          JOIN items i ON i.id = li.item_id
          WHERE li.id = ?
          `
        )
        .get(historicalListItem.id);

      return { listItem, createdItem, reusedAssignment: true };
    }

    const listItemInsert = sqlite
      .prepare("INSERT INTO list_items (list_id, item_id, quantity, unit) VALUES (?, ?, ?, ?)")
      .run(listId, itemId, payload.quantity, payload.unit);

    const listItem = sqlite
      .prepare(
        `
        SELECT li.id, li.list_id AS listId, li.item_id AS itemId, i.title, i.image_url AS imageUrl, li.quantity, li.unit, li.status
        FROM list_items li
        JOIN items i ON i.id = li.item_id
        WHERE li.id = ?
        `
      )
      .get(listItemInsert.lastInsertRowid);

    return { listItem, createdItem, reusedAssignment: false };
  });

  const result = assignItem();
  return res.status(201).json(result);
});

listsRouter.patch("/:listId/items/:listItemId", requireAuth, (req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const listId = typeof req.params.listId === "string" ? parseId(req.params.listId) : null;
  const listItemId = typeof req.params.listItemId === "string" ? parseId(req.params.listItemId) : null;

  if (!listId || !listItemId) {
    return res.status(400).json({ error: "Invalid listId or listItemId" });
  }

  const parsed = patchListItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid payload",
      details: parsed.error.flatten()
    });
  }

  const payload = parsed.data;
  if (!payload.status && payload.quantity === undefined && !payload.unit) {
    return res.status(400).json({ error: "At least one field to update is required" });
  }

  const existing = sqlite
    .prepare("SELECT id FROM list_items WHERE id = ? AND list_id = ?")
    .get(listItemId, listId);

  if (!existing) {
    return res.status(404).json({ error: "List item not found" });
  }

  const role = getListRole(listId, authUser.id);
  if (!role) {
    return res.status(403).json({ error: "You are not a member of this list" });
  }

  if (role === "viewer") {
    return res.status(403).json({ error: "Viewers cannot modify list items" });
  }

  sqlite
    .prepare(
      `
      UPDATE list_items
      SET
        status = COALESCE(?, status),
        quantity = COALESCE(?, quantity),
        unit = COALESCE(?, unit),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND list_id = ?
      `
    )
    .run(payload.status ?? null, payload.quantity ?? null, payload.unit ?? null, listItemId, listId);

  const listItem = sqlite
    .prepare(
      `
      SELECT li.id, li.list_id AS listId, li.item_id AS itemId, i.title, i.image_url AS imageUrl, li.quantity, li.unit, li.status, li.created_at AS createdAt, li.updated_at AS updatedAt
      FROM list_items li
      JOIN items i ON i.id = li.item_id
      WHERE li.id = ?
      `
    )
    .get(listItemId);

  return res.json({ listItem });
});
