export const unitValues = ["kg", "g", "L", "dl", "pcs"] as const;

export type ItemUnit = (typeof unitValues)[number];

export function formatItemTitle(title: string): string {
  const normalized = title.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }
  return normalized.charAt(0).toLocaleUpperCase() + normalized.slice(1);
}

export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
