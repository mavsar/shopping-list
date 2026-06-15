import { Router } from "express";
import { z } from "zod";

import { sqlite } from "../db/client.js";
import { itemCategoryValues } from "../domain/item-category.js";
import { formatItemTitle, normalizeTitle, unitValues } from "../domain/items.js";
import { getAuthUser, requireAuth } from "../middleware/auth.js";
import { classifyCategory } from "../services/category-classifier.js";
import { parseId } from "../utils/ids.js";

const createListSchema = z.object({
  name: z.string().trim().min(1).max(200),
  isPrivate: z.boolean().default(false)
});
const updateListSchema = z.object({
  name: z.string().trim().min(1).max(200),
  isPrivate: z.boolean().optional()
});

const addMemberSchema = z.object({
  userId: z.number().int().positive(),
  role: z.enum(["owner", "editor", "viewer"]).default("editor")
});

type CategoryEnum = (typeof itemCategoryValues)[number];

const itemCategorySchema = z.enum(itemCategoryValues as unknown as [CategoryEnum, ...CategoryEnum[]]);
const itemImageUrlSchema = z
  .string()
  .trim()
  .max(1000)
  .refine((value) => z.string().url().safeParse(value).success || value.startsWith("/api/item-images/") || value.startsWith("/item-images/"), {
    message: "Invalid image URL"
  });

const createListItemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  quantity: z.number().positive().max(9999).default(1),
  unit: z.enum(unitValues).default("kos"),
  note: z.string().trim().max(500).optional(),
  category: itemCategorySchema.optional(),
  imageUrl: itemImageUrlSchema.optional(),
  sourceUrl: z.string().trim().url().max(1000).optional()
});

const listItemsQuerySchema = z.object({
  status: z.enum(["active", "completed", "removed", "all"]).optional()
});

const patchListItemSchema = z.object({
  status: z.enum(["active", "completed", "removed"]).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  quantity: z.number().positive().max(9999).optional(),
  unit: z.enum(unitValues).optional(),
  note: z.string().trim().max(500).optional(),
  category: itemCategorySchema.optional(),
  imageUrl: itemImageUrlSchema.nullable().optional(),
  sourceUrl: z.string().trim().url().max(1000).nullable().optional()
});

export const listsRouter = Router();

type ListRole = "owner" | "editor" | "viewer";

type ShoppingListRow = {
  id: number;
  name: string;
  createdByUserId: number;
  isPrivate: number;
  createdAt: string;
  updatedAt: string;
};

function mapShoppingListRow(row: ShoppingListRow) {
  return {
    ...row,
    isPrivate: Boolean(row.isPrivate)
  };
}

function getListRole(listId: number, userId: number): ListRole | null {
  const membership = sqlite
    .prepare("SELECT role FROM list_members WHERE list_id = ? AND user_id = ? LIMIT 1")
    .get(listId, userId) as { role: ListRole } | undefined;

  return membership?.role ?? null;
}

type ListAccess = {
  isPrivate: boolean;
  role: ListRole | null;
};

function getListAccess(listId: number, userId: number): ListAccess | null {
  const access = sqlite
    .prepare(
      `
      SELECT l.is_private AS isPrivate, m.role
      FROM shopping_lists l
      LEFT JOIN list_members m ON m.list_id = l.id AND m.user_id = ?
      WHERE l.id = ?
      LIMIT 1
      `
    )
    .get(userId, listId) as { isPrivate: number; role: ListRole | null } | undefined;

  if (!access) {
    return null;
  }

  return {
    isPrivate: Boolean(access.isPrivate),
    role: access.role
  };
}

listsRouter.get("/", requireAuth, (_req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const lists = sqlite
    .prepare(
      `
      SELECT l.id, l.name, l.created_by_user_id AS createdByUserId, l.is_private AS isPrivate, l.created_at AS createdAt, l.updated_at AS updatedAt
      FROM shopping_lists l
      LEFT JOIN list_members m ON m.list_id = l.id AND m.user_id = ?
      WHERE l.is_private = 0 OR m.user_id IS NOT NULL
      ORDER BY l.updated_at DESC
      `
    )
    .all(authUser.id) as ShoppingListRow[];

  return res.json({ lists: lists.map(mapShoppingListRow) });
});

