import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import sharp from "sharp";
import { z } from "zod";
import { sqlite } from "../db/client.js";
import { inferCategoryFromTitle, isItemCategory, itemCategoryValues, type ItemCategory } from "../domain/item-category.js";
import { findRecipeSourceByHostname, RECIPE_SOURCES, resolveRecipeSources } from "../domain/recipe-sources.js";
import { getAuthUser, requireAuth } from "../middleware/auth.js";
import {
  GEMINI_LITE_MODEL,
  GEMINI_MODEL,
  genai,
  jsonGenerationConfig,
  SLOVENIAN_TRANSLATION_RULES
} from "../services/genai.js";
import {
  getProxiedImage,
  getSourceImageBuffer,
  signImageProxyUrl,
  unproxyImageUrl,
  verifyImageProxyParams
} from "../services/image-proxy.js";
import { runRecipeSearch } from "../services/recipe-search.js";
import {
  absoluteUrl,
  browserHtmlHeaders,
  decodeHtmlEntities,
  extractOgMeta,
  extractPageTitle,
  fetchHtml,
  hostname,
  isBlockedHost,
  isPublicHttpUrl,
  stripQueryAndFragment,
  stripSiteSuffix
} from "../utils/html.js";

// Simple extraction/translation tasks: the small model without "thinking" is 3-5× faster.
const fastGeminiConfig = { model: GEMINI_LITE_MODEL, thinking: { thinkingConfig: { thinkingBudget: 0 } } };

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
console.log(`[recipe-images] storage directory: ${recipeImagesDirectoryPath}`);

const recipeSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  // Comma-separated catalog ids; omitted = every source.
  sites: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => (value ? value.split(",").map((id) => id.trim()).filter(Boolean) : []))
});

const recipeFetchQuerySchema = z.object({
  url: z.string().trim().url().max(2000)
});

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
        // HowToSection: emit the section name as a heading, then its steps.
        if (Array.isArray(o.itemListElement)) {
          const steps = (o.itemListElement as unknown[]).flatMap((s) => {
            if (typeof s === "string") return [s];
            if (s && typeof s === "object") {
              const so = s as Record<string, unknown>;
              if (typeof so.text === "string") return [so.text];
              if (typeof so.name === "string") return [so.name];
            }
            return [];
          });
          const heading = typeof o.name === "string" && o.name.trim() ? [`${o.name.trim().replace(/:$/, "")}:`] : [];
          return [...heading, ...steps];
        }
        if (typeof o.text === "string") return [o.text];
        if (typeof o.name === "string") return [o.name];
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
      signal: AbortSignal.timeout(3500),
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
    const r = await genai.models.generateContent({
      model: fastGeminiConfig.model,
      contents: prompt,
      config: jsonGenerationConfig({ type: "array", items: { type: "string" } })
    });
    const kept = JSON.parse(r.text ?? "[]") as unknown;
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
    const r = await genai.models.generateContent({
      model: fastGeminiConfig.model,
      contents: prompt,
      config: jsonGenerationConfig({
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          ingredients: { type: "array", items: { type: "string" } },
          instructions: { type: "array", items: { type: "string" } },
          prepTime: { type: "string" },
          cookTime: { type: "string" },
          totalTime: { type: "string" },
          servings: { type: "string" }
        }
      })
    });
    return JSON.parse(r.text ?? "{}") as Partial<ParsedRecipe>;
  } catch {
    return null;
  }
}

/**
 * Parse a recipe page in two phases: `text` resolves as soon as title/ingredients/
 * instructions are known (JSON-LD, or a Gemini extraction when the page has none), and
 * `images` resolves later after cover/gallery candidates were probed and curated. Callers
 * can start translating the text while the image work is still running.
 */
