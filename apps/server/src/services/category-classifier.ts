import { GoogleGenAI } from "@google/genai";

import {
  inferCategoryFromTitle,
  isItemCategory,
  itemCategoryValues,
} from "../domain/item-category.js";
import type { ItemCategory } from "../domain/item-category.js";

const apiKey = process.env.GEMINI_API_KEY;

const genai = apiKey ? new GoogleGenAI({ apiKey }) : null;

if (genai) {
  console.log("[category-classifier] Gemini API key detected — LLM classification active");
} else {
  console.warn("[category-classifier] GEMINI_API_KEY not set — falling back to rule-based classification");
}

const cache = new Map<string, ItemCategory>();

// Set to true if a permanent error is encountered to avoid hammering the API.
let llmPermanentlyDisabled = false;

const PERMANENT_ERROR_CODES = new Set(["billing_not_active", "account_deactivated", "insufficient_quota", "API_KEY_INVALID"]);

const PROMPT = `You are a Slovenian grocery/shopping category classifier.
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

  if (!genai || llmPermanentlyDisabled) {
    return fallback;
  }

  try {
    const response = await genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `${PROMPT}\n\nProduct: "${title}"`,
    });

    const raw = response.text?.trim() ?? "";
    const category = isItemCategory(raw) ? raw : fallback;
    cache.set(key, category);
    return category;
  } catch (err: unknown) {
    const code = (err as { code?: string; status?: string })?.code ?? (err as { status?: string })?.status;
    if (code && PERMANENT_ERROR_CODES.has(code)) {
      llmPermanentlyDisabled = true;
      console.warn(`[category-classifier] Gemini disabled for this session: ${code}. Falling back to rule-based classification.`);
    } else {
      console.warn(`[category-classifier] Gemini call failed (${code ?? "unknown"}), using rule-based fallback.`);
    }
    return fallback;
  }
}
