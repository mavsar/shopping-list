import { Router } from "express";
import { z } from "zod";

import { sqlite } from "../db/client.js";
import { normalizeTitle } from "../domain/items.js";
import { requireAuth } from "../middleware/auth.js";

const suggestQuerySchema = z.object({
  q: z.string().trim().min(1),
  limit: z.coerce.number().int().min(1).max(25).optional()
});

const findImageQuerySchema = z.object({
  q: z.string().trim().min(2).max(200)
});

export const itemsRouter = Router();

const slovenianDomains = [
  "mimovrste.com",
  "mercator.si",
  "spar.si",
  "hofer.si",
  "bauhaus.si",
  "merkur.si",
  "bigbang.si"
];

const browserHtmlHeaders: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "sl-SI,sl;q=0.9,en-US;q=0.8,en;q=0.7"
};

async function fetchHtml(url: string, init?: RequestInit): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...browserHtmlHeaders,
        ...(init?.headers ?? {})
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchHtmlPost(url: string, body: string): Promise<string> {
  return fetchHtml(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
}

function extractImageFromHtml(html: string): string | null {
  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  if (ogMatch?.[1]) {
    return ogMatch[1];
  }

  const twitterMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  if (twitterMatch?.[1]) {
    return twitterMatch[1];
  }

  return null;
}

function normalizeTerm(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function extractTitleFromHtml(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return titleMatch?.[1]?.trim() ?? "";
}

function extractImageCandidates(html: string, pageUrl: string): string[] {
  const candidates: string[] = [];
  const ogImage = extractImageFromHtml(html);
  if (ogImage) {
    candidates.push(ogImage);
  }

  const imgSrcMatches = Array.from(html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi))
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value))
    .slice(0, 20);

  for (const rawSrc of imgSrcMatches) {
    try {
      const absoluteUrl = new URL(rawSrc, pageUrl).toString();
      candidates.push(absoluteUrl);
    } catch {
      continue;
    }
  }

  return Array.from(new Set(candidates));
}

function scoreImageCandidate(imageUrl: string, sourceUrl: string, pageTitle: string, query: string): number {
  const queryTerms = normalizeTerm(query).split(/\s+/).filter(Boolean);
  const haystack = normalizeTerm(`${sourceUrl} ${imageUrl} ${pageTitle}`);
  let score = 0;

  for (const queryTerm of queryTerms) {
    if (queryTerm.length < 2) {
      continue;
    }
    if (haystack.includes(queryTerm)) {
      score += 3;
    }
  }

  const preferredTokens = ["izdelek", "produkt", "product", "article", "item"];
  const rejectedTokens = ["logo", "icon", "sprite", "banner", "placeholder", "avatar", "favicon"];

  for (const token of preferredTokens) {
    if (haystack.includes(token)) {
      score += 2;
    }
  }

  for (const token of rejectedTokens) {
    if (haystack.includes(token)) {
      score -= 3;
    }
  }

  if (/\.(webp|jpg|jpeg|png)(\?|$)/i.test(imageUrl)) {
    score += 1;
  }

  if (/\/(products?|artikli|izdelek)\//i.test(sourceUrl)) {
    score += 2;
  }

  return score;
}

function extractResultLinks(html: string): string[] {
  const links = Array.from(html.matchAll(/<a[^>]+href=["'](https?:\/\/[^"']+)["']/gi))
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(links));
}

/** DuckDuckGo lite / redirect URLs encode the destination as `uddg=` */
function extractDdgUddgLinks(html: string): string[] {
  const out: string[] = [];
  const re = /uddg=([^&"'<>\s]+)/gi;
  let match: RegExpExecArray | null = re.exec(html);
  while (match !== null) {
    try {
      let decoded = decodeURIComponent(match[1].replace(/\+/g, "%20"));
      if (decoded.startsWith("//")) {
        decoded = `https:${decoded}`;
      }
      if (decoded.startsWith("http")) {
        out.push(decoded);
      }
    } catch {
      // skip malformed escape sequences
    }
    match = re.exec(html);
  }
  return out;
}

function extractBingResultLinks(html: string): string[] {
  const out: string[] = [];
  const re = /<h2[^>]*>\s*<a[^>]+href="([^"]+)"/gi;
  let match: RegExpExecArray | null = re.exec(html);
  while (match !== null) {
    const href = match[1].replace(/&amp;/g, "&");
    if (
      href.startsWith("http") &&
      !href.includes("bing.com") &&
      !href.includes("microsoft.com") &&
      !href.startsWith("javascript:")
    ) {
      out.push(href);
    }
    match = re.exec(html);
  }
  return Array.from(new Set(out));
}

function filterLinksForDomain(links: string[], domain: string): string[] {
  return links.filter((link) => {
    try {
      const parsed = new URL(link);
      return parsed.hostname.includes(domain);
    } catch {
      return false;
    }
  });
}

