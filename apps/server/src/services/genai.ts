import { GoogleGenAI } from "@google/genai";

const geminiApiKey = process.env.GEMINI_API_KEY;

/** Shared Gemini client; null when GEMINI_API_KEY is not configured. */
export const genai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

export const GEMINI_MODEL = "gemini-2.5-flash";
/** Faster, cheaper model for simple text tasks (translation, query rewriting). */
export const GEMINI_LITE_MODEL = "gemini-2.5-flash-lite";

/** Strip ```json fences that Gemini sometimes wraps around JSON output. */
export function stripJsonFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
}

/**
 * Generation config for calls that must return JSON: structured output enforced by the
 * API (no prose, no fences) and no "thinking" — these are simple extraction tasks.
 */
export function jsonGenerationConfig(schema: Record<string, unknown>) {
  return {
    responseMimeType: "application/json",
    responseJsonSchema: schema,
    thinkingConfig: { thinkingBudget: 0 }
  };
}

/** Shared wording so every translation prompt targets the same language precisely. */
export const SLOVENIAN_TRANSLATION_RULES = `Target language: Slovenian (slovenščina, as written in Slovenia).
- Never use Croatian, Serbian or Bosnian words or spellings: write "piščančji" not "pileći", "juha" not "čorba", "rezanci" not "rezanci/rezanaca", "kari" not "curry" (as a dish), "jed" not "jelo", "bučka" not "tikvica", "krompir" not "krumpir", "riž" not "riža", "smetana" not "vrhnje".
- Use natural Slovenian culinary vocabulary; translate the dish name too (e.g. "Lasagne alla bolognese" → "Lazanja po bolonjsko", "Chicken curry" → "Piščančji kari").
- Keep quantities, units and numbers exactly as they are.`;
