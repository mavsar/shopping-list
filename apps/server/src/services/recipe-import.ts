import sharp from 'sharp';
import { ThinkingLevel, type ThinkingConfig } from '@google/genai';
import {
  GEMINI_LITE_MODEL,
  GEMINI_MODEL,
  genai,
  jsonGenerationConfig,
  SLOVENIAN_TRANSLATION_RULES,
} from './genai.js';

/** A page with at least this much embedded text counts as a digital (non-scanned) page. */
const MIN_TEXT_LAYER_CHARS = 40;

/**
 * Digital PDF pages carry their exact text, so the model only has to group lines and find
 * photos — the lite model does that just as accurately and 2-3x faster. Photos and scans
 * must be read from the image, where the stronger model is more reliable (handwriting,
 * glare, blur). RECIPE_IMPORT_MODEL forces one model for every import.
 */
function importModelFor(pages: ImportPage[]): string {
  const forced = process.env.RECIPE_IMPORT_MODEL?.trim();
  if (forced) return forced;
  const allDigital = pages.every((page) => (page.text?.trim().length ?? 0) >= MIN_TEXT_LAYER_CHARS);
  return allDigital ? GEMINI_LITE_MODEL : GEMINI_MODEL;
}

/**
 * Reading small print carefully pays off, so the import thinks a little. Gemini 3+ takes a
 * level (RECIPE_IMPORT_THINKING = low | medium | high, default low); Gemini 2.x a token budget.
 */
function importThinking(model: string): ThinkingConfig {
  if (/^gemini-[12]\./.test(model)) return { thinkingBudget: 2048 };
  const level = (process.env.RECIPE_IMPORT_THINKING ?? 'low').trim().toUpperCase();
  return {
    thinkingLevel:
      level === 'HIGH'
        ? ThinkingLevel.HIGH
        : level === 'MEDIUM'
          ? ThinkingLevel.MEDIUM
          : ThinkingLevel.LOW,
  };
}

/** One page of an uploaded document (a rendered PDF page or a photo). */
export interface ImportPage {
  data: Buffer;
  mimeType: string;
  /** Embedded text of a digital PDF page — exact spelling, unlike reading the image. */
  text?: string;
}

/** A recipe read from the pages, with its photos still as crop boxes on the page images. */
export interface ExtractedRecipe {
  title: string;
  description?: string;
  /** Notes like "Namig: …"; composed into the description by the client, which can spot
   *  boilerplate repeated on every recipe of a document. */
  tips: string[];
  nutrition?: string;
  servings?: string;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  ingredients: string[];
  instructions: string[];
  /** 0-based index of the page the recipe starts on. */
  page: number;
  photos: Array<{ page: number; box: [number, number, number, number] }>;
}

export interface ExtractionChunkResult {
  recipes: ExtractedRecipe[];
  documentTitle?: string;
  processedPages: number;
}

/** Pages sent to Gemini per call; chunks run in parallel. */
const PAGES_PER_CHUNK = 3;
const MAX_PARALLEL_CHUNKS = 6;
/** Crops smaller than this (in pixels, either side) are decorations, not dish photos. */
const MIN_PHOTO_SIDE = 120;

const extractionSchema = {
  type: 'object',
  properties: {
    documentTitle: { type: 'string' },
    recipes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          tips: { type: 'array', items: { type: 'string' } },
          nutrition: { type: 'string' },
          servings: { type: 'string' },
          prepTime: { type: 'string' },
          cookTime: { type: 'string' },
          totalTime: { type: 'string' },
          ingredients: { type: 'array', items: { type: 'string' } },
          instructions: { type: 'array', items: { type: 'string' } },
          startPage: { type: 'integer' },
          photos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                box_2d: { type: 'array', items: { type: 'integer' } },
              },
              required: ['page', 'box_2d'],
            },
          },
        },
        required: [
          'title',
          'description',
          'tips',
          'nutrition',
          'servings',
          'totalTime',
          'ingredients',
          'instructions',
          'startPage',
          'photos',
        ],
      },
    },
  },
  required: ['recipes'],
};