async function collectSearchResultUrls(domain: string, query: string): Promise<string[]> {
  const searchPhrase = `site:${domain} ${query}`;
  const merged = new Set<string>();

  const absorb = (rawLinks: string[]) => {
    for (const link of filterLinksForDomain(rawLinks, domain)) {
      merged.add(link.split("#")[0]);
    }
  };

  try {
    const ddgHtml = await fetchHtml(`https://duckduckgo.com/html/?q=${encodeURIComponent(searchPhrase)}`);
    absorb(extractResultLinks(ddgHtml));
    absorb(extractDdgUddgLinks(ddgHtml));
  } catch {
    // ignore — try other providers
  }

  try {
    const liteBody = `q=${encodeURIComponent(searchPhrase)}`;
    const liteHtml = await fetchHtmlPost("https://lite.duckduckgo.com/lite/", liteBody);
    absorb(extractResultLinks(liteHtml));
    absorb(extractDdgUddgLinks(liteHtml));
  } catch {
    // ignore
  }

  try {
    const bingHtml = await fetchHtml(`https://www.bing.com/search?q=${encodeURIComponent(searchPhrase)}`);
    absorb(extractBingResultLinks(bingHtml));
  } catch {
    // ignore
  }

  return Array.from(merged);
}

/**
 * Bing Images embeds full-size URLs in static HTML as `murl&quot;:&quot;https://…&quot;`.
 * Google Images loads results almost entirely via JavaScript, so server-side fetch sees no image URLs.
 */