async function parseRecipePagePhased(url: string): Promise<{
  text: Omit<ParsedRecipe, "imageUrl" | "images">;
  images: Promise<{ imageUrl?: string; images: string[] }>;
} | null> {
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

  // Image work starts immediately and runs independently of the text phase.
  const allImageCandidates = dedupeImageUrls(
    [imageUrl, ogImage, ...jsonLdImages, ...instructionImages, ...extractContentImages(html, url)].map((u) =>
      u ? absoluteUrl(u, url) : u
    ),
    16
  );
  const largeImageSetPromise = Promise.allSettled(
    allImageCandidates.map(async (u) => {
      const dims = await probeImageDimensions(u);
      return dims && dims.width >= MIN_IMAGE_DIM && dims.height >= MIN_IMAGE_DIM ? u : null;
    })
  ).then(
    (results) =>
      new Set<string>(
        results
          .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled" && r.value !== null)
          .map((r) => r.value)
      )
  );

  const geminiRecipe = ingredients.length === 0 ? await parseRecipeWithGemini(html, url) : null;

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

  const resolvedTitle = title;
  const coverPriority = dedupeImageUrls([imageUrl, ogImage, ...jsonLdImages].map((u) => (u ? absoluteUrl(u, url) : u)));

  const images = largeImageSetPromise.then(async (largeImageSet) => {
    // Cover: first large image from priority-ordered candidates; fall back to any
    // large image found, then to the first candidate if nothing met the threshold.
    const cover = coverPriority.find((u) => largeImageSet.has(u)) ?? [...largeImageSet][0] ?? coverPriority[0];

    // Gallery: large images (cover excluded), with Gemini curating which ones
    // are actually food / recipe photos vs. logos, ads, author avatars, etc.
    const galleryCandidates = allImageCandidates.filter((u) => largeImageSet.has(u) && u !== cover);
    const gallery = await filterGalleryImagesWithGemini(galleryCandidates, resolvedTitle);
    return { imageUrl: cover, images: gallery };
  });

  return {
    text: {
      title,
      description,
      prepTime,
      cookTime,
      totalTime,
      servings,
      ingredients,
      instructions,
      url,
      source,
    },
    images,
  };
}

async function parseRecipePage(url: string): Promise<ParsedRecipe | null> {
  const phased = await parseRecipePagePhased(url);
  if (!phased) return null;
  const images = await phased.images;
  return { ...phased.text, ...images };
}

type RecipeText = Omit<ParsedRecipe, "imageUrl" | "images">;

const TRANSLATION_CACHE_TTL_MS = 30 * 60_000;
const INSTRUCTION_CHUNK_SIZE = 8;
const translatedRecipeCache = new Map<string, { at: number; value: Pick<RecipeText, "title" | "description" | "ingredients" | "instructions"> }>();

async function translateStringsToSlovenian(context: string, items: string[]): Promise<string[]> {
  if (!genai || items.length === 0) return items;
  const prompt = `Translate every entry of the JSON array below into Slovenian, keeping the same order and count. ${context}
${SLOVENIAN_TRANSLATION_RULES}
If an entry is already Slovenian, return it unchanged.

Input: ${JSON.stringify(items)}`;
  const response = await genai.models.generateContent({
    model: fastGeminiConfig.model,
    contents: prompt,
    config: jsonGenerationConfig({ type: "array", items: { type: "string" } })
  });
  const out = JSON.parse(response.text ?? "[]") as unknown;
  if (!Array.isArray(out) || out.length !== items.length) throw new Error(`expected ${items.length} strings, got ${Array.isArray(out) ? out.length : typeof out}`);
  return out.map((v, i) => (typeof v === "string" && v.trim() ? v : items[i]!));
}

/**
 * Translate a recipe into Slovenian. Title/description/ingredients go in one call and the
 * instructions in parallel chunks, so long recipes take as long as their biggest chunk
 * instead of the whole text.
 */
async function translateRecipeToSlovenian<T extends RecipeText>(recipe: T): Promise<T> {
  if (!genai) return recipe;
  // Pages from Slovenian catalog sites are already in Slovenian — no round trip needed.
  if (findRecipeSourceByHostname(hostname(recipe.url))?.language === "sl") return recipe;

  // Re-opening a recipe should not pay for the same translation twice.
  const cacheKey = `${recipe.url}|${recipe.ingredients.length}|${recipe.instructions.length}`;
  const cached = translatedRecipeCache.get(cacheKey);
  if (cached && Date.now() - cached.at < TRANSLATION_CACHE_TTL_MS) return { ...recipe, ...cached.value };

  try {
    const headCount = 2; // title + description come first in the "head" array
    const head = [recipe.title, recipe.description ?? "", ...recipe.ingredients];
    const chunks: string[][] = [];
    for (let i = 0; i < recipe.instructions.length; i += INSTRUCTION_CHUNK_SIZE) {
      chunks.push(recipe.instructions.slice(i, i + INSTRUCTION_CHUNK_SIZE));
    }

    const [translatedHead, ...translatedChunks] = await Promise.all([
      translateStringsToSlovenian(
        "The first entry is the recipe title, the second its description, the rest are ingredient lines.",
        head
      ),
      ...chunks.map((chunk, index) =>
        translateStringsToSlovenian(
          `These are cooking steps ${index * INSTRUCTION_CHUNK_SIZE + 1}-${index * INSTRUCTION_CHUNK_SIZE + chunk.length} of the recipe "${recipe.title}".`,
          chunk
        )
      )
    ]);

    const translated = {
      title: translatedHead[0] || recipe.title,
      description: recipe.description ? translatedHead[1] || recipe.description : recipe.description,
      ingredients: translatedHead.slice(headCount),
      instructions: translatedChunks.flat()
    };
    translatedRecipeCache.set(cacheKey, { at: Date.now(), value: translated });
    return { ...recipe, ...translated };
  } catch (error) {
    console.warn(`[recipes] translation failed for ${recipe.url}:`, error instanceof Error ? error.message : error);
    return recipe;
  }
}

