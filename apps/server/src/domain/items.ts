export const unitValues = [
  "kos",
  "g",
  "dag",
  "kg",
  "ml",
  "dl",
  "l",
  "zlicka",
  "zlica",
  "skodelica",
  "paket",
  "zavoj",
  "vrecka",
  "steklenica",
  "plocevinka",
  "kozarec",
  "strok",
  "sopek",
  "scepec",
  "pcs",
  "L"
] as const;

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