function extractBingImagesMurls(html: string): string[] {
  const urls: string[] = [];
  const marker = 'murl&quot;:&quot;';
  let idx = 0;
  while (idx < html.length) {
    const start = html.indexOf(marker, idx);
    if (start === -1) {
      break;
    }
    const urlStart = start + marker.length;
    const end = html.indexOf("&quot;", urlStart);
    if (end === -1) {
      break;
    }
    const raw = html.slice(urlStart, end).replace(/&amp;/g, "&");
    if (raw.startsWith("http")) {
      urls.push(raw);
    }
    idx = end + 6;
  }

  const plainRe = /"murl":"(https?:[^"]+)"/g;
  let match: RegExpExecArray | null = plainRe.exec(html);
  while (match !== null) {
    urls.push(match[1].replace(/\\\//g, "/"));
    match = plainRe.exec(html);
  }

  return Array.from(new Set(urls));
}

/** Bare mimovrste.com/i/{id} URLs frequently serve promo banners; product shots usually include /w/h segments. */
function mimovrsteBareTilePenalty(imageUrl: string): number {
  try {
    const u = new URL(imageUrl);
    if (!u.hostname.endsWith("mimovrste.com")) {
      return 0;
    }
    if (/^\/i\/\d+\/?$/i.test(u.pathname)) {
      return -18;
    }
  } catch {
    return 0;
  }
  return 0;
}

/** Boost URLs that clearly relate to the search word (esp. generic groceries like “kruh”). */
function queryVisualHintBonus(imageUrl: string, normalizedQuerySingleWord: string): number {
  const hints: Record<string, RegExp> = {
    kruh: /kruh|bread|hleb|baguet|bageta|pecivo|pekarna|toast|zito|rezan/i,
    mleko: /mleko|milk|mliec|mlecn/i,
    jajca: /jajce|jajca|egg/i,
    maslo: /maslo|butter|butters/i,
    sir: /sir|cheese|sirov/i,
    meso: /meso|meat|rezilo|steak/i
  };
  const rx = hints[normalizedQuerySingleWord];
  if (!rx) {
    return 0;
  }
  return rx.test(normalizeTerm(imageUrl)) ? 10 : 0;
}

function scoreWebImageSearchUrl(imageUrl: string, query: string, rankIndex: number): number {
  const normalizedUrl = normalizeTerm(imageUrl);
  const primaryWord = normalizeTerm(query).split(/\s+/).filter(Boolean)[0] ?? "";

  let score = 0;
  for (const term of normalizeTerm(query).split(/\s+/).filter((value) => value.length > 1)) {
    if (normalizedUrl.includes(term)) {
      score += 6;
    }
  }

  score += queryVisualHintBonus(imageUrl, primaryWord);
  score += mimovrsteBareTilePenalty(imageUrl);

  if (/\.(jpg|jpeg|png|webp)(\?|#|$)/i.test(imageUrl)) {
    score += 4;
  }

  if (/okusno|kulinarika|jernej|recept|kuhar|kuham|foodblog|damndelicious|bbcgoodfood/i.test(imageUrl)) {
    score += 5;
  }

  if (
    /popust|akcija|banner|cms-|hero|black.?friday|sale|deal|percent|pct.?off|oznaka|gratis|promo|lbl-|tag-|sticker|ribbon/i.test(
      normalizedUrl
    )
  ) {
    score -= 28;
  }

  if (/%25|%2[cC]|eur.?off|€|black-friday/i.test(imageUrl)) {
    score -= 12;
  }

  if (imageUrl.includes("encrypted-tbn")) {
    score -= 12;
  }
  if (imageUrl.includes("gstatic.com") || imageUrl.includes("googleusercontent.com")) {
    score -= 4;
  }
  if (/logo|favicon|sprite|badge|phpThumb\.php\?w=(?:64|48)\b/i.test(normalizedUrl)) {
    score -= 10;
  }

  score += Math.min(Math.floor(imageUrl.length / 80), 3);

  score -= Math.min(rankIndex, 10);

  return score;
}

async function lookupBingImages(query: string): Promise<{ imageUrl: string; sourceUrl: string } | null> {
  try {
    const params = new URLSearchParams({
      q: query,
      first: "1",
      mkt: "sl-SI",
      form: "HDRSC2"
    });
    const searchUrl = `https://www.bing.com/images/search?${params.toString()}`;
    const html = await fetchHtml(searchUrl, {
      headers: {
        Referer: "https://www.bing.com/"
      }
    });
    const candidates = extractBingImagesMurls(html);
    if (!candidates.length) {
      return null;
    }
    let bestUrl = candidates[0];
    let bestScore = scoreWebImageSearchUrl(bestUrl, query, 0);
    candidates.slice(1, 80).forEach((candidate, index) => {
      const candidateScore = scoreWebImageSearchUrl(candidate, query, index + 1);
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        bestUrl = candidate;
      }
    });

    if (bestScore < -8) {
      return null;
    }

    return {
      imageUrl: bestUrl,
      sourceUrl: searchUrl
    };
  } catch {
    return null;
  }
}

async function lookupOpenFoodFactsImage(query: string): Promise<{ imageUrl: string; sourceUrl: string } | null> {
  try {
    const searchUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
      query
    )}&search_simple=1&action=process&json=1&page_size=10`;
    const response = await fetch(searchUrl, {
      headers: browserHtmlHeaders
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as {
      products?: Array<{
        image_front_url?: string;
        image_url?: string;
        code?: string;
      }>;
    };
    const products = data.products;
    if (!Array.isArray(products)) {
      return null;
    }
    for (const product of products) {
      const imageUrl = product.image_front_url ?? product.image_url;
      if (typeof imageUrl === "string" && imageUrl.startsWith("http")) {
        const sourceUrl =
          typeof product.code === "string" && product.code.length > 0
            ? `https://world.openfoodfacts.org/product/${product.code}`
            : imageUrl;
        return { imageUrl, sourceUrl };
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function lookupImage(query: string): Promise<{ imageUrl: string; sourceUrl: string } | null> {
  let bestMatch: { imageUrl: string; sourceUrl: string; score: number } | null = null;

  for (const domain of slovenianDomains) {
    let resultLinks: string[] = [];
    try {
      resultLinks = await collectSearchResultUrls(domain, query);
    } catch {
      continue;
    }

    for (const resultLink of resultLinks.slice(0, 8)) {
      try {
        const pageHtml = await fetchHtml(resultLink);
        const pageTitle = extractTitleFromHtml(pageHtml);
        const imageCandidates = extractImageCandidates(pageHtml, resultLink);

        for (const imageCandidate of imageCandidates) {
          const candidateScore = scoreImageCandidate(imageCandidate, resultLink, pageTitle, query);
          if (!bestMatch || candidateScore > bestMatch.score) {
            bestMatch = {
              imageUrl: imageCandidate,
              sourceUrl: resultLink,
              score: candidateScore
            };
          }
        }
      } catch {
        continue;
      }
    }
  }

  if (bestMatch) {
    return {
      imageUrl: bestMatch.imageUrl,
      sourceUrl: bestMatch.sourceUrl
    };
  }

  const bingImage = await lookupBingImages(query);
  if (bingImage) {
    return bingImage;
  }

  return lookupOpenFoodFactsImage(query);
}

itemsRouter.get("/suggest", requireAuth, (req, res) => {
  const parsed = suggestQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid query parameters",
      details: parsed.error.flatten()
    });
  }

  const query = normalizeTitle(parsed.data.q);
  const limit = parsed.data.limit ?? 8;

  const items = sqlite
    .prepare(
      `
      SELECT id, title, normalized_title AS normalizedTitle, image_url AS imageUrl, category
      FROM items
      WHERE normalized_title LIKE ?
      ORDER BY title ASC
      LIMIT ?
      `
    )
    .all(`%${query}%`, limit);

  return res.json({ items });
});

itemsRouter.get("/find-image", requireAuth, async (req, res) => {
  const parsed = findImageQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid query parameters",
      details: parsed.error.flatten()
    });
  }

  const query = parsed.data.q;

  const cachedItem = sqlite
    .prepare(
      `
      SELECT image_url AS imageUrl, source_url AS sourceUrl
      FROM items
      WHERE normalized_title = ? AND image_url IS NOT NULL
      LIMIT 1
      `
    )
    .get(normalizeTitle(query)) as { imageUrl: string; sourceUrl: string | null } | undefined;

  if (cachedItem) {
    return res.json({
      found: true,
      imageUrl: cachedItem.imageUrl,
      sourceUrl: cachedItem.sourceUrl,
      fromCache: true
    });
  }

  const foundImage = await lookupImage(query);
  if (!foundImage) {
    return res.json({
      found: false,
      error: "No image found yet. Try another wording or paste an image URL."
    });
  }

  return res.json({
    found: true,
    imageUrl: foundImage.imageUrl,
    sourceUrl: foundImage.sourceUrl,
    fromCache: false
  });
});