// ---------- Route handlers ----------

recipesRouter.get("/sources", requireAuth, (_req, res) => {
  return res.json({ sources: RECIPE_SOURCES });
});

recipesRouter.get("/search", requireAuth, async (req, res) => {
  const parsed = recipeSearchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
  }

  if (!genai) {
    return res.status(503).json({ error: "Recipe search is not configured (missing GEMINI_API_KEY)." });
  }

  const query = parsed.data.q;
  const sources = parsed.data.sites.length > 0 ? resolveRecipeSources(parsed.data.sites) : [...RECIPE_SOURCES];
  if (sources.length === 0) {
    return res.status(400).json({ error: "No known recipe sources selected." });
  }

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

  // Stop all outstanding Gemini calls and page fetches when the client goes away.
  const abort = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) abort.abort();
  });

  await runRecipeSearch(
    { query, sources, signal: abort.signal },
    {
      onResult: (result) => emit({ type: "result", result }),
      onUpdate: (results) => emit({ type: "update", results })
    }
  );

  if (!abort.signal.aborted) emit({ type: "done" });
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

  const phased = await parseRecipePagePhased(url);
  if (!phased) {
    return res.status(502).json({ error: "Failed to fetch or parse recipe." });
  }

  // Translation and image probing/curation run side by side.
  const [text, images] = await Promise.all([translateRecipeToSlovenian(phased.text), phased.images]);

  // Remote images are served through the signed proxy so the browser can actually show
  // them; saving maps them back to the source URLs.
  const recipe: ParsedRecipe = {
    ...text,
    imageUrl: images.imageUrl ? signImageProxyUrl(images.imageUrl, 1280) : undefined,
    images: images.images.map((u) => signImageProxyUrl(u, 1280)),
  };

  return res.json({ recipe });
});

const imageProxyQuerySchema = z.object({
  u: z.string().trim().url().max(2000),
  w: z.coerce.number().int(),
  s: z.string().trim().min(8).max(64)
});

// Unauthenticated on purpose (used by <img>); the HMAC signature gates it instead.
recipesRouter.get("/image", async (req, res) => {
  const parsed = imageProxyQuerySchema.safeParse(req.query);
  if (!parsed.success || !verifyImageProxyParams(parsed.data.u, parsed.data.w, parsed.data.s)) {
    return res.status(403).end();
  }

  const image = await getProxiedImage(parsed.data.u, parsed.data.w);
  if (!image) return res.status(404).end();

  res.setHeader("Content-Type", image.contentType);
  res.setHeader("Cache-Control", "public, max-age=86400, immutable");
  return res.end(image.body);
});

// ---------- Saved recipes (persistence + local image storage) ----------

/** Guess a safe file extension from the source URL (fallback: jpg). */
function guessImageExtension(sourceUrl: string): string {
  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    const match = pathname.match(/\.(jpe?g|png|webp|gif|avif)(?:\?|$)/);
    if (match) return match[1] === "jpeg" ? "jpg" : match[1];
  } catch { /* ignore */ }
  return "jpg";
}

/** Download a remote image, normalize it to webp, and store it under /api/recipe-images.
 *  Falls back to saving the raw bytes (original format) when sharp is unavailable or fails. */
