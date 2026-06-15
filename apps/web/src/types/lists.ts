import type { ItemCategory } from "../domain/item-category";

export type ShoppingList = {
  id: number;
  name: string;
  createdByUserId: number;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
};

export const itemUnitValues = [
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

export type ShoppingItemUnit = (typeof itemUnitValues)[number];
export type ShoppingItemUnitSelectValue = Exclude<ShoppingItemUnit, "pcs" | "L">;

export const itemUnitSelectValues: ShoppingItemUnitSelectValue[] = [
  "kos",
  "g",
  "dag",
  "kg",
  "ml",
  "dl",
  "l"
];

export const itemUnitLabels: Record<ShoppingItemUnit, string> = {
  kos: "kos",
  g: "g",
  dag: "dag",
  kg: "kg",
  ml: "ml",
  dl: "dl",
  l: "l",
  zlicka: "čajna žlička",
  zlica: "jedilna žlica",
  skodelica: "skodelica",
  paket: "paket",
  zavoj: "zavoj",
  vrecka: "vrečka",
  steklenica: "steklenica",
  plocevinka: "pločevinka",
  kozarec: "kozarec",
  strok: "strok",
  sopek: "šopek",
  scepec: "ščepec",
  pcs: "kos",
  L: "l"
};

export function getItemUnitLabel(unit: ShoppingItemUnit): string {
  return itemUnitLabels[unit];
}

export function normalizeShoppingItemUnit(unit: ShoppingItemUnit): ShoppingItemUnitSelectValue {
  if (unit === "pcs") {
    return "kos";
  }
  if (unit === "L") {
    return "l";
  }
  return unit;
}

export type ShoppingListItem = {
  id: number;
  listId: number;
  itemId: number;
  title: string;
  imageUrl: string | null;
  category: ItemCategory;
  quantity: number;
  unit: ShoppingItemUnit;
  note: string | null;
  status: "active" | "completed" | "removed";
  createdAt: string;
  updatedAt: string;
};

export type CatalogItem = {
  id: number;
  title: string;
  normalizedTitle: string;
  imageUrl: string | null;
  category: ItemCategory;
  defaultQuantity: number | null;
  defaultUnit: ShoppingItemUnit | null;
};
