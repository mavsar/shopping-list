import { decodeHtmlEntities } from '../utils/html.js';
import { GEMINI_LITE_MODEL, genai, jsonGenerationConfig } from './genai.js';

/**
 * Recipes keep ingredients as plain lines; a line ending with ":" is the title of the group
 * that follows (e.g. "Omaka:", "Za preliv:"). This module finds such groups on web pages,
 * whose structured data usually flattens them away.
 */

export function isIngredientHeading(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length > 1 && trimmed.length <= 80 && trimmed.endsWith(':');
}

export function toIngredientHeading(label: string): string {
  return `${label.trim().replace(/\s*:+\s*$/, '')}:`;
}

/** Where group titles go, against the ORIGINAL ingredient lines (so it also fits a translation). */
export interface IngredientGroupPlan {
  /** Insert a title before the line with this index. */
  inserts: Array<{ before: number; label: string }>;
  /** Lines that are themselves group titles (e.g. "FOR THE SAUCE") and get turned into one. */
  headingLines: Array<{ index: number; label: string }>;
}

export function applyIngredientGroups(lines: string[], plan: IngredientGroupPlan | null): string[] {
  if (!plan) return lines;
  const headingAt = new Map(plan.headingLines.map((h) => [h.index, h.label]));
  const insertBefore = new Map<number, string>();
  for (const insert of plan.inserts) {
    if (!headingAt.has(insert.before)) insertBefore.set(insert.before, insert.label);
  }
  const out: string[] = [];
  lines.forEach((line, index) => {
    const before = insertBefore.get(index);
    if (before) out.push(toIngredientHeading(before));
    const heading = headingAt.get(index);
    out.push(heading ? toIngredientHeading(heading) : line);
  });
  return out;
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function textOf(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * WP Recipe Maker (used by many food blogs) marks groups explicitly. Exact and free —
 * used whenever its ingredient count matches the structured data.
 */
function wprmGroups(html: string, ingredientCount: number): IngredientGroupPlan | null {
  // The first ingredients container is the recipe card; later copies are print/jump views.
  const start = html.indexOf('wprm-recipe-ingredient-group');
  if (start === -1 || !html.includes('wprm-recipe-group-name')) return null;
  const containerEnd = html.indexOf('wprm-recipe-instructions', start);
  const section = html.slice(start - 200, containerEnd === -1 ? start + 200_000 : containerEnd);

  // Match the class as a whole token: "wprm-recipe-ingredient-group-name" must not count.
  const groups = section
    .split(/class="(?:[^"]*\s)?wprm-recipe-ingredient-group(?:\s[^"]*)?"/)
    .slice(1);
  const plan: IngredientGroupPlan = { inserts: [], headingLines: [] };
  let index = 0;
  for (const group of groups) {
    const nameMatch =
      /class="[^"]*\bwprm-recipe-group-name\b[^"]*"[^>]*>([\s\S]*?)<\/(?:h\d|span|div|p)>/.exec(
        group,
      );
    const count = (
      group.match(/<li[^>]+class="(?:[^"]*\s)?wprm-recipe-ingredient(?:\s[^"]*)?"/g) ?? []
    ).length;
    const name = nameMatch ? textOf(nameMatch[1]!).replace(/:$/, '') : '';
    if (name && count > 0) plan.inserts.push({ before: index, label: name });
    index += count;
  }
  if (index !== ingredientCount || plan.inserts.length === 0) return null;
  // A single titled group covering everything adds nothing.
  if (plan.inserts.length === 1 && plan.inserts[0]!.before === 0) return null;
  return plan;
}

/** Text of the page around its ingredient list, where group titles would be printed. */
function ingredientNeighbourhood(pageText: string, ingredients: string[]): string {
  const lower = pageText.toLowerCase();
  const probe = (line: string) => {
    const words = line
      .toLowerCase()
      .replace(/[^\p{L}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3);
    return words.length > 0 ? lower.indexOf(words[0]!) : -1;
  };
  const first = probe(ingredients[0]!);
  const last = probe(ingredients[ingredients.length - 1]!);
  if (first === -1) return pageText.slice(0, 12_000);
  const from = Math.max(0, first - 1500);
  const to = Math.min(pageText.length, Math.max(last, first) + 3000);
  return pageText.slice(from, Math.min(to, from + 14_000));
}

/**
 * Ask the small model whether the page splits its ingredients into named groups. Every
 * title it returns must literally appear on the page, so it cannot invent groups.
 */
async function geminiGroups(
  pageText: string,
  ingredients: string[],
  signal?: AbortSignal,
): Promise<IngredientGroupPlan | null> {
  if (!genai) return null;
  const context = ingredientNeighbourhood(pageText, ingredients);
  const prompt = `A recipe web page lists these ingredient lines (index: line):
${ingredients.map((line, i) => `${i}: ${line}`).join('\n')}

Page text around the ingredients:
"""${context}"""

Does the PAGE divide these ingredients into named groups that make up parts of the dish (e.g. "For the sauce", "Filling", "Topping", "Za omako", "Testo")? Only report groups whose title is printed on the page right above its ingredients. Most recipes have no groups — then return an empty list.
For each group return:
- startIndex: index of the first ingredient line of the group
- pageTitle: the title exactly as printed on the page
- titleSl: the title in short natural Slovenian without "za"/"for" (e.g. "Omaka", "Nadev", "Preliv", "Testo", "Mesna omaka")
- isListedLine: true when the line at startIndex is itself the title rather than an ingredient`;

  try {
    const response = await genai.models.generateContent({
      model: GEMINI_LITE_MODEL,
      contents: prompt,
      config: {
        ...jsonGenerationConfig({
          type: 'object',
          properties: {
            groups: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  startIndex: { type: 'integer' },
                  pageTitle: { type: 'string' },
                  titleSl: { type: 'string' },
                  isListedLine: { type: 'boolean' },
                },
                required: ['startIndex', 'pageTitle', 'titleSl', 'isListedLine'],
              },
            },
          },
          required: ['groups'],
        }),
        abortSignal: signal,
      },
    });
    const parsed = JSON.parse(response.text ?? '{}') as {
      groups?: Array<{
        startIndex?: number;
        pageTitle?: string;
        titleSl?: string;
        isListedLine?: boolean;
      }>;
    };
    const page = normalizeForMatch(context);
    const plan: IngredientGroupPlan = { inserts: [], headingLines: [] };
    const seen = new Set<number>();
    for (const group of parsed.groups ?? []) {
      const index = Number(group.startIndex);
      const pageTitle = group.pageTitle?.trim() ?? '';
      const label = group.titleSl?.trim() || pageTitle;
      if (!Number.isInteger(index) || index < 0 || index >= ingredients.length || seen.has(index))
        continue;
      if (!pageTitle || pageTitle.length > 60 || !label) continue;
      if (!page.includes(normalizeForMatch(pageTitle))) continue;
      seen.add(index);
      // The model's "this line is the title" claim is only trusted when the line has no
      // quantity and reads like the printed title; otherwise the title goes above it, so a
      // real ingredient is never lost.
      const line = normalizeForMatch(ingredients[index]!);
      const title = normalizeForMatch(pageTitle);
      const lineIsTitle =
        group.isListedLine === true &&
        !/\d/.test(ingredients[index]!) &&
        line.length > 0 &&
        (line.includes(title) || title.includes(line));
      if (lineIsTitle) plan.headingLines.push({ index, label });
      else plan.inserts.push({ before: index, label });
    }
    const total = plan.inserts.length + plan.headingLines.length;
    if (total === 0) return null;
    if (total === 1 && plan.inserts[0]?.before === 0) return null;
    return plan;
  } catch (error) {
    if (!signal?.aborted) {
      console.warn(
        '[ingredient-groups] detection failed:',
        error instanceof Error ? error.message : error,
      );
    }
    return null;
  }
}

/** Groups the page marks up explicitly (no model call); null when none or not recognised. */
export function detectMarkedUpIngredientGroups(
  html: string,
  ingredients: string[],
): IngredientGroupPlan | null {
  if (ingredients.length < 3 || ingredients.some(isIngredientHeading)) return null;
  return wprmGroups(html, ingredients.length);
}

/**
 * Ask the small model for groups printed on the page. Returns null when the lines already
 * carry titles, when the list is too short to be grouped, or when the page has none.
 */
export async function detectIngredientGroupsWithGemini(
  pageText: string,
  ingredients: string[],
  signal?: AbortSignal,
): Promise<IngredientGroupPlan | null> {
  if (ingredients.length < 5 || ingredients.some(isIngredientHeading)) return null;
  return geminiGroups(pageText, ingredients, signal);
}