async function saveRecipeImageLocally(sourceImageUrl: string): Promise<string | null> {
  // Already one of ours (e.g. a cover picked before the recipe was saved) — keep as is.
  if (localRecipeImageFileExists(sourceImageUrl)) return sourceImageUrl;
  if (!isPublicHttpUrl(sourceImageUrl)) return null;
  const rawBuffer = await getSourceImageBuffer(sourceImageUrl);
  if (!rawBuffer || rawBuffer.length === 0) return null;

  const hash = crypto.createHash("sha1").update(sourceImageUrl).digest("hex").slice(0, 16);

  // --- primary path: process with sharp → webp ---
  const webpFileName = `${hash}.webp`;
  const webpAbsPath = path.join(recipeImagesDirectoryPath, webpFileName);
  const webpPublicUrl = `${recipeImagesPublicPath}/${webpFileName}`;

  if (fs.existsSync(webpAbsPath)) return webpPublicUrl;

  try {
    const processed = await sharp(rawBuffer)
      .rotate()
      .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    await fs.promises.writeFile(webpAbsPath, processed);
    return webpPublicUrl;
  } catch (sharpErr) {
    console.warn(
      `[recipe-images] sharp failed (${sharpErr instanceof Error ? sharpErr.message : String(sharpErr)}), saving raw bytes for ${sourceImageUrl}`
    );
  }

  // --- fallback path: save raw bytes with original format ---
  const ext = guessImageExtension(sourceImageUrl);
  const rawFileName = `${hash}.${ext}`;
  const rawAbsPath = path.join(recipeImagesDirectoryPath, rawFileName);
  const rawPublicUrl = `${recipeImagesPublicPath}/${rawFileName}`;

  if (fs.existsSync(rawAbsPath)) return rawPublicUrl;

  try {
    await fs.promises.writeFile(rawAbsPath, rawBuffer);
    return rawPublicUrl;
  } catch (writeErr) {
    console.error(
      `[recipe-images] failed to write raw image to ${rawAbsPath}:`,
      writeErr instanceof Error ? writeErr.message : writeErr
    );
    return null;
  }
}

function isLocalRecipeImageUrl(value: string): boolean {
  return value.startsWith(`${recipeImagesPublicPath}/`);
}

/** A local recipe image reference is only usable if its file is actually still on disk —
 *  it can go missing if image storage wasn't mounted to a persistent volume and got wiped
 *  on a container rebuild. */
function localRecipeImageFileExists(value: string): boolean {
  if (!isLocalRecipeImageUrl(value)) return false;
  const fileName = value.slice(recipeImagesPublicPath.length + 1);
  if (!fileName || fileName.includes("/") || fileName.includes("..")) return false;
  return fs.existsSync(path.join(recipeImagesDirectoryPath, fileName));
}

interface StoredRecipeImages {
  imageUrl: string | null;
  images: string[];
}

/** Download a main image + gallery candidates locally, dropping any that fail. */
async function downloadRecipeImagesLocally(
  imageUrl: string | undefined,
  gallery: string[]
): Promise<StoredRecipeImages> {
  // Keep already-local pictures (a cover picked before saving) alongside remote ones.
  const candidates = Array.from(
    new Set(
      [imageUrl, ...gallery].filter(
        (u): u is string => typeof u === "string" && (u.startsWith("http") || isLocalRecipeImageUrl(u))
      )
    )
  ).slice(0, 20);
  // Download in parallel (bounded) — sequentially this took tens of seconds per save.
  const results: Array<string | null> = new Array(candidates.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, candidates.length) }, async () => {
      while (next < candidates.length) {
        const index = next++;
        results[index] = await saveRecipeImageLocally(candidates[index]!);
      }
    })
  );
  const images: string[] = [];
  for (const local of results) {
    if (local && !images.includes(local)) images.push(local);
  }
  const mainImage = (imageUrl ? results[candidates.indexOf(imageUrl)] ?? null : null) ?? images[0] ?? null;
  return { imageUrl: mainImage, images };
}

/** Re-fetch a recipe's source page and rebuild its image set from scratch, for when the
 *  previously stored candidate URLs are gone or no longer known. */
async function rebuildRecipeImagesFromSource(sourceUrl: string): Promise<StoredRecipeImages | null> {
  const fresh = await parseRecipePage(sourceUrl);
  if (!fresh) return null;
  return downloadRecipeImagesLocally(fresh.imageUrl, fresh.images);
}