function buildPrompt(firstPage: number, lastPage: number, contextPage: number | null): string {
  const scope = firstPage === lastPage ? `page ${firstPage}` : `pages ${firstPage}-${lastPage}`;
  const contextRule =
    contextPage !== null
      ? `\nPage ${contextPage} is included ONLY as context: use it to finish a recipe that starts on ${scope} and continues there, but do not return recipes that start on page ${contextPage}.`
      : '';

  return `You are reading ${scope} of a cookbook, magazine, handwritten note or recipe screenshot. Each page image is preceded by its page number. Some pages are followed by their embedded text layer: when it is present, take every word, number and spelling from it (it is exact) and use the image only for layout, grouping and photos.${contextRule}

Extract EVERY recipe that starts on ${scope}. A page can hold several recipes; a recipe can continue onto the next page. Skip pages without recipes (covers, tables of contents, introductions, ads) — including section divider pages that only list recipe titles or show a photo: a recipe starts on the page with its ingredients and/or steps.

For each recipe return:
- title: the dish name in normal sentence case (e.g. "Sočna ajdova kaša s piščancem", never ALL CAPS).
- description: the short intro/summary text about the dish (not the steps); "" when there is none.
- tips: every note such as "Namig", "Tip", "Nasvet", serving suggestions, variations — full text; [] when none.
- nutrition: nutrition facts printed for the recipe (energy, protein, carbs, fat…) as one short line with the basis, e.g. "570 kcal · beljakovine 44 g · ogljikovi hidrati 47 g · maščobe 23 g (za 1 osebo)"; "" when none.
- servings: for how many persons/portions the ingredient quantities are, in nominative form (e.g. "1 oseba", "2 osebi", "4 osebe", "8 palačink"). Look everywhere on the page for phrases like "za 4 osebe", "porcije", "serves 4", "količine za 1 osebo", "za cca. 8 palačink"; "" when not stated.
- prepTime / cookTime / totalTime: durations as written (e.g. "30 min"); a single unlabeled duration is the totalTime; "" when none.
- ingredients: one entry per ingredient line, WITH its quantity and unit exactly as written (ranges like "150-250 g" stay ranges). When ingredients are split into named parts of the dish (e.g. "Piščanec:", "Priloga:", "Omaka:", "Preliv:", "Za testo:"), keep each part title as its own entry ending with a colon, right before that part's ingredients — never merge it into an ingredient line. Ignore small badges/legend markers printed next to ingredients (e.g. single letters or abbreviations such as B, Z, OH, M, S that mark food groups).
- instructions: one entry per step, WITHOUT the leading step number ("1.", "2)"…). Do not include tips here. When the steps are split into named parts (e.g. "Omaka:", "Testo:"), keep each part title as its own entry ending with a colon.
Skip boilerplate that repeats on every recipe and is not about the dish (e.g. "Za več napotkov … si poglej video na platformi", links, page footers, page numbers).
- startPage: the page number where the recipe starts.
- photos: photos of the finished dish or its preparation that belong to this recipe (not portraits of people, logos, icons or decorations). For each: the page number and box_2d = [ymin, xmin, ymax, xmax] normalized to 0-1000 on that page image, tightly around the photo.
Also return documentTitle: the title of the book/document if visible (e.g. on a cover or footer), otherwise omit it.

Transcribe text EXACTLY as printed, character by character — read carefully, do not guess words, do not "correct" spelling or slang, and keep foreign/English words that the author used inside Slovenian text (e.g. "Stir fry:", "sweet chili", "light") unchanged.
Only when the source language is NOT Slovenian, translate everything into Slovenian:
${SLOVENIAN_TRANSLATION_RULES}
Never invent ingredients, quantities or steps that are not on the page. Return an empty recipes array when there are none.`;
}

function cleanStrings(value: unknown, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.replace(/\s+/g, ' ').trim().slice(0, maxLength))
    .filter(Boolean);
}

function optionalString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

/** "1 osebo" / "4 osebami" → "1 oseba" / "4 osebe". */
function normalizeServings(value: string | undefined): string | undefined {
  if (!value) return value;
  return value.replace(/(\d+)\s*oseb\p{L}*/iu, (_match, digits: string) => {
    const count = Number(digits);
    const mod100 = count % 100;
    const form =
      mod100 === 1
        ? 'oseba'
        : mod100 === 2
          ? 'osebi'
          : mod100 === 3 || mod100 === 4
            ? 'osebe'
            : 'oseb';
    return `${digits} ${form}`;
  });
}

function parseBox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const numbers = value.map((n) => Math.min(1000, Math.max(0, Number(n))));
  if (numbers.some((n) => !Number.isFinite(n))) return null;
  const [ymin, xmin, ymax, xmax] = numbers as [number, number, number, number];
  if (ymax - ymin < 20 || xmax - xmin < 20) return null;
  return [ymin, xmin, ymax, xmax];
}

