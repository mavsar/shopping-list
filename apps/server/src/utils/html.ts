// Shared HTTP fetching + lightweight HTML metadata helpers for recipe pages.

// Domains that are clearly not single recipe pages — drop them from results
export const BLOCKED_HOSTNAMES = [
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

// ---------- HTTP helpers ----------

export const browserHtmlHeaders: HeadersInit = {
  // Safari UA: some sites (e.g. kulinarika.net) 403 the common Chrome-on-Windows bot signature.
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "sl-SI,sl;q=0.9,en-US;q=0.8,en;q=0.7"
};

/** Fetch a URL following redirects; returns the final resolved URL and HTML body. */
export async function fetchWithResolvedUrl(
  url: string,
  timeoutMs = 8000,
  signal?: AbortSignal
): Promise<{ finalUrl: string; html: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: browserHtmlHeaders,
      redirect: "follow",
      signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal
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

export async function fetchHtml(url: string, timeoutMs = 8000): Promise<string> {
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

export function decodeHtmlEntities(str: string): string {
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

export function extractOgMeta(html: string, property: string): string {
  const p1 = new RegExp(`<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']+)["']`, "i");
  const p2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${property}["']`, "i");
  const m = p1.exec(html) ?? p2.exec(html);
  return m?.[1] ? decodeHtmlEntities(m[1]) : "";
}

export function extractMetaName(html: string, name: string): string {
  const re = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i");
  const m = re.exec(html);
  return m?.[1] ? decodeHtmlEntities(m[1]) : "";
}

export function extractPageTitle(html: string): string {
  const m = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return m?.[1] ? decodeHtmlEntities(m[1].trim()) : "";
}

/** Drop a trailing " - Site name" / " | Site name"; hyphens inside words ("Home-style curry") stay. */
export function stripSiteSuffix(title: string): string {
  return title.replace(/\s+[-–—]\s+[^-–—|]+$|\s*\|\s*[^|]+$/, "").trim();
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function stripQueryAndFragment(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

export function isBlockedHost(url: string): boolean {
  const h = hostname(url);
  return BLOCKED_HOSTNAMES.some((d) => h === d || h.endsWith(`.${d}`));
}

/** Block SSRF: only allow public http(s) hosts. */
export function isPublicHttpUrl(url: string): boolean {
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