/**
 * On startup: repair recipes whose stored images are unusable — either still an external
 * URL (saved before local-only storage was enforced, or a previous download failed) or a
 * local path whose file no longer exists on disk. Re-fetches the source page and rebuilds
 * the image set from scratch, the same way a fresh save would. Runs silently in the
 * background so it never blocks server startup or requests.
 */
export async function healRecipeImages(): Promise<void> {
  let rows: Array<{ id: number; url: string; imageUrl: string | null; images: string }> = [];
  try {
    rows = sqlite
      .prepare("SELECT id, url, image_url AS imageUrl, images FROM recipes")
      .all() as typeof rows;
  } catch {
    return; // table may not exist yet on very first boot
  }

  const broken = rows.filter((row) => {
    const gallery = parseStringArray(row.images);
    const mainBroken = row.imageUrl !== null && !localRecipeImageFileExists(row.imageUrl);
    return mainBroken || gallery.some((entry) => !localRecipeImageFileExists(entry));
  });
  if (broken.length === 0) return;

  console.log(`[recipe-images] healing ${broken.length} recipe(s) with missing local images...`);
  let healed = 0;
  for (const row of broken) {
    const rebuilt = await rebuildRecipeImagesFromSource(row.url);
    if (!rebuilt) continue; // source unreachable right now — retry on next boot

    sqlite
      .prepare("UPDATE recipes SET image_url = ?, images = ? WHERE id = ?")
      .run(rebuilt.imageUrl, JSON.stringify(rebuilt.images), row.id);
    if (rebuilt.imageUrl) healed += 1;
  }
  console.log(`[recipe-images] healed ${healed}/${broken.length} recipe(s).`);
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
  imageUrl: z.string().trim().max(2000).transform(unproxyImageUrl).refine(isRemoteOrLocalImageRef, "Invalid image").optional(),
  prepTime: z.string().trim().max(100).optional(),
  cookTime: z.string().trim().max(100).optional(),
  totalTime: z.string().trim().max(100).optional(),
  servings: z.string().trim().max(100).optional(),
  ingredients: z.array(z.string().trim().max(1000)).max(200).default([]),
  instructions: z.array(z.string().trim().max(5000)).max(200).default([]),
  images: z.array(z.string().trim().max(2000).transform(unproxyImageUrl).refine(isRemoteOrLocalImageRef, "Invalid image")).max(30).default([])
});

/** Accepts a public http(s) URL or a path to an image already stored under /api/recipe-images. */
function isRemoteOrLocalImageRef(value: string): boolean {
  return isLocalRecipeImageUrl(value) || z.string().url().safeParse(value).success;
}

// ---------- Cover image picker ----------

const coverCandidatesQuerySchema = z.object({
  q: z.string().trim().min(1).max(200)
});

const setCoverSchema = z.object({
  // A remote image, a proxied one, or a picture already stored with the recipe.
  imageUrl: z.string().trim().max(2000).transform(unproxyImageUrl).refine(isRemoteOrLocalImageRef, "Invalid image")
});

function looksLikeUsableWebImage(url: string): boolean {
  if (!isPublicHttpUrl(url)) return false;
  if (/\.(svg|gif)(\?|#|$)/i.test(url)) return false;
  return !/logo|icon|avatar|sprite|banner|placeholder|thumb_?small|\b1x1\b/i.test(url);
}

/**
 * Cover candidates for a recipe: photos of the same dish from other recipe pages, found
 * with the grounded search and streamed as NDJSON while the search is still running.
 */
recipesRouter.get("/cover-candidates", requireAuth, async (req, res) => {
  const parsed = coverCandidatesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
  }
  if (!genai) {
    return res.status(503).json({ error: "Image search is not configured (missing GEMINI_API_KEY)." });
  }

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const emit = (data: object) => {
    if (!res.writableEnded) {
      res.write(JSON.stringify(data) + "\n");
      const r = res as unknown as { flush?: () => void };
      if (typeof r.flush === "function") r.flush();
    }
  };

  const abort = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) abort.abort();
  });

  const seen = new Set<string>();
  await runRecipeSearch(
    { query: parsed.data.q, sources: [...RECIPE_SOURCES], signal: abort.signal, maxCalls: 6, translate: false, maxResults: 40 },
    {
      onResult: (result) => {
        const original = result.imageUrl ? unproxyImageUrl(result.imageUrl) : "";
        if (!original || seen.has(original) || !looksLikeUsableWebImage(original)) return;
        seen.add(original);
        emit({
          type: "candidate",
          candidate: { imageUrl: original, thumbUrl: signImageProxyUrl(original, 320), source: result.source, title: result.title }
        });
      },
      onUpdate: () => undefined
    }
  );

  if (!abort.signal.aborted) emit({ type: "done" });
  return res.end();
});

