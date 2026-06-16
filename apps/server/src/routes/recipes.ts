import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import { Router } from "express";
import sharp from "sharp";
import { z } from "zod";
import { sqlite } from "../db/client.js";
import { getAuthUser, requireAuth } from "../middleware/auth.js";

export const recipesRouter = Router();

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = path.dirname(currentFilePath);
const recipeImagesDirectoryPath = process.env.RECIPE_IMAGES_PATH?.trim()
  ? path.resolve(process.env.RECIPE_IMAGES_PATH)
  : path.resolve(currentDirectoryPath, "..", "..", "storage", "recipe-images");
const recipeImagesPublicPath = "/api/recipe-images";

if (!fs.existsSync(recipeImagesDirectoryPath)) {
  fs.mkdirSync(recipeImagesDirectoryPath, { recursive: true });
}

const geminiApiKey = process.env.GEMINI_API_KEY;
const genai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

const recipeSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200)
});

const recipeFetchQuerySchema = z.object({
  url: z.string().trim().url().max(2000)
});

// Domains that are clearly not single recipe pages — drop them from results
const BLOCKED_HOSTNAMES = [
  "youtube.com",
  "youtu.be",
  "instagram.com",
  "facebook.com",
  "pinterest.com",
  "pinterest.co.uk",
  "tiktok.com",
  "reddit.com",
  "wikipedia.org",
  "amazon.com",
  "books.google.com",
  "google.com",
  "x.com",
  "twitter.com",
];

// Hosts considered Slovenian (results from these are NOT translated)
const SLOVENIAN_HOSTNAMES = [
  "kulinarika.net",
  "recepti.si",
  "okusno.je",
  "gurman.eu",
  "kuham.com",
  "recepti.net",
  "slo-recepti.si",
  "kuhaj.com",
  "mojirecepti.com",
  "jernejkitchen.com",
  "zacimbe.si",
  "odprtakuhinja.delo.si",
  "delo.si",
  "svet24.si",
  "dobrejedi.si",
];

// ---------- HTTP helpers ----------

const browserHtmlHeaders: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "sl-SI,sl;q=0.9,en-US;q=0.8,en;q=0.7"
};

/** Fetch a URL following redirects; returns the final resolved URL and HTML body. */
async function fetchWithResolvedUrl(
  url: string,
  timeoutMs = 8000
): Promise<{ finalUrl: string; html: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: browserHtmlHeaders,
      redirect: "follow",
      signal: controller.signal
    });
    if (!response.ok) return null;
    const html = await response.text();
    return { finalUrl: response.url || url, html };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHtml(url: string, timeoutMs = 8000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: browserHtmlHeaders, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

// ---------- HTML parsing helpers ----------

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, c: string) => String.fromCharCode(parseInt(c, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, c: string) => String.fromCharCode(parseInt(c, 16)));
}

