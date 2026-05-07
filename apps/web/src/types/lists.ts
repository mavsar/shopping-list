import type { ItemCategory } from "../domain/item-category";

export type ShoppingList = {
  id: number;
  name: string;
  createdByUserId: number;
  createdAt: string;
  updatedAt: string;
};

export const itemUnitValues = ["kg", "g", "L", "dl", "pcs"] as const;

export type ShoppingItemUnit = (typeof itemUnitValues)[number];

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
};
