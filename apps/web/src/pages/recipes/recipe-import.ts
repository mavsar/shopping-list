/** Client side of the recipe import: turn files into page images and stream them to the server. */

export interface ImportPagePayload {
  mimeType: 'image/jpeg';
  /** base64 without the data: prefix */
  data: string;
  /** Embedded text of a digital PDF page; lets the server copy words exactly. */
  text?: string;
}

export interface ImportedRecipe {
  title: string;
  description?: string;
  tips: string[];
  nutrition?: string;
  servings?: string;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  ingredients: string[];
  instructions: string[];
  imageUrl?: string;
  images: string[];
  /** 0-based page the recipe starts on (across all uploaded files). */
  page: number;
}

/** Most pages the server accepts in one import. */
export const MAX_IMPORT_PAGES = 60;
/** Longest side of a page image sent for reading; enough for small print and photo crops. */
const PAGE_MAX_SIDE = 2000;
const JPEG_QUALITY = 0.85;

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

function canvasToBase64Jpeg(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Strani ni bilo mogoče pretvoriti v sliko.'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]+,/, ''));
        reader.onerror = () => reject(reader.error ?? new Error('Branje slike ni uspelo.'));
        reader.readAsDataURL(blob);
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

async function imageFileToPage(file: File): Promise<ImportPagePayload> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`Slike "${file.name}" ni mogoče odpreti. Uporabi JPG, PNG ali WEBP.`);
  }
  const scale = Math.min(1, PAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Brskalnik ne podpira obdelave slik.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { mimeType: 'image/jpeg', data: await canvasToBase64Jpeg(canvas) };
}

/** The page's text layer (empty for scanned PDFs), one line per PDF text line. */
async function pageText(page: {
  getTextContent: () => Promise<{ items: unknown[] }>;
}): Promise<string> {
  try {
    const content = await page.getTextContent();
    return content.items
      .map((item) => {
        const entry = item as { str?: string; hasEOL?: boolean };
        return (entry.str ?? '') + (entry.hasEOL ? '\n' : '');
      })
      .join('')
      .replace(/[ \t]+\n/g, '\n')
      .trim()
      .slice(0, 30_000);
  } catch {
    return '';
  }
}

async function* pdfFileToPages(
  file: File,
  maxPages: number,
): AsyncGenerator<ImportPagePayload, void, number | undefined> {
  // pdf.js is big — only load it when a PDF is actually imported.
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
    .promise;
  try {
    const pageCount = Math.min(document.numPages, maxPages);
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: Math.min(3, PAGE_MAX_SIDE / Math.max(base.width, base.height)),
      });
      const canvas = window.document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Brskalnik ne podpira obdelave PDF datotek.');
      // White background: transparent PDF areas would otherwise turn black in the JPEG.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      const text = await pageText(page);
      page.cleanup();
      yield {
        mimeType: 'image/jpeg',
        data: await canvasToBase64Jpeg(canvas),
        ...(text ? { text } : {}),
      };
    }
  } finally {
    void document.destroy();
  }
}

export async function countPdfPages(file: File): Promise<number> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
    .promise;
  const count = document.numPages;
  void document.destroy();
  return count;
}

/**
 * Turn PDFs and images into page images, in file order. Stops at MAX_IMPORT_PAGES and
 * reports whether pages were left out.
 */
