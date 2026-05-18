import OpenAI from "openai";

import {
  inferCategoryFromTitle,
  isItemCategory,
  itemCategoryValues,
} from "../domain/item-category.js";
import type { ItemCategory } from "../domain/item-category.js";

const apiKey = process.env.OPENAI_API_KEY;

const openai = apiKey ? new OpenAI({ apiKey }) : null;

if (openai) {
  console.log("[category-classifier] OpenAI API key detected — LLM classification active");
} else {
  console.warn("[category-classifier] OPENAI_API_KEY not set — falling back to rule-based classification");
}

const cache = new Map<string, ItemCategory>();

// Set to true if a permanent OpenAI error is encountered (e.g. billing not active).
// Avoids hammering the API on every request when it's known to be unavailable.
let openaiPermanentlyDisabled = false;

const PERMANENT_ERROR_CODES = new Set(["billing_not_active", "account_deactivated", "insufficient_quota"]);

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

  if (!openai || openaiPermanentlyDisabled) {
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
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code && PERMANENT_ERROR_CODES.has(code)) {
      openaiPermanentlyDisabled = true;
      console.warn(`[category-classifier] OpenAI disabled for this session: ${code}. Falling back to rule-based classification.`);
    } else {
      console.warn(`[category-classifier] OpenAI call failed (${code ?? "unknown"}), using rule-based fallback.`);
    }
    return fallback;
  }
}