/** Download a chosen cover for a recipe that isn't saved yet; returns the local image path. */
recipesRouter.post("/cover", requireAuth, async (req, res) => {
  const parsed = setCoverSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const localUrl = await saveRecipeImageLocally(parsed.data.imageUrl);
  if (!localUrl) return res.status(422).json({ error: "Slike ni bilo mogoče prenesti." });
  return res.json({ imageUrl: localUrl });
});

/** Replace the cover of a saved recipe with a downloaded copy of the chosen image. */
recipesRouter.post("/saved/:recipeId/cover", requireAuth, async (req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) return res.status(401).json({ error: "Authentication required" });

  const recipeId = Number(req.params.recipeId);
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return res.status(400).json({ error: "Invalid recipeId" });
  }
  const parsed = setCoverSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const existing = sqlite
    .prepare(`SELECT ${savedRecipeColumns} FROM recipes WHERE id = ? AND user_id = ? LIMIT 1`)
    .get(recipeId, authUser.id) as SavedRecipeRow | undefined;
  if (!existing) return res.status(404).json({ error: "Recipe not found" });

  const localUrl = await saveRecipeImageLocally(parsed.data.imageUrl);
  if (!localUrl) return res.status(422).json({ error: "Slike ni bilo mogoče prenesti." });

  // New cover leads the gallery; the previous cover stays available further down.
  const gallery = Array.from(new Set([localUrl, ...parseStringArray(existing.images)])).slice(0, 30);
  sqlite
    .prepare("UPDATE recipes SET image_url = ?, images = ? WHERE id = ?")
    .run(localUrl, JSON.stringify(gallery), recipeId);

  const updated = sqlite
    .prepare(`SELECT ${savedRecipeColumns} FROM recipes WHERE id = ? LIMIT 1`)
    .get(recipeId) as SavedRecipeRow;
  void pruneOrphanedRecipeImages();
  return res.json({ recipe: mapSavedRecipeRow(updated) });
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

  // Persist all remote images locally so the saved recipe no longer depends on the source
  // site or requires any future fetching. Images that fail to download are dropped rather
  // than stored as external URLs, since those URLs typically hit the same hotlink
  // protection or transient failure a browser would hit later.
  const { imageUrl: storedMainImage, images: storedGallery } = await downloadRecipeImagesLocally(
    payload.imageUrl,
    payload.images
  );

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

const checkIngredientsSchema = z.object({
  ingredients: z.array(z.string().trim().min(1).max(500)).min(1).max(100),
  baseServings: z.number().positive().default(1),
  targetServings: z.number().positive().default(1),
  listId: z.number().int().positive(),
});

interface ParsedIngredient {
  title: string;
  quantity: number;
  unit: string;
  category: ItemCategory;
}

interface IngredientMatch {
  type: "exact" | "similar" | "unit_conflict";
  listItemId: number;
  listItemTitle: string;
  listItemQuantity: number;
  listItemUnit: string;
  suggestion?: string;
}

interface IngredientCheck {
  raw: string;
  parsed: ParsedIngredient;
  match: IngredientMatch | null;
}

/** Rule-based fallback: scale a leading number, strip it from the title, guess a category. */
function checkIngredientHeuristically(ingredient: string, scale: number): ParsedIngredient {
  const numMatch = /^(\d+(?:[.,]\d+)?)\s*/.exec(ingredient.trim());
  const quantity = numMatch ? Math.round(parseFloat(numMatch[1]!.replace(",", ".")) * scale * 100) / 100 : 1;
  const title = ingredient.replace(/^\d+(?:[.,]\d+)?\s*\S*\s*/, "").trim() || ingredient;
  return { title, quantity: quantity > 0 ? quantity : 1, unit: "kos", category: inferCategoryFromTitle(title) };
}

/**
 * Parse recipe ingredient lines (name / scaled quantity / unit / category) and match them
 * against the active items of a shopping list — all ingredients in ONE Gemini call.
 */
