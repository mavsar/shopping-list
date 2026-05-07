export const unitValues = ["kg", "g", "L", "dl", "pcs"] as const;

export type ItemUnit = (typeof unitValues)[number];

export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
