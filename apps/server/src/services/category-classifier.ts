import OpenAI from "openai";

import {
  inferCategoryFromTitle,
  isItemCategory,
  itemCategoryValues,
} from "../domain/item-category.js";
import type { ItemCategory } from "../domain/item-category.js";

const apiKey = process.env.OPENAI_API_KEY;

const openai = apiKey ? new OpenAI({ apiKey }) : null;

const cache = new Map<string, ItemCategory>();

const SYSTEM_PROMPT = `You are a Slovenian grocery/shopping category classifier.
Given a product name, return exactly one category key from this list:
${itemCategoryValues.join(", ")}

Reply with only the category key, nothing else.`;

export async function classifyCategory(title: string): Promise<ItemCategory> {
  const key = title.trim().toLowerCase();

  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const fallback = inferCategoryFromTitle(title);

  if (!openai) {
    return fallback;
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Product: "${title}"` },
      ],
      max_tokens: 40,
      temperature: 0,
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    const category = isItemCategory(raw) ? raw : fallback;
    cache.set(key, category);
    return category;
  } catch {
    return fallback;
  }
}