async function checkIngredientsAgainstList(
  listId: number,
  ingredients: string[],
  baseServings: number,
  targetServings: number
): Promise<IngredientCheck[]> {
  const listItems = sqlite
    .prepare(
      `SELECT li.id, i.title, li.quantity, li.unit
       FROM list_items li
       JOIN items i ON i.id = li.item_id
       WHERE li.list_id = ? AND li.status = 'active'`
    )
    .all(listId) as Array<{ id: number; title: string; quantity: number; unit: string }>;

  const scale = targetServings / baseServings;
  const results: IngredientCheck[] = ingredients.map((raw) => ({
    raw,
    parsed: checkIngredientHeuristically(raw, scale),
    match: null,
  }));

  if (!genai) return results;

  const itemsContext =
    listItems.length > 0
      ? `\n\nExisting active items on the shopping list (check for duplicates):\n${JSON.stringify(
          listItems.map((item) => ({ id: item.id, title: item.title, unit: item.unit }))
        )}`
      : "";

  const prompt = `You are helping manage a shopping list. Parse each recipe ingredient line below and check whether it already exists on the shopping list.

Ingredients (keep this order):
${ingredients.map((raw, i) => `${i + 1}. ${raw}`).join("\n")}

Recipe base servings: ${baseServings}, target servings: ${targetServings} → scale quantities by factor ${scale.toFixed(4)}.
Valid units (pick the most fitting): ${VALID_UNITS.join(", ")}
Valid categories (pick the most fitting): ${itemCategoryValues.join(", ")}${itemsContext}

For every ingredient:
- Extract the ingredient name (title) without quantity or unit. Write it in the singular nominative form in the ingredient's language (e.g. "piščančje prsi" not "piščančjih prsi", "krompir" not "krompirjev", "rdeča paprika" not "rdečih paprik", "chicken breast" not "chicken breasts").
- Calculate the scaled quantity (multiply the original quantity by ${scale.toFixed(4)}, round to at most 2 decimal places; use 1 when the line has no quantity).
- Choose the most appropriate unit and category from the valid lists.
- If there are existing items: check if any of them is the same ingredient (exact) or very similar (minor spelling variation, synonym, different language). Do NOT match completely different ingredients.
- Lines that are only section headings (e.g. "Bešamel omaka:") still get a title, quantity 1, unit "kos".

Return ONLY a valid JSON array, no markdown, one object per ingredient in the same order:
[{"parsed":{"title":"...","quantity":<number>,"unit":"...","category":"..."},"match":null},
 {"parsed":{...},"match":{"type":"exact"|"similar","id":<existing item id>,"suggestion":"<optional short explanation>"}}]`;

  try {
    const r = await genai.models.generateContent({
      model: fastGeminiConfig.model,
      contents: prompt,
      config: jsonGenerationConfig({
        type: "array",
        items: {
          type: "object",
          properties: {
            parsed: {
              type: "object",
              properties: {
                title: { type: "string" },
                quantity: { type: "number" },
                unit: { type: "string" },
                category: { type: "string" }
              },
              required: ["title", "quantity", "unit", "category"]
            },
            match: {
              type: "object",
              nullable: true,
              properties: {
                type: { type: "string" },
                id: { type: "integer" },
                suggestion: { type: "string" }
              }
            }
          },
          required: ["parsed"]
        }
      })
    });
    const parsed = JSON.parse(r.text ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return results;

    parsed.forEach((entry, index) => {
      const target = results[index];
      if (!target || !entry || typeof entry !== "object") return;
      const { parsed: p, match } = entry as {
        parsed?: { title?: string; quantity?: number; unit?: string; category?: string };
        match?: null | { type?: string; id?: number; suggestion?: string };
      };

      if (typeof p?.title === "string" && p.title.trim()) target.parsed.title = p.title.trim();
      if (typeof p?.quantity === "number" && p.quantity > 0) target.parsed.quantity = Math.round(p.quantity * 100) / 100;
      if (typeof p?.unit === "string" && (VALID_UNITS as readonly string[]).includes(p.unit)) target.parsed.unit = p.unit;
      if (typeof p?.category === "string" && isItemCategory(p.category)) target.parsed.category = p.category;
      else target.parsed.category = inferCategoryFromTitle(target.parsed.title);

      if (match && typeof match.id === "number") {
        const matchedItem = listItems.find((item) => item.id === match.id);
        if (matchedItem) {
          const hasSameUnit = matchedItem.unit === target.parsed.unit;
          target.match = {
            type: !hasSameUnit ? "unit_conflict" : match.type === "exact" ? "exact" : "similar",
            listItemId: matchedItem.id,
            listItemTitle: matchedItem.title,
            listItemQuantity: matchedItem.quantity,
            listItemUnit: matchedItem.unit,
            suggestion: match.suggestion,
          };
        }
      }
    });
  } catch (error) {
    console.warn("[recipes] ingredient check failed, using heuristics:", error instanceof Error ? error.message : error);
  }

  return results;
}

function assertListAccess(listId: number, userId: number): { ok: true } | { ok: false; status: number; error: string } {
  const access = sqlite
    .prepare(
      `SELECT l.is_private AS isPrivate, m.role
       FROM shopping_lists l
       LEFT JOIN list_members m ON m.list_id = l.id AND m.user_id = ?
       WHERE l.id = ? LIMIT 1`
    )
    .get(userId, listId) as { isPrivate: number; role: string | null } | undefined;

  if (!access) return { ok: false, status: 404, error: "List not found" };
  if (access.isPrivate && !access.role) return { ok: false, status: 403, error: "Access denied" };
  return { ok: true };
}

recipesRouter.post("/check-ingredient", requireAuth, async (req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) return res.status(401).json({ error: "Authentication required" });

  const parsed = checkIngredientSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const { ingredient, baseServings, targetServings, listId } = parsed.data;
  const access = assertListAccess(listId, authUser.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const [result] = await checkIngredientsAgainstList(listId, [ingredient], baseServings, targetServings);
  return res.json({ parsed: result!.parsed, match: result!.match });
});

recipesRouter.post("/check-ingredients", requireAuth, async (req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) return res.status(401).json({ error: "Authentication required" });

  const parsed = checkIngredientsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const { ingredients, baseServings, targetServings, listId } = parsed.data;
  const access = assertListAccess(listId, authUser.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const results = await checkIngredientsAgainstList(listId, ingredients, baseServings, targetServings);
  return res.json({ results });
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

const updateRecipeContentSchema = z.object({
  ingredients: z.array(z.string().trim().min(1).max(1000)).max(200).default([]),
  instructions: z.array(z.string().trim().min(1).max(5000)).max(200).default([])
});

recipesRouter.put("/saved/:recipeId", requireAuth, (req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const recipeId = Number(req.params.recipeId);
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return res.status(400).json({ error: "Invalid recipeId" });
  }

  const parsed = updateRecipeContentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const existing = sqlite
    .prepare("SELECT id FROM recipes WHERE id = ? AND user_id = ? LIMIT 1")
    .get(recipeId, authUser.id);
  if (!existing) {
    return res.status(404).json({ error: "Recipe not found" });
  }

  sqlite
    .prepare("UPDATE recipes SET ingredients = ?, instructions = ? WHERE id = ?")
    .run(JSON.stringify(parsed.data.ingredients), JSON.stringify(parsed.data.instructions), recipeId);

  const row = sqlite
    .prepare(`SELECT ${savedRecipeColumns} FROM recipes WHERE id = ?`)
    .get(recipeId) as SavedRecipeRow;

  return res.json({ recipe: mapSavedRecipeRow(row) });
});

recipesRouter.post("/saved/:recipeId/refetch-images", requireAuth, async (req, res) => {
  const authUser = getAuthUser(res);
  if (!authUser) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const recipeId = Number(req.params.recipeId);
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return res.status(400).json({ error: "Invalid recipeId" });
  }

  const existing = sqlite
    .prepare("SELECT id, url FROM recipes WHERE id = ? AND user_id = ? LIMIT 1")
    .get(recipeId, authUser.id) as { id: number; url: string } | undefined;
  if (!existing) {
    return res.status(404).json({ error: "Recipe not found" });
  }

  const rebuilt = await rebuildRecipeImagesFromSource(existing.url);
  if (!rebuilt) {
    return res.status(502).json({ error: "Failed to fetch the recipe's source page." });
  }

  sqlite
    .prepare("UPDATE recipes SET image_url = ?, images = ? WHERE id = ?")
    .run(rebuilt.imageUrl, JSON.stringify(rebuilt.images), recipeId);
  void pruneOrphanedRecipeImages();

  const row = sqlite
    .prepare(`SELECT ${savedRecipeColumns} FROM recipes WHERE id = ?`)
    .get(recipeId) as SavedRecipeRow;

  return res.json({ recipe: mapSavedRecipeRow(row) });
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
