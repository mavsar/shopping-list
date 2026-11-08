import { GoogleGenAI, ThinkingLevel, type ThinkingConfig } from "@google/genai";

const geminiApiKey = process.env.GEMINI_API_KEY;

/** Shared Gemini client; null when GEMINI_API_KEY is not configured. */
export const genai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

/** Main model: grounded recipe search and reading recipes from uploaded pages. */
export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
/** Faster, cheaper model for simple text tasks (translation, query rewriting, classification). */
export const GEMINI_LITE_MODEL = process.env.GEMINI_LITE_MODEL?.trim() || "gemini-3.5-flash-lite";

/**
 * The least thinking a model allows. Gemini 2.x switches it off with a zero budget; Gemini 3+
 * replaced budgets with levels, where Flash-Lite goes down to MINIMAL but Flash/Pro reject
 * MINIMAL and start at LOW.
 */
export function fastThinking(model: string): ThinkingConfig {
  if (/^gemini-[12]\./.test(model)) return { thinkingBudget: 0 };
  return { thinkingLevel: /flash-lite/.test(model) ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW };
}

/** Strip ```json fences that Gemini sometimes wraps around JSON output. */
export function stripJsonFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
}

/**
 * Generation config for calls that must return JSON: structured output enforced by the
 * API (no prose, no fences) and as little "thinking" as the model allows — these are
 * simple extraction tasks.
 */
export function jsonGenerationConfig(schema: Record<string, unknown>, model: string = GEMINI_LITE_MODEL) {
  return {
    responseMimeType: "application/json",
    responseJsonSchema: schema,
    thinkingConfig: fastThinking(model)
  };
}

/** Shared wording so every translation prompt targets the same language precisely. */
export const SLOVENIAN_TRANSLATION_RULES = `Target language: Slovenian (slovenščina, as written in Slovenia).
- Never use Croatian, Serbian or Bosnian words or spellings: write "piščančji" not "pileći", "juha" not "čorba", "rezanci" not "rezanci/rezanaca", "kari" not "curry" (as a dish), "jed" not "jelo", "bučka" not "tikvica", "krompir" not "krumpir", "riž" not "riža", "smetana" not "vrhnje".
- Use natural Slovenian culinary vocabulary; translate the dish name too (e.g. "Lasagne alla bolognese" → "Lazanja po bolonjsko", "Chicken curry" → "Piščančji kari").
- Keep quantities, units and numbers exactly as they are.`;