listsRouter.get("/:listId", requireAuth, (req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const listId = typeof req.params.listId === "string" ? parseId(req.params.listId) : null;
  if (!listId) {
    return res.status(400).json({ error: "Invalid listId" });
  }

  const access = getListAccess(listId, authUser.id);
  if (!access) {
    return res.status(404).json({ error: "List not found" });
  }
  if (access.isPrivate && !access.role) {
    return res.status(403).json({ error: "This list is private" });
  }

  const list = sqlite
    .prepare(
      `
      SELECT l.id, l.name, l.created_by_user_id AS createdByUserId, l.is_private AS isPrivate, l.created_at AS createdAt, l.updated_at AS updatedAt
      FROM shopping_lists l
      WHERE l.id = ?
      LIMIT 1
      `
    )
    .get(listId) as ShoppingListRow | undefined;

  if (!list) {
    return res.status(404).json({ error: "List not found" });
  }

  return res.json({ list: mapShoppingListRow(list) });
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
      .prepare("INSERT INTO shopping_lists (name, created_by_user_id, is_private) VALUES (?, ?, ?)")
      .run(payload.name, authUser.id, payload.isPrivate ? 1 : 0);

    const listId = Number(listInsert.lastInsertRowid);

    sqlite
      .prepare("INSERT INTO list_members (list_id, user_id, role) VALUES (?, ?, 'owner')")
      .run(listId, authUser.id);

    return sqlite
      .prepare(
        "SELECT id, name, created_by_user_id AS createdByUserId, is_private AS isPrivate, created_at AS createdAt, updated_at AS updatedAt FROM shopping_lists WHERE id = ?"
      )
      .get(listId) as ShoppingListRow;
  });

  const list = createList();
  return res.status(201).json({ list: mapShoppingListRow(list) });
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

  const access = getListAccess(listId, authUser.id);
  if (!access) {
    return res.status(404).json({ error: "List not found" });
  }

  if (access.isPrivate && !access.role) {
    return res.status(403).json({ error: "This list is private" });
  }

  if (access.isPrivate && access.role === "viewer") {
    return res.status(403).json({ error: "Viewers cannot rename lists" });
  }

  sqlite
    .prepare("UPDATE shopping_lists SET name = ?, is_private = COALESCE(?, is_private), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(parsed.data.name, parsed.data.isPrivate === undefined ? null : (parsed.data.isPrivate ? 1 : 0), listId);

  const updatedList = sqlite
    .prepare(
      "SELECT id, name, created_by_user_id AS createdByUserId, is_private AS isPrivate, created_at AS createdAt, updated_at AS updatedAt FROM shopping_lists WHERE id = ?"
    )
    .get(listId) as ShoppingListRow;

  return res.json({ list: mapShoppingListRow(updatedList) });
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

  const access = getListAccess(listId, authUser.id);
  if (!access) {
    return res.status(404).json({ error: "List not found" });
  }

  if (access.isPrivate && !access.role) {
    return res.status(403).json({ error: "This list is private" });
  }

  if (access.isPrivate && access.role !== "owner") {
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

  const access = getListAccess(listId, authUser.id);
  if (!access) {
    return res.status(404).json({ error: "List not found" });
  }

  if (access.isPrivate && !access.role) {
    return res.status(403).json({ error: "This list is private" });
  }

  if (access.isPrivate && access.role !== "owner") {
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

  const access = getListAccess(listId, authUser.id);
  if (!access) {
    return res.status(404).json({ error: "List not found" });
  }
  if (access.isPrivate && !access.role) {
    return res.status(403).json({ error: "This list is private" });
  }

  const statement =
    status === "all"
      ? sqlite.prepare(
          `
          SELECT li.id, li.list_id AS listId, li.item_id AS itemId, i.title, i.image_url AS imageUrl, i.category AS category, li.quantity, li.unit, li.note, li.status, li.created_at AS createdAt, li.updated_at AS updatedAt
          FROM list_items li
          JOIN items i ON i.id = li.item_id
          WHERE li.list_id = ?
          ORDER BY li.created_at DESC
          `
        )
      : sqlite.prepare(
          `
          SELECT li.id, li.list_id AS listId, li.item_id AS itemId, i.title, i.image_url AS imageUrl, i.category AS category, li.quantity, li.unit, li.note, li.status, li.created_at AS createdAt, li.updated_at AS updatedAt
          FROM list_items li
          JOIN items i ON i.id = li.item_id
          WHERE li.list_id = ? AND li.status = ?
          ORDER BY li.created_at DESC
          `
        );

  const items = status === "all" ? statement.all(listId) : statement.all(listId, status);
  return res.json({ items });
});

listsRouter.post("/:listId/items", requireAuth, async (req, res) => {
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

  const access = getListAccess(listId, authUser.id);
  if (!access) {
    return res.status(404).json({ error: "List not found" });
  }

  if (access.isPrivate && !access.role) {
    return res.status(403).json({ error: "This list is private" });
  }

  if (access.isPrivate && access.role === "viewer") {
    return res.status(403).json({ error: "Viewers cannot modify list items" });
  }

  const payload = parsed.data;
  const formattedTitle = formatItemTitle(payload.title);
  const normalizedTitle = normalizeTitle(formattedTitle);

  // Only resolve a category when we may need to create a brand-new catalog item.
  // If the catalog item already exists, the category below is ignored, so we skip
  // the (slow) LLM classification entirely to keep adds instant.
  const catalogItemExists = Boolean(
    sqlite.prepare("SELECT id FROM items WHERE normalized_title = ?").get(normalizedTitle)
  );

  const preResolvedCategory =
    payload.category ?? (catalogItemExists ? "drugo" : await classifyCategory(formattedTitle));

  const assignItem = sqlite.transaction((resolvedCategory: string) => {
    let createdItem = false;
    let itemId: number;

    const existingItem = sqlite
      .prepare("SELECT id, title, image_url AS imageUrl FROM items WHERE normalized_title = ?")
      .get(normalizedTitle) as { id: number; title: string; imageUrl: string | null } | undefined;

    if (existingItem) {
      itemId = existingItem.id;
      if (payload.imageUrl && !existingItem.imageUrl) {
        sqlite
          .prepare("UPDATE items SET image_url = ?, source_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(payload.imageUrl, payload.sourceUrl ?? null, itemId);
      }
      if (payload.category) {
        sqlite.prepare("UPDATE items SET category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(payload.category, itemId);
      }
    } else {
      const itemInsert = sqlite
        .prepare(
          "INSERT INTO items (normalized_title, title, image_url, source_url, category) VALUES (?, ?, ?, ?, ?)"
        )
        .run(normalizedTitle, formattedTitle, payload.imageUrl ?? null, payload.sourceUrl ?? null, resolvedCategory);

      itemId = Number(itemInsert.lastInsertRowid);
      createdItem = true;
    }

    sqlite
      .prepare("UPDATE items SET default_quantity = ?, default_unit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(payload.quantity, payload.unit, itemId);

    const activeListItem = sqlite
      .prepare("SELECT id, quantity FROM list_items WHERE list_id = ? AND item_id = ? AND status = 'active' LIMIT 1")
      .get(listId, itemId) as { id: number; quantity: number } | undefined;

    if (activeListItem) {
      sqlite
        .prepare(
          "UPDATE list_items SET quantity = ?, unit = ?, note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        )
        .run(activeListItem.quantity + payload.quantity, payload.unit, payload.note ?? null, activeListItem.id);

      const listItem = sqlite
        .prepare(
          `
          SELECT li.id, li.list_id AS listId, li.item_id AS itemId, i.title, i.image_url AS imageUrl, i.category AS category, li.quantity, li.unit, li.note, li.status, li.created_at AS createdAt, li.updated_at AS updatedAt
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
          "UPDATE list_items SET quantity = ?, unit = ?, note = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        )
        .run(payload.quantity, payload.unit, payload.note ?? null, historicalListItem.id);

      const listItem = sqlite
        .prepare(
          `
          SELECT li.id, li.list_id AS listId, li.item_id AS itemId, i.title, i.image_url AS imageUrl, i.category AS category, li.quantity, li.unit, li.note, li.status, li.created_at AS createdAt, li.updated_at AS updatedAt
          FROM list_items li
          JOIN items i ON i.id = li.item_id
          WHERE li.id = ?
          `
        )
        .get(historicalListItem.id);

      return { listItem, createdItem, reusedAssignment: true };
    }

    const listItemInsert = sqlite
      .prepare("INSERT INTO list_items (list_id, item_id, quantity, unit, note) VALUES (?, ?, ?, ?, ?)")
      .run(listId, itemId, payload.quantity, payload.unit, payload.note ?? null);

    const listItem = sqlite
      .prepare(
        `
        SELECT li.id, li.list_id AS listId, li.item_id AS itemId, i.title, i.image_url AS imageUrl, i.category AS category, li.quantity, li.unit, li.note, li.status, li.created_at AS createdAt, li.updated_at AS updatedAt
        FROM list_items li
        JOIN items i ON i.id = li.item_id
        WHERE li.id = ?
        `
      )
      .get(listItemInsert.lastInsertRowid);

    return { listItem, createdItem, reusedAssignment: false };
  });

  const result = assignItem(preResolvedCategory);
  return res.status(201).json(result);
});

listsRouter.delete("/:listId/items/:listItemId", requireAuth, (req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const listId = typeof req.params.listId === "string" ? parseId(req.params.listId) : null;
  const listItemId = typeof req.params.listItemId === "string" ? parseId(req.params.listItemId) : null;

  if (!listId || !listItemId) {
    return res.status(400).json({ error: "Invalid listId or listItemId" });
  }

  const access = getListAccess(listId, authUser.id);
  if (!access) {
    return res.status(404).json({ error: "List not found" });
  }
  if (access.isPrivate && !access.role) {
    return res.status(403).json({ error: "This list is private" });
  }
  if (access.isPrivate && access.role === "viewer") {
    return res.status(403).json({ error: "Viewers cannot delete items" });
  }

  const listItem = sqlite
    .prepare("SELECT id, item_id AS itemId FROM list_items WHERE id = ? AND list_id = ? LIMIT 1")
    .get(listItemId, listId) as { id: number; itemId: number } | undefined;

  if (!listItem) {
    return res.status(404).json({ error: "List item not found" });
  }

  const deleteFromCatalog = req.query.deleteFromCatalog === "true";

  sqlite.prepare("DELETE FROM list_items WHERE id = ?").run(listItemId);

  if (deleteFromCatalog) {
    sqlite.prepare("DELETE FROM items WHERE id = ?").run(listItem.itemId);
  }

  return res.status(204).send();
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
  if (
    !payload.status &&
    payload.title === undefined &&
    payload.quantity === undefined &&
    !payload.unit &&
    payload.note === undefined &&
    payload.category === undefined &&
    payload.imageUrl === undefined &&
    payload.sourceUrl === undefined
  ) {
    return res.status(400).json({ error: "At least one field to update is required" });
  }

  const existing = sqlite
    .prepare("SELECT id FROM list_items WHERE id = ? AND list_id = ?")
    .get(listItemId, listId);

  if (!existing) {
    return res.status(404).json({ error: "List item not found" });
  }

  const access = getListAccess(listId, authUser.id);
  if (!access) {
    return res.status(404).json({ error: "List not found" });
  }

  if (access.isPrivate && !access.role) {
    return res.status(403).json({ error: "This list is private" });
  }

  if (access.isPrivate && access.role === "viewer") {
    return res.status(403).json({ error: "Viewers cannot modify list items" });
  }

  if (
    payload.title !== undefined ||
    payload.category !== undefined ||
    payload.imageUrl !== undefined ||
    payload.sourceUrl !== undefined
  ) {
    const itemUpdateSegments: string[] = [];
    const itemUpdateArgs: Array<string | null> = [];

    if (payload.title !== undefined) {
      const formattedTitle = formatItemTitle(payload.title);
      itemUpdateSegments.push("title = ?", "normalized_title = ?");
      itemUpdateArgs.push(formattedTitle, normalizeTitle(formattedTitle));
    }
    if (payload.category !== undefined) {
      itemUpdateSegments.push("category = ?");
      itemUpdateArgs.push(payload.category);
    }
    if (payload.imageUrl !== undefined) {
      itemUpdateSegments.push("image_url = ?");
      itemUpdateArgs.push(payload.imageUrl);
    }
    if (payload.sourceUrl !== undefined) {
      itemUpdateSegments.push("source_url = ?");
      itemUpdateArgs.push(payload.sourceUrl);
    }

    try {
      sqlite
        .prepare(
          `
          UPDATE items
          SET ${itemUpdateSegments.join(", ")}, updated_at = CURRENT_TIMESTAMP
          WHERE id = (SELECT item_id FROM list_items WHERE id = ? AND list_id = ?)
          `
        )
        .run(...itemUpdateArgs, listItemId, listId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.includes("UNIQUE constraint failed: items.normalized_title")) {
        return res.status(409).json({ error: "An item with this title already exists." });
      }
      return res.status(500).json({ error: message });
    }
  }

  sqlite
    .prepare(
      `
      UPDATE list_items
      SET
        status = COALESCE(?, status),
        quantity = COALESCE(?, quantity),
        unit = COALESCE(?, unit),
        note = COALESCE(?, note),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND list_id = ?
      `
    )
    .run(payload.status ?? null, payload.quantity ?? null, payload.unit ?? null, payload.note ?? null, listItemId, listId);

  if (payload.quantity !== undefined || payload.unit !== undefined) {
    const updatedListItem = sqlite
      .prepare("SELECT quantity, unit FROM list_items WHERE id = ?")
      .get(listItemId) as { quantity: number; unit: string } | undefined;

    if (updatedListItem) {
      sqlite
        .prepare(
          "UPDATE items SET default_quantity = ?, default_unit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT item_id FROM list_items WHERE id = ?)"
        )
        .run(updatedListItem.quantity, updatedListItem.unit, listItemId);
    }
  }

  const listItem = sqlite
    .prepare(
      `
      SELECT li.id, li.list_id AS listId, li.item_id AS itemId, i.title, i.image_url AS imageUrl, i.category AS category, li.quantity, li.unit, li.note, li.status, li.created_at AS createdAt, li.updated_at AS updatedAt
      FROM list_items li
      JOIN items i ON i.id = li.item_id
      WHERE li.id = ?
      `
    )
    .get(listItemId);

  return res.json({ listItem });
});
