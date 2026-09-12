// Web image search (Bing Images HTML) shared by item and recipe image pickers.

import { browserHtmlHeaders } from "../utils/html.js";

/** Pull the full-size image URLs ("murl") out of a Bing Images result page. */
export function extractBingImageUrls(html: string): string[] {
  const urls: string[] = [];
  const marker = "murl&quot;:&quot;";
  let idx = 0;
  while (idx < html.length) {
    const start = html.indexOf(marker, idx);
    if (start === -1) break;
    const urlStart = start + marker.length;
    const end = html.indexOf("&quot;", urlStart);
    if (end === -1) break;
    const raw = html.slice(urlStart, end).replace(/&amp;/g, "&");
    if (raw.startsWith("http")) urls.push(raw);
    idx = end + 6;
  }

  const plainRe = /"murl":"(https?:[^"]+)"/g;
  let match: RegExpExecArray | null = plainRe.exec(html);
  while (match !== null) {
    urls.push(match[1]!.replace(/\\\//g, "/"));
    match = plainRe.exec(html);
  }

  return Array.from(new Set(urls));
}

/** Search Bing Images and return full-size image URLs in result order. */
export async function searchBingImages(query: string, market = "sl-SI", timeoutMs = 6500): Promise<string[]> {
  const params = new URLSearchParams({ q: query, first: "1", mkt: market, form: "HDRSC2" });
  const searchUrl = `https://www.bing.com/images/search?${params.toString()}`;
  try {
    const response = await fetch(searchUrl, {
      headers: { ...browserHtmlHeaders, Referer: "https://www.bing.com/" },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) return [];
    return extractBingImageUrls(await response.text());
  } catch {
    return [];
  }
}

export const BING_IMAGE_SEARCH_URL = (query: string, market = "sl-SI"): string =>
  `https://www.bing.com/images/search?${new URLSearchParams({ q: query, first: "1", mkt: market, form: "HDRSC2" }).toString()}`;