export async function filesToPages(
  files: File[],
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<{ pages: ImportPagePayload[]; truncated: boolean }> {
  const counts = await Promise.all(
    files.map((file) => (isPdfFile(file) ? countPdfPages(file) : Promise.resolve(1))),
  );
  const totalAvailable = counts.reduce((sum, count) => sum + count, 0);
  const total = Math.min(totalAvailable, MAX_IMPORT_PAGES);
  const pages: ImportPagePayload[] = [];
  onProgress(0, total);

  for (const file of files) {
    if (pages.length >= MAX_IMPORT_PAGES || signal?.aborted) break;
    if (isPdfFile(file)) {
      for await (const page of pdfFileToPages(file, MAX_IMPORT_PAGES - pages.length)) {
        // Leaving the loop closes the generator, which destroys the PDF document.
        if (signal?.aborted) break;
        pages.push(page);
        onProgress(pages.length, total);
      }
    } else {
      pages.push(await imageFileToPage(file));
      onProgress(pages.length, total);
    }
  }

  return { pages, truncated: totalAvailable > MAX_IMPORT_PAGES };
}

export type ImportStreamMessage =
  | { type: 'progress'; processedPages: number; totalPages: number }
  | { type: 'recipes'; recipes: ImportedRecipe[]; processedPages: number; totalPages: number }
  | { type: 'warning'; warning: string }
  | { type: 'error'; error: string }
  | { type: 'done'; documentTitle?: string };

/** POST the pages and call `onMessage` for every NDJSON line the server streams back. */
export async function streamRecipeImport(
  token: string,
  pages: ImportPagePayload[],
  signal: AbortSignal,
  onMessage: (message: ImportStreamMessage) => void,
): Promise<void> {
  const response = await fetch('/api/recipes/import', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pages }),
    signal,
  });
  if (!response.ok || !response.body) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      response.status === 413
        ? 'Datoteka je prevelika.'
        : (data.error ?? `Napaka ${response.status}`),
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        onMessage(JSON.parse(line) as ImportStreamMessage);
      } catch {
        /* skip malformed lines */
      }
    }
  }
}

/**
 * Join intro, tips and nutrition into the one description field. Tips that appear on
 * several recipes of the same document (e.g. "watch the video on our site") are
 * boilerplate and get dropped.
 */
export function composeDescriptions(
  recipes: Array<Pick<ImportedRecipe, 'description' | 'tips' | 'nutrition'>>,
): string[] {
  const normalize = (tip: string) =>
    tip
      .toLowerCase()
      .replace(/^(namig|nasvet|tip)\s*:\s*/i, '')
      .replace(/\W+/g, ' ')
      .trim();
  const counts = new Map<string, number>();
  for (const recipe of recipes) {
    for (const key of new Set(recipe.tips.map(normalize)))
      counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return recipes.map((recipe) => {
    const tips = recipe.tips
      .filter((tip) => recipes.length < 2 || (counts.get(normalize(tip)) ?? 0) < 2)
      .map((tip) => (/^(namig|nasvet|tip)\b/i.test(tip) ? tip : `Namig: ${tip}`));
    return [
      recipe.description?.trim(),
      ...tips,
      recipe.nutrition ? `Hranilna vrednost: ${recipe.nutrition}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  });
}

/**
 * The same recipe can be read twice (e.g. from a section divider and from its own page, in
 * two chunks). Keep the most complete copy per title and pool their pictures.
 */
export function mergeDuplicateRecipes<
  T extends {
    title: string;
    ingredients: string[];
    instructions: string[];
    images: string[];
    imageUrl?: string;
  },
>(recipes: T[]): T[] {
  const key = (title: string) =>
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\W+/g, ' ')
      .trim();
  const byTitle = new Map<string, T>();
  const order: string[] = [];
  for (const recipe of recipes) {
    const k = key(recipe.title);
    const existing = byTitle.get(k);
    if (!existing) {
      byTitle.set(k, recipe);
      order.push(k);
      continue;
    }
    const size = (r: T) => r.ingredients.length + r.instructions.length;
    const [keep, other] = size(recipe) > size(existing) ? [recipe, existing] : [existing, recipe];
    const images = Array.from(new Set([...keep.images, ...other.images]));
    byTitle.set(k, { ...keep, images, imageUrl: keep.imageUrl ?? other.imageUrl ?? images[0] });
  }
  return order.map((k) => byTitle.get(k)!);
}

/** File name without extension, tidied up for use as a recipe source. */
export function sourceFromFileName(name: string): string {
  return name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
