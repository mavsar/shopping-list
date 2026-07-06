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

const slovenianSearchSuffixes = [
  "ijih",
  "ovih",
  "evih",
  "ami",
  "emi",
  "oma",
  "ema",
  "ih",
  "om",
  "em",
  "ov",
  "ev",
  "je",
  "ja",
  "e",
  "a",
  "i",
  "o",
  "u",
] as const;

export function foldDiacritics(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function stemSearchToken(token: string): string {
  if (token.length <= 3) {
    return token;
  }

  for (const suffix of slovenianSearchSuffixes) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) {
      return token.slice(0, -suffix.length);
    }
  }

  return token;
}

export function buildItemSearchKey(title: string): string {
  return foldDiacritics(title)
    .split(" ")
    .map((token) => stemSearchToken(token))
    .filter(Boolean)
    .join(" ");
}

export function buildItemSearchTokens(query: string): string[] {
  return foldDiacritics(query)
    .split(" ")
    .map((token) => stemSearchToken(token))
    .filter(Boolean);
}
