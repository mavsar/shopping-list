// Recipe web search over a fixed catalog of recipe websites.
//
// Pipeline:
//   1. One Gemini call expands the user's query into a few search phrases per language
//      of the selected sites (so "lazanja" also finds "lasagna" on English sites).
//   2. Several parallel Gemini calls with Google Search grounding, each running a handful
//      of "<phrase> <domain>" searches. Grounding strips the `site:` operator, but using the
//      domain as a plain keyword keeps results almost entirely on the wanted site, and every
//      call returns only ~8 grounding chunks, so volume comes from many small calls.
//   3. Every candidate URL is fetched (following grounding redirects), verified to be an
//      individual recipe page on a selected site, and streamed to the caller immediately.
//   4. Titles/descriptions from non-Slovenian sites are translated in small batches.

import {
  domainHintMayMatchSource,
  findRecipeSourceByHostname,
  type RecipeSource,
  type RecipeSourceLanguage
} from "../domain/recipe-sources.js";
import { signImageProxyUrl } from "./image-proxy.js";
import {
  absoluteUrl,
  extractMetaName,
  extractOgMeta,
  extractPageTitle,
  fetchWithResolvedUrl,
  hostname,
  isBlockedHost,
  isPublicHttpUrl,
  stripQueryAndFragment,
  stripSiteSuffix
} from "../utils/html.js";
import { GEMINI_LITE_MODEL, GEMINI_MODEL, genai, jsonGenerationConfig, SLOVENIAN_TRANSLATION_RULES } from "./genai.js";

export interface RecipeSearchResult {
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
  /** Hostname of the recipe page (display). */
  source: string;
  /** Catalog id of the matched recipe source. */
  sourceId: string;
  /** True while title/description are still in the source language; an `update` clears it. */
  translationPending?: boolean;
}

export interface RecipeSearchEmitter {
  /** A verified recipe page, emitted as soon as it resolves (title may still be untranslated). */
  onResult: (result: RecipeSearchResult) => void;
  /** Translated versions of previously emitted results, keyed by `url`. */
  onUpdate: (results: RecipeSearchResult[]) => void;
}

export interface RecipeSearchOptions {
  query: string;
  sources: RecipeSource[];
  signal: AbortSignal;
  /** Cap on grounded Gemini calls (default MAX_GROUNDING_CALLS). */
  maxCalls?: number;
  /** Translate non-Slovenian titles (default true). */
  translate?: boolean;
  /** Stop after this many results (default MAX_RESULTS). */
  maxResults?: number;
}

const MAX_RESULTS = 60;
// Grounding executes the searches inside one call sequentially (~3-5s each) while separate
// calls run in parallel, so wall time is set by searches-per-call and cost (billed per
// grounded call) by calls-per-search. 12 × 3 keeps an all-sites search around 15-25s.
const MAX_GROUNDING_CALLS = 12;
const MAX_SEARCHES_PER_CALL = 3;
const PHRASES_PER_LANGUAGE = 6;
const RESOLVE_CONCURRENCY = 8;
const GROUNDING_TIMEOUT_MS = 60_000;
const EXPANSION_TIMEOUT_MS = 10_000;
const TRANSLATION_BATCH_SIZE = 6;
const TRANSLATION_DEBOUNCE_MS = 250;
const TRANSLATION_CONCURRENCY = 4;

const debugEnabled = process.env.RECIPE_SEARCH_DEBUG === "1";
const debug = (message: string) => {
  if (debugEnabled) console.debug(`[recipe-search] ${message}`);
};

const noThinking = { thinkingConfig: { thinkingBudget: 0 } };

// ---------- Query expansion ----------

type QueryLanguage = Exclude<RecipeSourceLanguage, "mixed">;

const LANGUAGE_NAMES: Record<QueryLanguage, string> = {
  sl: "Slovenian",
  en: "English",
  hr: "Croatian",
  it: "Italian",
  de: "German",
  fr: "French"
};