function extractOgMeta(html: string, property: string): string {
  const p1 = new RegExp(`<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']+)["']`, "i");
  const p2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${property}["']`, "i");
  const m = p1.exec(html) ?? p2.exec(html);
  return m?.[1] ? decodeHtmlEntities(m[1]) : "";
}

function extractMetaName(html: string, name: string): string {
  const re = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i");
  const m = re.exec(html);
  return m?.[1] ? decodeHtmlEntities(m[1]) : "";
}

function extractPageTitle(html: string): string {
  const m = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return m?.[1] ? decodeHtmlEntities(m[1].trim()) : "";
}

function stripSiteSuffix(title: string): string {
  return title.replace(/\s*[-|–—]\s*[^-|–—]+$/, "").trim();
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function stripQueryAndFragment(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

function isBlockedHost(url: string): boolean {
  const h = hostname(url);
  return BLOCKED_HOSTNAMES.some((d) => h === d || h.endsWith(`.${d}`));
}

function looksSlovenian(url: string): boolean {
  const h = hostname(url);
  if (h.endsWith(".si")) return true;
  if (SLOVENIAN_HOSTNAMES.some((d) => h === d || h.endsWith(`.${d}`))) return true;
  try {
    if (new URL(url).pathname.includes("/sl/")) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** Block SSRF: only allow public http(s) hosts. */
function isPublicHttpUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const h = parsed.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local")) return false;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (h === "0.0.0.0" || h === "::1" || h === "[::1]") return false;
  return true;
}

// ---------- Gemini grounding (primary & only search engine) ----------

interface GroundedResult {
  redirectUri: string;
  domainHint: string;
}

async function searchWithGeminiGrounding(query: string): Promise<GroundedResult[]> {
  if (!genai) return [];
  try {
    const response = await genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Find 12 different recipes for "${query}". Include both Slovenian recipe websites (like kulinarika.net, recepti.si, okusno.je, jernejkitchen.com, mojirecepti.com) and popular international recipe websites (like allrecipes.com, bbcgoodfood.com, simplyrecipes.com). For each, give the recipe name and the direct URL to the recipe page.`,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const results: GroundedResult[] = [];
    for (const chunk of chunks) {
      const web = (chunk as { web?: { uri?: string; title?: string } }).web;
      if (web?.uri) {
        results.push({ redirectUri: web.uri, domainHint: web.title ?? "" });
      }
    }
    return results;
  } catch {
    return [];
  }
}

// ---------- Per-result resolution + metadata ----------

export interface RecipeSearchResult {
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
  source: string;
}

/** Resolve a grounding redirect URL to the real page and extract display metadata. */
async function resolveGroundedResult(grounded: GroundedResult): Promise<RecipeSearchResult | null> {
  const fetched = await fetchWithResolvedUrl(grounded.redirectUri, 8000);
  if (!fetched) return null;

  const { finalUrl, html } = fetched;
  if (isBlockedHost(finalUrl) || !isPublicHttpUrl(finalUrl)) return null;

  const cleanUrl = stripQueryAndFragment(finalUrl);
  const rawTitle = extractOgMeta(html, "title") || extractPageTitle(html);
  const title = stripSiteSuffix(rawTitle);
  if (!title || title.length < 3) return null;

  const description = (extractOgMeta(html, "description") || extractMetaName(html, "description")).slice(0, 350);
  const imageUrl = extractOgMeta(html, "image") || undefined;

  return { title, description, imageUrl, url: cleanUrl, source: hostname(cleanUrl) };
}

function dedupeBySourceAndUrl(results: RecipeSearchResult[]): RecipeSearchResult[] {
  const seen = new Set<string>();
  const out: RecipeSearchResult[] = [];
  for (const r of results) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    out.push(r);
  }
  return out;
}

// ---------- Translation ----------

async function batchTranslateToSlovenian(results: RecipeSearchResult[]): Promise<RecipeSearchResult[]> {
  if (!genai) return results;

  const foreign = results.map((r, i) => ({ i, r })).filter(({ r }) => !looksSlovenian(r.url));
  if (!foreign.length) return results;

  const payload = foreign.map(({ r }) => ({ title: r.title, description: r.description }));
  const prompt = `Translate each recipe title and description into natural Slovenian culinary language. Return ONLY a JSON array of objects with "title" and "description" keys, in the same order as the input. No markdown, no extra text.

Input: ${JSON.stringify(payload)}`;

  try {
    const response = await genai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
    const raw = (response.text ?? "").trim().replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
    const translated = JSON.parse(raw) as Array<{ title: string; description: string }>;

    const output = [...results];
    foreign.forEach(({ i }, idx) => {
      const t = translated[idx];
      if (t?.title) {
        output[i] = { ...output[i], title: t.title, description: t.description ?? output[i].description };
      }
    });
    return output;
  } catch {
    return results;
  }
}

// ---------- Structured recipe parsing (for /fetch endpoint) ----------

interface ParsedRecipe {
  title: string;
  description?: string;
  imageUrl?: string;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  servings?: string;
  ingredients: string[];
  instructions: string[];
  images: string[];
  url: string;
  source: string;
}

function extractJsonLdBlocks(html: string): unknown[] {
  const results: unknown[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m = re.exec(html);
  while (m) {
    try {
      results.push(JSON.parse(m[1]));
    } catch {
      /* skip malformed JSON */
    }
    m = re.exec(html);
  }
  return results;
}

function findRecipeJsonLd(html: string): Record<string, unknown> | null {
  for (const block of extractJsonLdBlocks(html)) {
    if (!block || typeof block !== "object") continue;
    const obj = block as Record<string, unknown>;
    const type = obj["@type"];
    const isRecipe = type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
    if (isRecipe) return obj;
    if (Array.isArray(obj["@graph"])) {
      const r = (obj["@graph"] as unknown[]).find((x) => {
        if (!x || typeof x !== "object") return false;
        const t = (x as Record<string, unknown>)["@type"];
        return t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"));
      });
      if (r) return r as Record<string, unknown>;
    }
  }
  return null;
}

function normalizeInstructions(raw: unknown): string[] {
  if (typeof raw === "string") return raw ? [raw] : [];
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((item) => {
      if (typeof item === "string") return [item];
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        if (typeof o.text === "string") return [o.text];
        if (typeof o.name === "string") return [o.name];
        if (Array.isArray(o.itemListElement)) {
          return (o.itemListElement as unknown[]).flatMap((s) => {
            if (typeof s === "string") return [s];
            if (s && typeof s === "object") {
              const so = s as Record<string, unknown>;
              if (typeof so.text === "string") return [so.text];
            }
            return [];
          });
        }
      }
      return [];
    })
    .map((s) => decodeHtmlEntities(s.trim()))
    .filter(Boolean);
}

function parseDuration(d: unknown): string | undefined {
  if (typeof d !== "string") return undefined;
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?/.exec(d);
  if (!m) return d.length < 20 ? d : undefined;
  const h = parseInt(m[1] ?? "0", 10);
  const min = parseInt(m[2] ?? "0", 10);
  if (h && min) return `${h} h ${min} min`;
  if (h) return `${h} h`;
  if (min) return `${min} min`;
  return undefined;
}

/** Minimum pixel dimension (width or height) for a usable image. */
const MIN_IMAGE_DIM = 400;

/** Returns true when a URL contains explicit small dimensions in its path or query string. */
function isSmallImageUrl(url: string): boolean {
  const low = url.toLowerCase();
  // path segment like -150x150. or _100x75.
  const dimMatch = /[-_](\d+)x(\d+)\.(?:jpe?g|png|webp|gif|avif)/i.exec(low);
  if (dimMatch) {
    if (Number(dimMatch[1]) < MIN_IMAGE_DIM || Number(dimMatch[2]) < MIN_IMAGE_DIM) return true;
  }
  // query param ?w=150 or ?width=150
  const wParam = /[?&](?:w|width)=(\d+)(?:&|$)/i.exec(low);
  if (wParam && Number(wParam[1]) < MIN_IMAGE_DIM) return true;
  return false;
}

/** Returns declared pixel area for a schema.org ImageObject, or 0 when unknown. */
function imageObjectArea(obj: Record<string, unknown>): number {
  const w = Number(obj.width);
  const h = Number(obj.height);
  if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) return w * h;
  if (Number.isFinite(w) && w > 0) return w * w;
  if (Number.isFinite(h) && h > 0) return h * h;
  return 0;
}

/** Returns true when an ImageObject declares dimensions that are below the threshold. */
function imageObjectTooSmall(obj: Record<string, unknown>): boolean {
  const w = Number(obj.width);
  const h = Number(obj.height);
  if (Number.isFinite(w) && w > 0 && w < MIN_IMAGE_DIM) return true;
  if (Number.isFinite(h) && h > 0 && h < MIN_IMAGE_DIM) return true;
  return false;
}

function extractImageFromJsonLd(recipe: Record<string, unknown>, html: string): string | undefined {
  const candidates: Array<{ url: string; area: number }> = [];

  const consider = (value: unknown) => {
    if (typeof value === "string") {
      if (!isSmallImageUrl(value)) candidates.push({ url: value, area: 0 });
    } else if (value && typeof value === "object") {
      const o = value as Record<string, unknown>;
      if (imageObjectTooSmall(o)) return;
      const u = typeof o.url === "string" ? o.url : undefined;
      if (u && !isSmallImageUrl(u)) candidates.push({ url: u, area: imageObjectArea(o) });
    }
  };

  if (Array.isArray(recipe.image)) {
    for (const entry of recipe.image) consider(entry);
  } else {
    consider(recipe.image);
  }

  // Prefer the image with the largest declared area; fall back to first candidate.
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.area - a.area);
    return candidates[0].url;
  }

  // Last resort: OG image tag (no size check — og:image is typically the main photo).
  return extractOgMeta(html, "image") || undefined;
}

function collectImageUrlsFromJsonLd(recipe: Record<string, unknown>): string[] {
  const out: string[] = [];
  const pushFrom = (value: unknown) => {
    if (typeof value === "string") {
      if (!isSmallImageUrl(value)) out.push(value);
    } else if (value && typeof value === "object") {
      const o = value as Record<string, unknown>;
      if (imageObjectTooSmall(o)) return;
      const u = typeof o.url === "string" ? o.url : undefined;
      if (u && !isSmallImageUrl(u)) out.push(u);
    }
  };
  if (Array.isArray(recipe.image)) {
    for (const entry of recipe.image) pushFrom(entry);
  } else {
    pushFrom(recipe.image);
  }
  return out;
}

/** Pull images attached to individual recipe steps (HowToStep / HowToSection). These are highly relevant. */
function collectInstructionImages(raw: unknown): string[] {
  const out: string[] = [];
  const pushFrom = (value: unknown) => {
    if (typeof value === "string") {
      out.push(value);
    } else if (Array.isArray(value)) {
      for (const entry of value) pushFrom(entry);
    } else if (value && typeof value === "object") {
      const u = (value as Record<string, unknown>).url;
      if (typeof u === "string") out.push(u);
    }
  };
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry);
    } else if (node && typeof node === "object") {
      const o = node as Record<string, unknown>;
      if (o.image) pushFrom(o.image);
      if (Array.isArray(o.itemListElement)) walk(o.itemListElement);
    }
  };
  walk(raw);
  return out;
}

/** Restrict the markup to the most likely recipe body so we don't pick up sidebar/related/footer images. */
function isolateMainContent(html: string): string {
  const articleMatch = /<article[\s\S]*?<\/article>/i.exec(html);
  if (articleMatch?.[0] && articleMatch[0].length > 400) return articleMatch[0];
  const mainMatch = /<main[\s\S]*?<\/main>/i.exec(html);
  if (mainMatch?.[0] && mainMatch[0].length > 400) return mainMatch[0];
  return html;
}

function getImgAttr(tag: string, attr: string): string | undefined {
  const m = new RegExp(`${attr}=["']([^"']+)["']`, "i").exec(tag);
  return m?.[1];
}

/**
 * Extract only sizeable content photos as a fallback (when structured data lacks images).
 * Tiny thumbnails, related-post images, avatars, and decorative assets are dropped.
 */
function extractContentImages(html: string, pageUrl: string): string[] {
  const scoped = isolateMainContent(html);
  const out: string[] = [];
  const re = /<img[^>]+>/gi;
  let tag = re.exec(scoped);
  while (tag) {
    const raw = tag[0];
    const src =
      getImgAttr(raw, "data-src") ??
      getImgAttr(raw, "data-lazy-src") ??
      getImgAttr(raw, "data-original") ??
      getImgAttr(raw, "src");

    if (src && !/^data:/i.test(src)) {
      const lowered = src.toLowerCase();
      const isJunk =
        /logo|icon|sprite|avatar|favicon|placeholder|spacer|pixel|tracking|emoji|badge|banner|advert|thumb|thumbnail|related|widget|gravatar|author|profile|social|share|\/ads?\//i.test(
          lowered
        );

      // Honour declared dimensions: skip images smaller than our threshold.
      const width = Number(getImgAttr(raw, "width"));
      const height = Number(getImgAttr(raw, "height"));
      const tooSmall =
        (Number.isFinite(width) && width > 0 && width < MIN_IMAGE_DIM) ||
        (Number.isFinite(height) && height > 0 && height < MIN_IMAGE_DIM);
      // Skip small renditions encoded in the URL (e.g. -150x150, ?w=100).
      const smallRendition = isSmallImageUrl(src);

      if (!isJunk && !tooSmall && !smallRendition) {
        try {
          out.push(new URL(src, pageUrl).toString());
        } catch {
          /* skip malformed src */
        }
      }
    }
    tag = re.exec(scoped);
  }
  return out;
}

function dedupeImageUrls(urls: Array<string | undefined>, limit = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (typeof url !== "string" || !url.startsWith("http")) continue;
    const key = stripQueryAndFragment(url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Fetches only the leading bytes of an image (enough for the format header) and
 * returns its actual pixel dimensions. Returns null on any failure.
 */
async function probeImageDimensions(url: string): Promise<{ width: number; height: number } | null> {
  try {
    const res = await fetch(url, {
      headers: { ...browserHtmlHeaders, Range: "bytes=0-65535" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok && res.status !== 206) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    return meta.width && meta.height ? { width: meta.width, height: meta.height } : null;
  } catch {
    return null;
  }
}

/**
 * Iterates candidate URLs and returns the first whose actual dimensions both meet
 * the minimum threshold. Falls back to the first candidate when none qualify.
 */
async function findFirstLargeImage(
  candidates: string[],
  minDim = MIN_IMAGE_DIM,
): Promise<string | undefined> {
  let firstCandidate: string | undefined;
  for (const url of candidates) {
    if (!firstCandidate) firstCandidate = url;
    const dims = await probeImageDimensions(url);
    if (dims && dims.width >= minDim && dims.height >= minDim) return url;
  }
  // Nothing passed the size check — return undefined so the caller can decide.
  return undefined;
}

/**
 * Asks Gemini to select the most relevant recipe/food images from a list of candidate URLs.
 * Falls back to the first 8 candidates when Gemini is not configured or fails.
 */
async function filterGalleryImagesWithGemini(
  candidates: string[],
  recipeTitle: string,
): Promise<string[]> {
  if (candidates.length === 0) return [];
  if (!genai || candidates.length <= 2) return candidates.slice(0, 8);

  const prompt = `You are curating a photo gallery for a recipe page titled "${recipeTitle}".
From the following image URLs, select only those that likely show: the finished dish, ingredients, or step-by-step cooking photos.
Reject any that look like: author/avatar photos, site logos, advertisement banners, related-article thumbnails, social media icons, or decorative unrelated assets.

URLs:
${candidates.map((u, i) => `${i + 1}. ${u}`).join("\n")}

Return ONLY a JSON array of the URLs to keep (maximum 8, most relevant first). No markdown, no explanation.`;

  try {
    const r = await genai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
    const raw = (r.text ?? "").trim().replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
    const kept = JSON.parse(raw) as unknown;
    if (Array.isArray(kept)) {
      const candidateSet = new Set(candidates);
      return (kept as unknown[])
        .filter((u): u is string => typeof u === "string" && candidateSet.has(u))
        .slice(0, 8);
    }
  } catch { /* fall through */ }
  return candidates.slice(0, 8);
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function parseRecipeWithGemini(html: string, url: string): Promise<Partial<ParsedRecipe> | null> {
  if (!genai) return null;
  const text = stripHtmlToText(html).slice(0, 24000);
  const prompt = `Extract the recipe from this webpage. URL: ${url}

Return ONLY valid JSON (no markdown) with these fields (omit missing ones):
{"title":"","description":"","ingredients":["..."],"instructions":["..."],"prepTime":"","cookTime":"","totalTime":"","servings":""}

Keep content in its original language. Webpage text:
${text}`;

  try {
    const r = await genai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
    const raw = (r.text ?? "").trim().replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
    return JSON.parse(raw) as Partial<ParsedRecipe>;
  } catch {
    return null;
  }
}

async function parseRecipePage(url: string): Promise<ParsedRecipe | null> {
  let html: string;
  try {
    html = await fetchHtml(url, 10000);
  } catch {
    return null;
  }

  const source = hostname(url);
  const jsonLd = findRecipeJsonLd(html);

  let title = "";
  let description: string | undefined;
  let imageUrl: string | undefined;
  let prepTime: string | undefined;
  let cookTime: string | undefined;
  let totalTime: string | undefined;
  let servings: string | undefined;
  let ingredients: string[] = [];
  let instructions: string[] = [];
  let jsonLdImages: string[] = [];
  let instructionImages: string[] = [];

  if (jsonLd) {
    title = stripSiteSuffix(
      (typeof jsonLd.name === "string" ? jsonLd.name : null) ?? extractOgMeta(html, "title") ?? extractPageTitle(html)
    );
    const rd = typeof jsonLd.description === "string" ? jsonLd.description : extractOgMeta(html, "description");
    description = rd ? decodeHtmlEntities(rd) : undefined;
    imageUrl = extractImageFromJsonLd(jsonLd, html);
    jsonLdImages = collectImageUrlsFromJsonLd(jsonLd);
    instructionImages = collectInstructionImages(jsonLd.recipeInstructions);
    prepTime = parseDuration(jsonLd.prepTime);
    cookTime = parseDuration(jsonLd.cookTime);
    totalTime = parseDuration(jsonLd.totalTime);
    servings =
      typeof jsonLd.recipeYield === "string"
        ? jsonLd.recipeYield
        : typeof jsonLd.recipeYield === "number"
        ? String(jsonLd.recipeYield)
        : Array.isArray(jsonLd.recipeYield) && typeof jsonLd.recipeYield[0] === "string"
        ? (jsonLd.recipeYield[0] as string)
        : undefined;
    ingredients = Array.isArray(jsonLd.recipeIngredient)
      ? (jsonLd.recipeIngredient as unknown[])
          .filter((s): s is string => typeof s === "string")
          .map((s) => decodeHtmlEntities(s.trim()))
          .filter(Boolean)
      : [];
    instructions = normalizeInstructions(jsonLd.recipeInstructions);
  }

  const ogImage = extractOgMeta(html, "image") || undefined;
  if (!imageUrl) imageUrl = ogImage;

  // Collect all image candidates up front so we can probe dimensions in
  // parallel with the Gemini ingredient parse when that is needed.
  const allImageCandidates = dedupeImageUrls([
    imageUrl,
    ogImage,
    ...jsonLdImages,
    ...instructionImages,
    ...extractContentImages(html, url),
  ], 24);

  // Run Gemini ingredient parsing (only when JSON-LD had none) and image
  // dimension probing in parallel — this saves 2–5 s on pages without JSON-LD.
  const [geminiRecipe, largeImageSet] = await Promise.all([
    ingredients.length === 0 ? parseRecipeWithGemini(html, url) : Promise.resolve(null),
    Promise.allSettled(
      allImageCandidates.map(async (u) => {
        const dims = await probeImageDimensions(u);
        return dims && dims.width >= MIN_IMAGE_DIM && dims.height >= MIN_IMAGE_DIM ? u : null;
      })
    ).then((results) =>
      new Set<string>(
        results
          .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled" && r.value !== null)
          .map((r) => r.value)
      )
    ),
  ]);

  if (geminiRecipe) {
    if (!title && geminiRecipe.title) title = geminiRecipe.title;
    if (!description && geminiRecipe.description) description = geminiRecipe.description;
    if (!prepTime && geminiRecipe.prepTime) prepTime = geminiRecipe.prepTime;
    if (!cookTime && geminiRecipe.cookTime) cookTime = geminiRecipe.cookTime;
    if (!totalTime && geminiRecipe.totalTime) totalTime = geminiRecipe.totalTime;
    if (!servings && geminiRecipe.servings) servings = geminiRecipe.servings;
    if (Array.isArray(geminiRecipe.ingredients) && geminiRecipe.ingredients.length > 0) {
      ingredients = (geminiRecipe.ingredients as unknown[])
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (Array.isArray(geminiRecipe.instructions) && geminiRecipe.instructions.length > 0) {
      instructions = (geminiRecipe.instructions as unknown[])
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  if (!title) title = stripSiteSuffix(extractOgMeta(html, "title") || extractPageTitle(html));
  if (!description) {
    const d = extractOgMeta(html, "description");
    if (d) description = decodeHtmlEntities(d);
  }

  // Cover: first large image from priority-ordered candidates; fall back to any
  // large image found, then to the first candidate if nothing met the threshold.
  const coverPriority = dedupeImageUrls([imageUrl, ogImage, ...jsonLdImages]);
  imageUrl =
    coverPriority.find((u) => largeImageSet.has(u)) ??
    [...largeImageSet][0] ??
    coverPriority[0];

  // Gallery: large images (cover excluded), with Gemini curating which ones
  // are actually food / recipe photos vs. logos, ads, author avatars, etc.
  const galleryCandidates = allImageCandidates.filter(
    (u) => largeImageSet.has(u) && u !== imageUrl
  );
  const images = await filterGalleryImagesWithGemini(galleryCandidates, title);

  return {
    title,
    description,
    imageUrl,
    prepTime,
    cookTime,
    totalTime,
    servings,
    ingredients,
    instructions,
    images,
    url,
    source,
  };
}

async function translateRecipeToSlovenian(recipe: ParsedRecipe): Promise<ParsedRecipe> {
  if (!genai || looksSlovenian(recipe.url)) return recipe;

  const payload = {
    title: recipe.title,
    description: recipe.description ?? "",
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
  };

  const prompt = `Translate this recipe into natural Slovenian culinary language. Preserve quantities and units exactly. Return ONLY valid JSON (no markdown) with the same keys: {"title":"","description":"","ingredients":["..."],"instructions":["..."]}

Input: ${JSON.stringify(payload)}`;

  try {
    const response = await genai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
    const raw = (response.text ?? "").trim().replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
    const t = JSON.parse(raw) as { title?: string; description?: string; ingredients?: string[]; instructions?: string[] };
    return {
      ...recipe,
      title: typeof t.title === "string" && t.title ? t.title : recipe.title,
      description: typeof t.description === "string" && t.description ? t.description : recipe.description,
      ingredients: Array.isArray(t.ingredients) && t.ingredients.length > 0 ? t.ingredients : recipe.ingredients,
      instructions: Array.isArray(t.instructions) && t.instructions.length > 0 ? t.instructions : recipe.instructions,
    };
  } catch {
    return recipe;
  }
}

// ---------- Route handlers ----------

recipesRouter.get("/search", requireAuth, async (req, res) => {
  const parsed = recipeSearchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
  }

  if (!genai) {
    return res.status(503).json({ error: "Recipe search is not configured (missing GEMINI_API_KEY)." });
  }

  const query = parsed.data.q;

  // Stream results as NDJSON so the client can render them as they arrive.
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx/proxy buffering
  res.flushHeaders();

  const emit = (data: object) => {
    if (!res.writableEnded) {
      res.write(JSON.stringify(data) + "\n");
      // flush() is injected by compression middleware when present
      const r = res as unknown as { flush?: () => void };
      if (typeof r.flush === "function") r.flush();
    }
  };

  const grounded = await searchWithGeminiGrounding(query);

  if (grounded.length === 0) {
    emit({ type: "done" });
    return res.end();
  }

  // Fetch up to 12 recipe pages in parallel; emit each result as soon as it resolves.
  const rawResults: RecipeSearchResult[] = [];
  await Promise.allSettled(
    grounded.slice(0, 12).map(async (g) => {
      const result = await resolveGroundedResult(g);
      if (result) {
        rawResults.push(result);
        emit({ type: "result", result });
      }
    })
  );

  // Batch-translate all non-Slovenian results and send the updated list.
  const deduped = dedupeBySourceAndUrl(rawResults);
  if (deduped.length > 0) {
    const translated = await batchTranslateToSlovenian(deduped);
    emit({ type: "translated", results: translated });
  }

  emit({ type: "done" });
  return res.end();
});

recipesRouter.get("/fetch", requireAuth, async (req, res) => {
  const parsed = recipeFetchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid URL", details: parsed.error.flatten() });
  }

  const url = parsed.data.url;
  if (isBlockedHost(url) || !isPublicHttpUrl(url)) {
    return res.status(403).json({ error: "URL not allowed." });
  }

  let recipe = await parseRecipePage(url);
  if (!recipe) {
    return res.status(502).json({ error: "Failed to fetch or parse recipe." });
  }

  recipe = await translateRecipeToSlovenian(recipe);

  return res.json({ recipe });
});

// ---------- Saved recipes (persistence + local image storage) ----------

async function fetchImageBuffer(url: string, timeoutMs = 9000): Promise<Buffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        ...browserHtmlHeaders,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
      },
      redirect: "follow",
      signal: controller.signal
    });
    if (!response.ok) return null;
    const data = await response.arrayBuffer();
    return Buffer.from(data);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Download a remote image, normalize it to webp, and store it under /api/recipe-images. */
async function saveRecipeImageLocally(sourceImageUrl: string): Promise<string | null> {
  if (!isPublicHttpUrl(sourceImageUrl)) return null;
  const rawBuffer = await fetchImageBuffer(sourceImageUrl);
  if (!rawBuffer || rawBuffer.length === 0) return null;

  const hash = crypto.createHash("sha1").update(sourceImageUrl).digest("hex").slice(0, 16);
  const fileName = `${hash}.webp`;
  const absolutePath = path.join(recipeImagesDirectoryPath, fileName);
  const publicUrl = `${recipeImagesPublicPath}/${fileName}`;

  if (fs.existsSync(absolutePath)) return publicUrl;

  try {
    const processed = await sharp(rawBuffer)
      .rotate()
      .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    await fs.promises.writeFile(absolutePath, processed);
    return publicUrl;
  } catch {
    return null;
  }
}

function isLocalRecipeImageUrl(value: string): boolean {
  return value.startsWith(`${recipeImagesPublicPath}/`);
}

async function pruneOrphanedRecipeImages(): Promise<void> {
  let referenced: Array<{ imageUrl: string | null; images: string | null }> = [];
  try {
    referenced = sqlite.prepare("SELECT image_url AS imageUrl, images FROM recipes").all() as Array<{
      imageUrl: string | null;
      images: string | null;
    }>;
  } catch {
    return;
  }

  const keep = new Set<string>();
  for (const row of referenced) {
    if (row.imageUrl && isLocalRecipeImageUrl(row.imageUrl)) keep.add(row.imageUrl);
    if (row.images) {
      try {
        for (const value of JSON.parse(row.images) as unknown[]) {
          if (typeof value === "string" && isLocalRecipeImageUrl(value)) keep.add(value);
        }
      } catch {
        /* ignore malformed json */
      }
    }
  }

  let entries: fs.Dirent[] = [];
  try {
    entries = await fs.promises.readdir(recipeImagesDirectoryPath, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        if (keep.has(`${recipeImagesPublicPath}/${entry.name}`)) return;
        try {
          await fs.promises.unlink(path.join(recipeImagesDirectoryPath, entry.name));
        } catch {
          /* ignore */
        }
      })
  );
}

interface SavedRecipeRow {
  id: number;
  url: string;
  source: string | null;
  title: string;
  description: string | null;
  imageUrl: string | null;
  prepTime: string | null;
  cookTime: string | null;
  totalTime: string | null;
  servings: string | null;
  ingredients: string;
  instructions: string;
  images: string;
  createdAt: string;
  labelIds: string | null;
}

function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

function parseNumberArray(value: string | null): number[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is number => typeof entry === "number");
  } catch {
    return [];
  }
}

function mapSavedRecipeRow(row: SavedRecipeRow) {
  return {
    id: row.id,
    url: row.url,
    source: row.source ?? "",
    title: row.title,
    description: row.description ?? undefined,
    imageUrl: row.imageUrl ?? undefined,
    prepTime: row.prepTime ?? undefined,
    cookTime: row.cookTime ?? undefined,
    totalTime: row.totalTime ?? undefined,
    servings: row.servings ?? undefined,
    ingredients: parseStringArray(row.ingredients),
    instructions: parseStringArray(row.instructions),
    images: parseStringArray(row.images),
    createdAt: row.createdAt,
    labelIds: parseNumberArray(row.labelIds)
  };
}

const savedRecipeColumns = `
  id, url, source, title, description, image_url AS imageUrl,
  prep_time AS prepTime, cook_time AS cookTime, total_time AS totalTime, servings,
  ingredients, instructions, images, created_at AS createdAt,
  COALESCE(
    (SELECT json_group_array(label_id) FROM recipe_label_assignments WHERE recipe_id = recipes.id),
    '[]'
  ) AS labelIds
`;

const saveRecipeSchema = z.object({
  url: z.string().trim().url().max(2000),
  source: z.string().trim().max(200).optional(),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(4000).optional(),
  imageUrl: z.string().trim().url().max(2000).optional(),
  prepTime: z.string().trim().max(100).optional(),
  cookTime: z.string().trim().max(100).optional(),
  totalTime: z.string().trim().max(100).optional(),
  servings: z.string().trim().max(100).optional(),
  ingredients: z.array(z.string().trim().max(1000)).max(200).default([]),
  instructions: z.array(z.string().trim().max(5000)).max(200).default([]),
  images: z.array(z.string().trim().url().max(2000)).max(30).default([])
});

recipesRouter.get("/saved", requireAuth, (_req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const rows = sqlite
    .prepare(`SELECT ${savedRecipeColumns} FROM recipes WHERE user_id = ? ORDER BY created_at DESC`)
    .all(authUser.id) as SavedRecipeRow[];

  return res.json({ recipes: rows.map(mapSavedRecipeRow) });
});

recipesRouter.post("/saved", requireAuth, async (req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const parsed = saveRecipeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const payload = parsed.data;

  const existing = sqlite
    .prepare(`SELECT ${savedRecipeColumns} FROM recipes WHERE user_id = ? AND url = ? LIMIT 1`)
    .get(authUser.id, payload.url) as SavedRecipeRow | undefined;
  if (existing) {
    return res.status(200).json({ recipe: mapSavedRecipeRow(existing) });
  }

  // Persist all remote images locally so the recipe no longer depends on the source site.
  const galleryCandidates = dedupeImageUrls(
    [payload.imageUrl, ...payload.images],
    20
  );

  const storedGallery: string[] = [];
  for (const candidate of galleryCandidates) {
    const localUrl = await saveRecipeImageLocally(candidate);
    if (localUrl && !storedGallery.includes(localUrl)) {
      storedGallery.push(localUrl);
    }
  }

  let storedMainImage: string | null = null;
  if (payload.imageUrl) {
    storedMainImage = await saveRecipeImageLocally(payload.imageUrl);
  }
  if (!storedMainImage) {
    storedMainImage = storedGallery[0] ?? null;
  }

  const insert = sqlite
    .prepare(
      `
      INSERT INTO recipes (
        user_id, url, source, title, description, image_url,
        prep_time, cook_time, total_time, servings,
        ingredients, instructions, images
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      authUser.id,
      payload.url,
      payload.source ?? null,
      payload.title,
      payload.description ?? null,
      storedMainImage,
      payload.prepTime ?? null,
      payload.cookTime ?? null,
      payload.totalTime ?? null,
      payload.servings ?? null,
      JSON.stringify(payload.ingredients),
      JSON.stringify(payload.instructions),
      JSON.stringify(storedGallery)
    );

  const row = sqlite
    .prepare(`SELECT ${savedRecipeColumns} FROM recipes WHERE id = ?`)
    .get(Number(insert.lastInsertRowid)) as SavedRecipeRow;

  return res.status(201).json({ recipe: mapSavedRecipeRow(row) });
});

// ---------- Check ingredient against a shopping list (parse + smart dedup) ----------

const VALID_UNITS = [
  "kos", "g", "dag", "kg", "ml", "dl", "l",
  "zlicka", "zlica", "skodelica", "paket", "zavoj",
  "vrecka", "steklenica", "plocevinka", "kozarec",
  "strok", "sopek", "scepec",
] as const;

const checkIngredientSchema = z.object({
  ingredient: z.string().trim().min(1).max(500),
  baseServings: z.number().positive().default(1),
  targetServings: z.number().positive().default(1),
  listId: z.number().int().positive(),
});

recipesRouter.post("/check-ingredient", requireAuth, async (req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) return res.status(401).json({ error: "Authentication required" });

  const parsed = checkIngredientSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const { ingredient, baseServings, targetServings, listId } = parsed.data;

  // Verify list access
  const access = sqlite
    .prepare(
      `SELECT l.is_private AS isPrivate, m.role
       FROM shopping_lists l
       LEFT JOIN list_members m ON m.list_id = l.id AND m.user_id = ?
       WHERE l.id = ? LIMIT 1`
    )
    .get(authUser.id, listId) as { isPrivate: number; role: string | null } | undefined;

  if (!access) return res.status(404).json({ error: "List not found" });
  if (access.isPrivate && !access.role) return res.status(403).json({ error: "Access denied" });

  // Fetch active items from the target list
  const listItems = sqlite
    .prepare(
      `SELECT li.id, i.title, li.quantity, li.unit
       FROM list_items li
       JOIN items i ON i.id = li.item_id
       WHERE li.list_id = ? AND li.status = 'active'`
    )
    .all(listId) as Array<{ id: number; title: string; quantity: number; unit: string }>;

  // Default fallback result
  let parsedIngredient = { title: ingredient, quantity: 1, unit: "kos" };
  let match: {
    type: "exact" | "similar" | "unit_conflict";
    listItemId: number;
    listItemTitle: string;
    listItemQuantity: number;
    listItemUnit: string;
    suggestion?: string;
  } | null = null;

  if (genai) {
    const scale = targetServings / baseServings;
    const itemsContext =
      listItems.length > 0
        ? `\n\nExisting active items on the shopping list (check for duplicates):\n${JSON.stringify(
            listItems.map((item) => ({ id: item.id, title: item.title, unit: item.unit }))
          )}`
        : "";

    const prompt = `You are helping manage a shopping list. Parse the following recipe ingredient string and check whether it already exists on the shopping list.

Ingredient: "${ingredient}"
Recipe base servings: ${baseServings}, target servings: ${targetServings} → scale quantities by factor ${scale.toFixed(4)}.
Valid units (pick the most fitting): ${VALID_UNITS.join(", ")}${itemsContext}

Instructions:
- Extract the ingredient name (title) without quantity or unit. Write it in the singular nominative form in the ingredient's language (e.g. "piščančje prsi" not "piščančjih prsi", "krompir" not "krompirjev", "rdeča paprika" not "rdečih paprik", "chicken breast" not "chicken breasts").
- Calculate the scaled quantity (multiply original quantity by ${scale.toFixed(4)}, round to at most 2 decimal places).
- Choose the most appropriate unit from the valid units list.
- If there are existing items: check if any of them is the same ingredient (exact) or very similar (e.g. minor spelling variation, synonym, different language). Do NOT match completely different ingredients.
- If found: set "match" with the existing item's id and whether it is "exact" or "similar".

Return ONLY valid JSON, no markdown:
{
  "parsed": { "title": "...", "quantity": <number>, "unit": "..." },
  "match": null
}
OR when a match is found:
{
  "parsed": { "title": "...", "quantity": <number>, "unit": "..." },
  "match": { "type": "exact" | "similar", "id": <existing item id from the list>, "suggestion": "<optional short explanation>" }
}`;

    try {
      const r = await genai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
      const raw = (r.text ?? "").trim().replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
      const result = JSON.parse(raw) as {
        parsed?: { title?: string; quantity?: number; unit?: string };
        match?: null | { type?: string; id?: number; suggestion?: string };
      };

      if (typeof result.parsed?.title === "string" && result.parsed.title) {
        parsedIngredient.title = result.parsed.title;
      }
      if (typeof result.parsed?.quantity === "number" && result.parsed.quantity > 0) {
        parsedIngredient.quantity = result.parsed.quantity;
      }
      if (typeof result.parsed?.unit === "string" && (VALID_UNITS as readonly string[]).includes(result.parsed.unit)) {
        parsedIngredient.unit = result.parsed.unit;
      }

      if (result.match && typeof result.match.id === "number") {
        const matchedItem = listItems.find((item) => item.id === result.match!.id);
        if (matchedItem) {
          const hasSameUnit = matchedItem.unit === parsedIngredient.unit;
          match = {
            type: !hasSameUnit ? "unit_conflict" : result.match.type === "exact" ? "exact" : "similar",
            listItemId: matchedItem.id,
            listItemTitle: matchedItem.title,
            listItemQuantity: matchedItem.quantity,
            listItemUnit: matchedItem.unit,
            suggestion: result.match.suggestion,
          };
        }
      }
    } catch {
      // Fallback: scale leading number if present
      const scale = targetServings / baseServings;
      const numMatch = /^(\d+(?:[.,]\d+)?)\s*/.exec(ingredient.trim());
      if (numMatch) {
        parsedIngredient.quantity = parseFloat(numMatch[1].replace(",", ".")) * scale;
      }
    }
  } else {
    // No Gemini: basic numeric scaling from leading number
    const scale = targetServings / baseServings;
    const numMatch = /^(\d+(?:[.,]\d+)?)\s*/.exec(ingredient.trim());
    if (numMatch) {
      parsedIngredient.quantity = Math.round(parseFloat(numMatch[1].replace(",", ".")) * scale * 100) / 100;
    }
    parsedIngredient.title = ingredient.replace(/^\d+(?:[.,]\d+)?\s*\S*\s*/, "").trim() || ingredient;
  }

  return res.json({ parsed: parsedIngredient, match });
});

recipesRouter.delete("/saved/:recipeId", requireAuth, async (req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const recipeId = Number(req.params.recipeId);
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return res.status(400).json({ error: "Invalid recipeId" });
  }

  const existing = sqlite
    .prepare("SELECT id FROM recipes WHERE id = ? AND user_id = ? LIMIT 1")
    .get(recipeId, authUser.id);
  if (!existing) {
    return res.status(404).json({ error: "Recipe not found" });
  }

  sqlite.prepare("DELETE FROM recipes WHERE id = ? AND user_id = ?").run(recipeId, authUser.id);
  void pruneOrphanedRecipeImages();

  return res.status(204).send();
});

// ---------- Recipe label assignments ----------

const setRecipeLabelsSchema = z.object({
  labelIds: z.array(z.number().int().positive()).max(20).default([])
});

recipesRouter.put("/saved/:recipeId/labels", requireAuth, (req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) return res.status(401).json({ error: "Authentication required" });

  const recipeId = Number(req.params.recipeId);
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return res.status(400).json({ error: "Invalid recipeId" });
  }

  const existing = sqlite
    .prepare("SELECT id FROM recipes WHERE id = ? AND user_id = ? LIMIT 1")
    .get(recipeId, authUser.id);
  if (!existing) return res.status(404).json({ error: "Recipe not found" });

  const parsed = setRecipeLabelsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const { labelIds } = parsed.data;

  // Verify all label IDs belong to the user
  for (const labelId of labelIds) {
    const labelRow = sqlite
      .prepare("SELECT id FROM recipe_labels WHERE id = ? AND user_id = ? LIMIT 1")
      .get(labelId, authUser.id);
    if (!labelRow) {
      return res.status(400).json({ error: `Label ${labelId} not found` });
    }
  }

  const replaceLabels = sqlite.transaction(() => {
    sqlite.prepare("DELETE FROM recipe_label_assignments WHERE recipe_id = ?").run(recipeId);
    const insert = sqlite.prepare("INSERT OR IGNORE INTO recipe_label_assignments (recipe_id, label_id) VALUES (?, ?)");
    for (const labelId of labelIds) {
      insert.run(recipeId, labelId);
    }
  });
  replaceLabels();

  return res.json({ labelIds });
});

