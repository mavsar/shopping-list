// Signed image proxy for recipe pictures that are not stored locally (search results,
// recipes opened from a search). Browsers can't hotlink most recipe-site images (Referer
// checks, CDN rules), but the server can fetch them with a browser UA and the site as
// Referer. Images are resized to the requested width and cached in memory.
//
// URLs are HMAC-signed so the endpoint can stay unauthenticated (an <img> tag can't send
// a bearer token) without becoming an open proxy.

import crypto from "node:crypto";
import sharp from "sharp";
import { fetchImageBuffer, isPublicHttpUrl } from "../utils/html.js";

export const IMAGE_PROXY_PATH = "/api/recipes/image";

const ALLOWED_WIDTHS = new Set([320, 800, 1280]);
const CACHE_MAX_BYTES = 80 * 1024 * 1024;
const CACHE_TTL_MS = 6 * 60 * 60_000;
const SOURCE_CACHE_MAX_BYTES = 60 * 1024 * 1024;
const SOURCE_CACHE_TTL_MS = 20 * 60_000;

const secret = process.env.IMAGE_PROXY_SECRET?.trim() || crypto.randomBytes(32).toString("hex");

function sign(url: string, width: number): string {
  return crypto.createHmac("sha256", secret).update(`${width}|${url}`).digest("base64url").slice(0, 32);
}

/** Build a proxied, signed URL for a remote image at the given display width. */
export function signImageProxyUrl(url: string, width: number): string {
  const w = ALLOWED_WIDTHS.has(width) ? width : 800;
  const params = new URLSearchParams({ u: url, w: String(w), s: sign(url, w) });
  return `${IMAGE_PROXY_PATH}?${params.toString()}`;
}

export function verifyImageProxyParams(url: string, width: number, signature: string): boolean {
  if (!ALLOWED_WIDTHS.has(width) || !isPublicHttpUrl(url)) return false;
  const expected = sign(url, width);
  return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/** Map a proxied URL back to the original remote URL (other values pass through unchanged). */
export function unproxyImageUrl(value: string): string {
  if (!value.startsWith(`${IMAGE_PROXY_PATH}?`)) return value;
  const params = new URLSearchParams(value.slice(IMAGE_PROXY_PATH.length + 1));
  const url = params.get("u") ?? "";
  const width = Number(params.get("w"));
  const signature = params.get("s") ?? "";
  return verifyImageProxyParams(url, width, signature) ? url : value;
}

// ---------- Caches ----------

interface CacheEntry<T> {
  value: T;
  bytes: number;
  at: number;
}

class ByteLruCache<T> {
  private readonly map = new Map<string, CacheEntry<T>>();
  private bytes = 0;

  constructor(
    private readonly maxBytes: number,
    private readonly ttlMs: number
  ) {}

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.at > this.ttlMs) {
      this.delete(key);
      return undefined;
    }
    // refresh recency
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, bytes: number): void {
    if (bytes > this.maxBytes / 4) return; // never let one giant image dominate the cache
    this.delete(key);
    this.map.set(key, { value, bytes, at: Date.now() });
    this.bytes += bytes;
    while (this.bytes > this.maxBytes) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.delete(oldest);
    }
  }

  private delete(key: string): void {
    const entry = this.map.get(key);
    if (!entry) return;
    this.map.delete(key);
    this.bytes -= entry.bytes;
  }
}

export interface ProxiedImage {
  body: Buffer;
  contentType: string;
}

const processedCache = new ByteLruCache<ProxiedImage>(CACHE_MAX_BYTES, CACHE_TTL_MS);
const sourceCache = new ByteLruCache<Buffer>(SOURCE_CACHE_MAX_BYTES, SOURCE_CACHE_TTL_MS);
const inFlight = new Map<string, Promise<ProxiedImage | null>>();
const sourceInFlight = new Map<string, Promise<Buffer | null>>();

/** Original bytes of a remote image, shared between the proxy and local saving. */
export async function getSourceImageBuffer(url: string): Promise<Buffer | null> {
  const cached = sourceCache.get(url);
  if (cached) return cached;

  const pending = sourceInFlight.get(url);
  if (pending) return pending;

  const job = fetchImageBuffer(url)
    .then((buffer) => {
      if (buffer && buffer.length > 0) sourceCache.set(url, buffer, buffer.length);
      return buffer;
    })
    .finally(() => sourceInFlight.delete(url));
  sourceInFlight.set(url, job);
  return job;
}

async function contentTypeOf(buffer: Buffer): Promise<string> {
  try {
    const { format } = await sharp(buffer).metadata();
    return format ? `image/${format === "jpg" ? "jpeg" : format}` : "application/octet-stream";
  } catch {
    return "application/octet-stream";
  }
}

/** Fetch, resize and cache a remote image. Returns null when it can't be fetched. */
export async function getProxiedImage(url: string, width: number): Promise<ProxiedImage | null> {
  const key = `${width}|${url}`;
  const cached = processedCache.get(key);
  if (cached) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const job = (async () => {
    const source = await getSourceImageBuffer(url);
    if (!source || source.length === 0) return null;

    let image: ProxiedImage;
    try {
      const body = await sharp(source)
        .rotate()
        .resize(width, width * 2, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: width <= 320 ? 74 : 80 })
        .toBuffer();
      image = { body, contentType: "image/webp" };
    } catch {
      // Not something sharp understands (e.g. SVG without rasteriser) — serve as-is.
      image = { body: source, contentType: await contentTypeOf(source) };
    }
    processedCache.set(key, image, image.body.length);
    return image;
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, job);
  return job;
}