/** Bilingual sites are searched with Slovenian phrases so their Slovenian pages surface. */
function searchLanguageOf(source: RecipeSource): QueryLanguage {
  return source.language === "mixed" ? "sl" : source.language;
}

function dedupePhrases(phrases: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of phrases) {
    const phrase = raw.trim().replace(/^["']|["']$/g, "");
    const key = phrase.toLowerCase();
    if (!phrase || seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
  }
  return out;
}

/** Translate + expand the query into short search phrases for every requested language. */
async function expandQuery(
  query: string,
  languages: QueryLanguage[],
  signal: AbortSignal
): Promise<Record<QueryLanguage, string[]>> {
  const fallback = Object.fromEntries(languages.map((l) => [l, [query]])) as Record<QueryLanguage, string[]>;
  if (!genai) return fallback;

  const prompt = `A user is searching recipe websites for "${query}" (written in Slovenian or English).
For each of these languages — ${languages.map((l) => `${l} (${LANGUAGE_NAMES[l]})`).join(", ")} — give up to ${PHRASES_PER_LANGUAGE} short Google search phrases (2-4 words, no quotes, no website names) that would find recipe pages for this dish or ingredient in that language.
Start with the plain translation of the query itself, then add common variations (e.g. with meat, vegetarian, quick, classic, with a typical ingredient).
Return ONLY JSON, no markdown: {${languages.map((l) => `"${l}": ["..."]`).join(", ")}}`;

  try {
    const response = await genai.models.generateContent({
      model: GEMINI_LITE_MODEL,
      contents: prompt,
      config: {
        ...jsonGenerationConfig({
          type: "object",
          properties: Object.fromEntries(languages.map((l) => [l, { type: "array", items: { type: "string" } }])),
          required: languages
        }),
        abortSignal: AbortSignal.any([signal, AbortSignal.timeout(EXPANSION_TIMEOUT_MS)])
      }
    });
    const parsed = JSON.parse(response.text ?? "{}") as Partial<Record<QueryLanguage, unknown>>;
    const out = { ...fallback };
    for (const language of languages) {
      const raw = parsed[language];
      const phrases = Array.isArray(raw) ? raw.filter((p): p is string => typeof p === "string") : [];
      // Always search the literal query too — the user knows what they typed.
      const withQuery = language === "sl" ? [query, ...phrases] : [...phrases, query];
      out[language] = dedupePhrases(withQuery).slice(0, PHRASES_PER_LANGUAGE);
    }
    debug(`phrases: ${JSON.stringify(out)}`);
    return out;
  } catch (error) {
    if (!signal.aborted) console.warn("[recipe-search] query expansion failed, using the raw query:", error);
    return fallback;
  }
}

// ---------- Search planning ----------

interface SearchUnit {
  source: RecipeSource;
  phrase: string;
}

/**
 * Spread the grounding budget over the selected sites: every site gets its primary phrase
 * first, then further phrases round-robin. Few sites → many calls with one search each
 * (more distinct result sets); many sites → a few searches per call.
 */
function planGroundingCalls(
  sources: RecipeSource[],
  phrases: Record<QueryLanguage, string[]>,
  maxCalls = MAX_GROUNDING_CALLS
): SearchUnit[][] {
  const units: SearchUnit[] = [];
  for (let i = 0; i < PHRASES_PER_LANGUAGE; i++) {
    for (const source of sources) {
      const phrase = phrases[searchLanguageOf(source)]?.[i];
      if (phrase) units.push({ source, phrase });
    }
  }
  const budget = units.slice(0, maxCalls * MAX_SEARCHES_PER_CALL);
  const perCall = Math.min(MAX_SEARCHES_PER_CALL, Math.max(1, Math.ceil(budget.length / maxCalls)));

  const calls: SearchUnit[][] = [];
  for (let i = 0; i < budget.length; i += perCall) calls.push(budget.slice(i, i + perCall));
  return calls;
}

function buildGroundingPrompt(units: SearchUnit[]): string {
  const searches = units.map((u) => `"${u.phrase} ${u.source.keyword ?? u.source.domain}"`).join(", ");
  const domains = Array.from(new Set(units.map((u) => u.source.domain))).join(", ");
  return `Search Google for each of these queries: ${searches}.
From the results, list every recipe page hosted on ${domains}, one per line as: <recipe name> — <URL>.
Only include URLs that actually appeared in the search results — never guess or invent URLs.
Skip category, tag, collection, search and article pages.`;
}

// ---------- Gemini grounding ----------

const domainLikePattern = /^[a-z0-9.-]+\.[a-z]{2,}$/i;
const urlInTextPattern = /https?:\/\/[^\s<>"'()\]]+/g;

/** Run one grounded call; returns candidate page URLs (grounding redirects + URLs the model wrote out). */
async function runGroundingCall(units: SearchUnit[], allowed: RecipeSource[], signal: AbortSignal): Promise<string[]> {
  if (!genai) return [];
  const label = units.map((u) => `${u.phrase} ${u.source.keyword ?? u.source.domain}`).join(" | ");
  const startedAt = Date.now();
  try {
    const response = await genai.models.generateContent({
      model: GEMINI_MODEL,
      contents: buildGroundingPrompt(units),
      config: {
        ...noThinking,
        tools: [{ googleSearch: {} }],
        abortSignal: AbortSignal.any([signal, AbortSignal.timeout(GROUNDING_TIMEOUT_MS)])
      }
    });

    const candidates: string[] = [];
    let skippedByHint = 0;
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    for (const groundingChunk of chunks) {
      const web = (groundingChunk as { web?: { uri?: string; title?: string } }).web;
      if (!web?.uri) continue;
      // Grounding titles are usually the bare hostname — skip pages from unselected sites
      // before paying for a fetch. Non-domain titles are kept and checked after resolving.
      const hint = web.title?.trim() ?? "";
      if (domainLikePattern.test(hint) && !domainHintMayMatchSource(hint, allowed)) {
        skippedByHint++;
        continue;
      }
      candidates.push(web.uri);
    }
    const fromChunks = candidates.length;

    for (const match of (response.text ?? "").match(urlInTextPattern) ?? []) {
      const url = match.replace(/[.,;:!?)]+$/, "");
      if (findRecipeSourceByHostname(hostname(url), allowed)) candidates.push(url);
    }

    const unique = Array.from(new Set(candidates));
    debug(
      `call [${label}] ${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${chunks.length} chunks (${skippedByHint} other sites), ` +
        `${fromChunks} kept, ${unique.length - fromChunks} from text → ${unique.length} candidates`
    );
    return unique;
  } catch (error) {
    if (!signal.aborted) console.warn(`[recipe-search] grounded search failed [${label}]:`, error);
    return [];
  }
}

// ---------- Candidate resolution ----------

/** Path segments that mark listing/hub/editorial pages anywhere in the URL. */
const LISTING_SEGMENTS = new Set([
  "search",
  "iskanje",
  "isci",
  "tag",
  "tags",
  "oznaka",
  "oznake",
  "kategorija",
  "kategorije",
  "category",
  "categories",
  "collection",
  "collections",
  "author",
  "avtor",
  "avtorji",
  "page",
  "stran",
  "topics",
  "cuisine",
  "kuhinje",
  "clanek",
  "clanki",
  "novice",
  "news",
  "article",
  "articles"
]);

/** Segments that only mean "hub page" when they are the last one (e.g. `/recepti`). */
const HUB_LAST_SEGMENTS = new Set([
  "recipes",
  "recepti",
  "recipe",
  "recept",
  "rezepte",
  "recettes",
  "ricette",
  "gallery",
  "galerija",
  "video",
  "videos"
]);

function looksLikeListingPage(url: string): boolean {
  let segments: string[];
  try {
    segments = new URL(url).pathname.split("/").filter(Boolean).map((s) => s.toLowerCase());
  } catch {
    return true;
  }
  if (segments.length === 0) return true;
  if (segments.some((s) => LISTING_SEGMENTS.has(s))) return true;
  return HUB_LAST_SEGMENTS.has(segments[segments.length - 1]!);
}

/** Resolve a candidate URL (possibly a grounding redirect) to a verified recipe page with display metadata. */
async function resolveCandidate(
  candidateUrl: string,
  allowed: RecipeSource[],
  signal: AbortSignal
): Promise<RecipeSearchResult | null> {
  const reject = (reason: string, url = candidateUrl) => {
    debug(`drop (${reason}): ${url}`);
    return null;
  };

  const fetched = await fetchWithResolvedUrl(candidateUrl, 8000, signal);
  if (!fetched) return reject("fetch failed");

  const { finalUrl, html } = fetched;
  if (isBlockedHost(finalUrl) || !isPublicHttpUrl(finalUrl)) return reject("blocked host", finalUrl);

  const source = findRecipeSourceByHostname(hostname(finalUrl), allowed);
  if (!source) return reject("other site", finalUrl);

  const cleanUrl = stripQueryAndFragment(finalUrl);
  if (looksLikeListingPage(cleanUrl)) return reject("listing page", cleanUrl);

  const title = stripSiteSuffix(extractOgMeta(html, "title") || extractPageTitle(html));
  if (!title || title.length < 3) return reject("no title", cleanUrl);

  const description = (extractOgMeta(html, "description") || extractMetaName(html, "description")).slice(0, 350);
  const ogImage = extractOgMeta(html, "image");
  // Thumbnails go through the signed proxy — most sites refuse hotlinked <img> requests.
  const imageUrl = ogImage ? signImageProxyUrl(absoluteUrl(ogImage, finalUrl), 320) : undefined;

  return { title, description, imageUrl, url: cleanUrl, source: hostname(cleanUrl), sourceId: source.id };
}

// ---------- Translation ----------

async function translateResultsToSlovenian(
  results: RecipeSearchResult[],
  signal: AbortSignal
): Promise<RecipeSearchResult[]> {
  if (!genai || results.length === 0) return results;
  const startedAt = Date.now();

  // Detect the actual language of each result's own text rather than guessing from the
  // hostname — sites like jernejkitchen.com publish recipes in both Slovenian and English,
  // so which language a given result is in can't be assumed from its domain alone.
  const payload = results.map((r) => ({ title: r.title, description: r.description }));
  const prompt = `For each recipe below, translate the title and description into Slovenian; return them unchanged only if they are already Slovenian.
${SLOVENIAN_TRANSLATION_RULES}
Return a JSON array of objects with "title" and "description" keys, in the same order as the input.

Input: ${JSON.stringify(payload)}`;

  try {
    const response = await genai.models.generateContent({
      model: GEMINI_LITE_MODEL,
      contents: prompt,
      config: {
        ...jsonGenerationConfig({
          type: "array",
          items: {
            type: "object",
            properties: { title: { type: "string" }, description: { type: "string" } },
            required: ["title", "description"]
          }
        }),
        abortSignal: signal
      }
    });
    const translated = JSON.parse(response.text ?? "[]") as Array<{ title: string; description: string }>;
    debug(`translated ${results.length} results in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

    return results.map((r, i) => {
      const t = translated[i];
      return {
        ...r,
        title: t?.title || r.title,
        description: t?.description ?? r.description,
        translationPending: false
      };
    });
  } catch (error) {
    if (!signal.aborted) console.warn("[recipe-search] translation failed:", error);
    // Show the originals rather than leaving cards greyed out forever.
    return results.map((r) => ({ ...r, translationPending: false }));
  }
}

/**
 * Collects results that need translating and sends them to Gemini in small batches —
 * either once enough have piled up or shortly after the first one arrived — so titles
 * update while the search is still running without one call per result.
 */
class TranslationQueue {
  private pending: RecipeSearchResult[] = [];
  private timer: NodeJS.Timeout | null = null;
  private inFlight = new Set<Promise<void>>();
  private readonly limit = createLimiter(TRANSLATION_CONCURRENCY);

  constructor(
    private readonly signal: AbortSignal,
    private readonly onTranslated: (results: RecipeSearchResult[]) => void
  ) {}

  push(result: RecipeSearchResult) {
    this.pending.push(result);
    if (this.pending.length >= TRANSLATION_BATCH_SIZE) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), TRANSLATION_DEBOUNCE_MS);
    }
  }

  private flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];
    const job = this.limit(async () => {
      if (this.signal.aborted) return;
      const translated = await translateResultsToSlovenian(batch, this.signal);
      if (!this.signal.aborted) this.onTranslated(translated);
    }).finally(() => this.inFlight.delete(job));
    this.inFlight.add(job);
  }

  /** Flush whatever is left and wait for every batch to finish. */
  async drain() {
    this.flush();
    while (this.inFlight.size > 0) await Promise.allSettled(Array.from(this.inFlight));
  }
}

// ---------- Concurrency ----------

function createLimiter(max: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

// ---------- Orchestration ----------

/**
 * Run the full search. Resolves when every grounded call has been processed (or the
 * signal is aborted) and all translations are delivered. Results are pushed through
 * `emit` as they become available.
 */
export async function runRecipeSearch(
  { query, sources, signal, maxCalls, translate = true, maxResults = MAX_RESULTS }: RecipeSearchOptions,
  emit: RecipeSearchEmitter
): Promise<void> {
  if (!genai || sources.length === 0) return;
  const startedAt = Date.now();

  const languages = Array.from(new Set(sources.map(searchLanguageOf)));
  const phrases = await expandQuery(query, languages, signal);
  if (signal.aborted) return;

  const calls = planGroundingCalls(sources, phrases, maxCalls);
  const seenCandidates = new Set<string>();
  const seenUrls = new Set<string>();
  const limitResolve = createLimiter(RESOLVE_CONCURRENCY);
  const translations = new TranslationQueue(signal, emit.onUpdate);
  let emitted = 0;

  // Once the result cap is reached, cancel outstanding searches and page fetches so a slow
  // grounded call can't keep the response open; translations still finish for shown results.
  const capReached = new AbortController();
  const searchSignal = AbortSignal.any([signal, capReached.signal]);
  const isDone = () => searchSignal.aborted;

  await Promise.allSettled(
    calls.map(async (units) => {
      if (isDone()) return;
      const candidates = await runGroundingCall(units, sources, searchSignal);

      await Promise.allSettled(
        candidates.map((candidate) =>
          limitResolve(async () => {
            if (isDone() || seenCandidates.has(candidate)) return;
            seenCandidates.add(candidate);

            const result = await resolveCandidate(candidate, sources, searchSignal);
            if (!result || isDone() || seenUrls.has(result.url)) return;

            seenUrls.add(result.url);
            emitted++;
            const needsTranslation = translate && findRecipeSourceByHostname(result.source, sources)?.language !== "sl";
            emit.onResult({ ...result, translationPending: needsTranslation });
            if (needsTranslation) translations.push(result);
            if (emitted >= maxResults) capReached.abort();
          })
        )
      );
    })
  );

  await translations.drain();

  console.log(
    `[recipe-search] "${query}" on ${sources.length} site(s): ${calls.length} grounded calls, ` +
      `${seenCandidates.size} candidates, ${emitted} results in ${((Date.now() - startedAt) / 1000).toFixed(1)}s` +
      (signal.aborted ? " (aborted)" : "")
  );
}