async function extractChunk(
  pages: ImportPage[],
  start: number,
  end: number,
  signal: AbortSignal,
): Promise<{ recipes: ExtractedRecipe[]; documentTitle?: string }> {
  if (!genai) throw new Error('Gemini is not configured.');

  const contextIndex = end < pages.length ? end : null;
  const indexes = Array.from({ length: end - start }, (_, i) => start + i);
  if (contextIndex !== null) indexes.push(contextIndex);

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: buildPrompt(start + 1, end, contextIndex !== null ? contextIndex + 1 : null) },
  ];
  for (const index of indexes) {
    const page = pages[index]!;
    parts.push({ text: `Page ${index + 1}:` });
    parts.push({ inlineData: { mimeType: page.mimeType, data: page.data.toString('base64') } });
    if (page.text?.trim()) {
      parts.push({
        text: `Embedded text layer of page ${index + 1} (exact characters; line order may differ from the layout):\n${page.text}`,
      });
    }
  }

  const model = importModelFor(indexes.map((index) => pages[index]!));
  const response = await genai.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: {
      ...jsonGenerationConfig(extractionSchema, model),
      thinkingConfig: importThinking(model),
      abortSignal: signal,
    },
  });

  const parsed = JSON.parse(response.text ?? '{}') as {
    documentTitle?: unknown;
    recipes?: unknown;
  };
  const rawRecipes = Array.isArray(parsed.recipes)
    ? (parsed.recipes as Array<Record<string, unknown>>)
    : [];

  const recipes: ExtractedRecipe[] = [];
  for (const raw of rawRecipes) {
    const title = optionalString(raw.title, 300);
    if (!title) continue;
    const startPage = Number(raw.startPage) - 1;
    // Recipes starting on the context page belong to the next chunk.
    const page =
      Number.isInteger(startPage) && startPage >= start && startPage < end ? startPage : null;
    if (page === null && Number.isInteger(startPage) && startPage === contextIndex) continue;

    const ingredients = cleanStrings(raw.ingredients, 1000).slice(0, 200);
    const instructions = cleanStrings(raw.instructions, 5000)
      .map((step) => step.replace(/^\d{1,2}\s*[.)]\s*/, ''))
      .filter(Boolean)
      .slice(0, 200);
    if (ingredients.length === 0 && instructions.length === 0) continue;

    const photos: ExtractedRecipe['photos'] = [];
    if (Array.isArray(raw.photos)) {
      for (const photo of raw.photos as Array<Record<string, unknown>>) {
        const photoPage = Number(photo.page) - 1;
        const box = parseBox(photo.box_2d);
        if (box && indexes.includes(photoPage)) photos.push({ page: photoPage, box });
      }
    }

    recipes.push({
      title,
      description: optionalString(raw.description, 2000),
      tips: cleanStrings(raw.tips, 1000).filter((tip) => !/^(namig|nasvet|tip)\s*:?$/i.test(tip)),
      nutrition: optionalString(raw.nutrition, 400),
      servings: normalizeServings(optionalString(raw.servings, 100)),
      prepTime: optionalString(raw.prepTime, 100),
      cookTime: optionalString(raw.cookTime, 100),
      totalTime: optionalString(raw.totalTime, 100),
      ingredients,
      instructions,
      page: page ?? start,
      photos: photos.slice(0, 6),
    });
  }

  return { recipes, documentTitle: optionalString(parsed.documentTitle, 200) };
}

/**
 * Read every recipe from the given pages. Pages are processed in parallel chunks (each with
 * the following page as continuation context); `onChunk` fires as soon as a chunk is done.
 */
export async function extractRecipesFromPages(
  pages: ImportPage[],
  signal: AbortSignal,
  onChunk: (result: ExtractionChunkResult) => void,
): Promise<{ failedChunks: number; totalChunks: number; firstError: unknown }> {
  const ranges: Array<[number, number]> = [];
  for (let start = 0; start < pages.length; start += PAGES_PER_CHUNK) {
    ranges.push([start, Math.min(pages.length, start + PAGES_PER_CHUNK)]);
  }

  let processedPages = 0;
  let next = 0;
  let firstError: unknown = null;
  let failedChunks = 0;
  await Promise.all(
    Array.from({ length: Math.min(MAX_PARALLEL_CHUNKS, ranges.length) }, async () => {
      while (next < ranges.length && !signal.aborted) {
        const [start, end] = ranges[next++]!;
        try {
          const result = await extractChunk(pages, start, end, signal);
          processedPages += end - start;
          onChunk({ ...result, processedPages });
        } catch (error) {
          if (signal.aborted) return;
          console.warn(
            `[recipe-import] pages ${start + 1}-${end} failed:`,
            error instanceof Error ? error.message : error,
          );
          firstError ??= error;
          failedChunks += 1;
          processedPages += end - start;
          onChunk({ recipes: [], processedPages });
        }
      }
    }),
  );

  return { failedChunks, totalChunks: ranges.length, firstError };
}

/** Cut a photo out of a page image; null when the box is too small or the page unreadable. */
export async function cropPagePhoto(
  page: ImportPage,
  box: [number, number, number, number],
): Promise<Buffer | null> {
  try {
    // Pages come from a canvas (no EXIF orientation), so pixel dims are what the model saw.
    const image = sharp(page.data);
    const { width, height } = await image.metadata();
    if (!width || !height) return null;
    const [ymin, xmin, ymax, xmax] = box;
    const left = Math.round((xmin / 1000) * width);
    const top = Math.round((ymin / 1000) * height);
    const cropWidth = Math.min(width - left, Math.round(((xmax - xmin) / 1000) * width));
    const cropHeight = Math.min(height - top, Math.round(((ymax - ymin) / 1000) * height));
    if (cropWidth < MIN_PHOTO_SIDE || cropHeight < MIN_PHOTO_SIDE) return null;
    return await image.extract({ left, top, width: cropWidth, height: cropHeight }).toBuffer();
  } catch {
    return null;
  }
}