// ---------- Recipe labels CRUD ----------

const labelSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1")
});

recipesRouter.get("/labels", requireAuth, (req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) return res.status(401).json({ error: "Authentication required" });

  const labels = sqlite
    .prepare("SELECT id, name, color FROM recipe_labels WHERE user_id = ? ORDER BY name ASC")
    .all(authUser.id);

  return res.json({ labels });
});

recipesRouter.post("/labels", requireAuth, (req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) return res.status(401).json({ error: "Authentication required" });

  const parsed = labelSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const { name, color } = parsed.data;

  const existing = sqlite
    .prepare("SELECT id FROM recipe_labels WHERE user_id = ? AND name = ? LIMIT 1")
    .get(authUser.id, name);
  if (existing) {
    return res.status(409).json({ error: "Oznaka s tem imenom že obstaja." });
  }

  const result = sqlite
    .prepare("INSERT INTO recipe_labels (user_id, name, color) VALUES (?, ?, ?)")
    .run(authUser.id, name, color);

  const label = sqlite
    .prepare("SELECT id, name, color FROM recipe_labels WHERE id = ?")
    .get(Number(result.lastInsertRowid));

  return res.status(201).json({ label });
});

recipesRouter.put("/labels/:labelId", requireAuth, (req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) return res.status(401).json({ error: "Authentication required" });

  const labelId = Number(req.params.labelId);
  if (!Number.isInteger(labelId) || labelId <= 0) {
    return res.status(400).json({ error: "Invalid labelId" });
  }

  const existing = sqlite
    .prepare("SELECT id FROM recipe_labels WHERE id = ? AND user_id = ? LIMIT 1")
    .get(labelId, authUser.id);
  if (!existing) return res.status(404).json({ error: "Label not found" });

  const parsed = labelSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const { name, color } = parsed.data;

  const duplicate = sqlite
    .prepare("SELECT id FROM recipe_labels WHERE user_id = ? AND name = ? AND id != ? LIMIT 1")
    .get(authUser.id, name, labelId);
  if (duplicate) {
    return res.status(409).json({ error: "Oznaka s tem imenom že obstaja." });
  }

  sqlite
    .prepare("UPDATE recipe_labels SET name = ?, color = ? WHERE id = ? AND user_id = ?")
    .run(name, color, labelId, authUser.id);

  const label = sqlite
    .prepare("SELECT id, name, color FROM recipe_labels WHERE id = ?")
    .get(labelId);

  return res.json({ label });
});

recipesRouter.delete("/labels/:labelId", requireAuth, (req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) return res.status(401).json({ error: "Authentication required" });

  const labelId = Number(req.params.labelId);
  if (!Number.isInteger(labelId) || labelId <= 0) {
    return res.status(400).json({ error: "Invalid labelId" });
  }

  const existing = sqlite
    .prepare("SELECT id FROM recipe_labels WHERE id = ? AND user_id = ? LIMIT 1")
    .get(labelId, authUser.id);
  if (!existing) return res.status(404).json({ error: "Label not found" });

  sqlite.prepare("DELETE FROM recipe_labels WHERE id = ? AND user_id = ?").run(labelId, authUser.id);

  return res.status(204).send();
});
