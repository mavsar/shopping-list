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
