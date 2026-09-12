// Catalog of recipe websites the search can target. Served to the web app via
// GET /api/recipes/sources so the UI and the server share one source of truth.
//
// Every entry was verified to (a) show up in Gemini Google-Search grounding and (b) serve
// recipe pages to a plain server-side fetch. Large publishers that block AI crawlers or
// bot traffic (Allrecipes/Serious Eats/Simply Recipes, Epicurious/Bon Appétit, Delish,
// Tasty, taste.com.au, The Kitchn, Minimalist Baker, Chefkoch's neighbours…) never surface
// in grounding or 403 the fetch, so they are deliberately absent.

export type RecipeSourceGroup = "slovenian" | "world";

/** Primary publishing language; "mixed" = site publishes in Slovenian and other languages. */
export type RecipeSourceLanguage = "sl" | "en" | "hr" | "it" | "de" | "fr" | "mixed";

export interface RecipeSource {
  id: string;
  label: string;
  domain: string;
  group: RecipeSourceGroup;
  language: RecipeSourceLanguage;
  /**
   * Keyword appended to search phrases to steer Google towards this site (grounding strips
   * the `site:` operator). Defaults to the domain; brands that Google knows by name work
   * better with the name.
   */
  keyword?: string;
}

export const RECIPE_SOURCES: readonly RecipeSource[] = [
  // ---- Slovenian ----
  { id: "kulinarika", label: "Kulinarika.net", domain: "kulinarika.net", group: "slovenian", language: "sl" },
  { id: "okusno", label: "Okusno.je", domain: "okusno.je", group: "slovenian", language: "sl" },
  { id: "mojirecepti", label: "Moji recepti", domain: "mojirecepti.com", group: "slovenian", language: "sl" },
  { id: "kuharica", label: "Kuharica.si", domain: "kuharica.si", group: "slovenian", language: "sl" },
  { id: "odprta-kuhinja", label: "Odprta kuhinja", domain: "odprtakuhinja.delo.si", group: "slovenian", language: "sl" },
  { id: "lidl", label: "Lidl recepti", domain: "lidl.si", group: "slovenian", language: "sl", keyword: "lidl.si recepti" },
  { id: "jernejkitchen", label: "Jernej Kitchen", domain: "jernejkitchen.com", group: "slovenian", language: "mixed" },

  // ---- Worldwide (English) ----
  { id: "bbcgoodfood", label: "BBC Good Food", domain: "bbcgoodfood.com", group: "world", language: "en" },
  { id: "foodnetwork", label: "Food Network", domain: "foodnetwork.com", group: "world", language: "en" },
  { id: "food-com", label: "Food.com", domain: "food.com", group: "world", language: "en" },
  { id: "jamieoliver", label: "Jamie Oliver", domain: "jamieoliver.com", group: "world", language: "en", keyword: "jamie oliver" },
  { id: "budgetbytes", label: "Budget Bytes", domain: "budgetbytes.com", group: "world", language: "en" },
  { id: "recipetineats", label: "RecipeTin Eats", domain: "recipetineats.com", group: "world", language: "en" },
  { id: "natashaskitchen", label: "Natasha's Kitchen", domain: "natashaskitchen.com", group: "world", language: "en", keyword: "natashaskitchen" },
  { id: "gimmesomeoven", label: "Gimme Some Oven", domain: "gimmesomeoven.com", group: "world", language: "en", keyword: "gimme some oven" },
  { id: "spendwithpennies", label: "Spend With Pennies", domain: "spendwithpennies.com", group: "world", language: "en", keyword: "spend with pennies" },
  { id: "cafedelites", label: "Cafe Delites", domain: "cafedelites.com", group: "world", language: "en", keyword: "cafe delites" },
  { id: "onceuponachef", label: "Once Upon a Chef", domain: "onceuponachef.com", group: "world", language: "en", keyword: "once upon a chef" },
  { id: "preppykitchen", label: "Preppy Kitchen", domain: "preppykitchen.com", group: "world", language: "en", keyword: "preppy kitchen" },
  { id: "sallysbaking", label: "Sally's Baking", domain: "sallysbakingaddiction.com", group: "world", language: "en", keyword: "sallys baking addiction" },
  { id: "kingarthur", label: "King Arthur Baking", domain: "kingarthurbaking.com", group: "world", language: "en", keyword: "king arthur baking" },
  { id: "loveandlemons", label: "Love & Lemons", domain: "loveandlemons.com", group: "world", language: "en", keyword: "love and lemons" },

  // ---- Worldwide (other languages) ----
  { id: "coolinarika", label: "Coolinarika (HR)", domain: "coolinarika.com", group: "world", language: "hr" },
  { id: "giallozafferano", label: "GialloZafferano (IT)", domain: "giallozafferano.it", group: "world", language: "it" },
  { id: "cucchiaio", label: "Cucchiaio (IT)", domain: "cucchiaio.it", group: "world", language: "it" },
  { id: "chefkoch", label: "Chefkoch (DE)", domain: "chefkoch.de", group: "world", language: "de" },
  { id: "lecker", label: "Lecker (DE)", domain: "lecker.de", group: "world", language: "de" },
  { id: "marmiton", label: "Marmiton (FR)", domain: "marmiton.org", group: "world", language: "fr" },
  { id: "750g", label: "750g (FR)", domain: "750g.com", group: "world", language: "fr" },
];

const sourceById = new Map(RECIPE_SOURCES.map((s) => [s.id, s]));

/** Resolve a list of ids to catalog entries, dropping unknown ids and duplicates (order preserved). */
export function resolveRecipeSources(ids: readonly string[]): RecipeSource[] {
  const seen = new Set<string>();
  const out: RecipeSource[] = [];
  for (const id of ids) {
    const source = sourceById.get(id);
    if (source && !seen.has(source.id)) {
      seen.add(source.id);
      out.push(source);
    }
  }
  return out;
}

/** Match a hostname (with or without "www.") against a source's domain, including subdomains. */
export function hostnameMatchesSource(hostname: string, source: RecipeSource): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return h === source.domain || h.endsWith(`.${source.domain}`);
}

export function findRecipeSourceByHostname(
  hostname: string,
  candidates: readonly RecipeSource[] = RECIPE_SOURCES
): RecipeSource | undefined {
  return candidates.find((s) => hostnameMatchesSource(hostname, s));
}

/**
 * Loose check for a domain hint that may be either the page's hostname or just its
 * registrable domain (grounding reports `delo.si` for `odprtakuhinja.delo.si`).
 */
export function domainHintMayMatchSource(hint: string, candidates: readonly RecipeSource[]): boolean {
  const h = hint.toLowerCase().replace(/^www\./, "");
  return candidates.some((s) => hostnameMatchesSource(h, s) || s.domain === h || s.domain.endsWith(`.${h}`));
}
