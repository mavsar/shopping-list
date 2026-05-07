import { Router } from "express";
import { z } from "zod";

import { sqlite } from "../db/client.js";
import { normalizeTitle } from "../domain/items.js";
import { requireAuth } from "../middleware/auth.js";

const suggestQuerySchema = z.object({
  q: z.string().trim().min(1),
  limit: z.coerce.number().int().min(1).max(25).optional()
});

export const itemsRouter = Router();

itemsRouter.get("/suggest", requireAuth, (req, res) => {
  const parsed = suggestQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid query parameters",
      details: parsed.error.flatten()
    });
  }

  const query = normalizeTitle(parsed.data.q);
  const limit = parsed.data.limit ?? 8;

  const items = sqlite
    .prepare(
      `
      SELECT id, title, normalized_title AS normalizedTitle, image_url AS imageUrl
      FROM items
      WHERE normalized_title LIKE ?
      ORDER BY title ASC
      LIMIT ?
      `
    )
    .all(`%${query}%`, limit);

  return res.json({ items });
});
