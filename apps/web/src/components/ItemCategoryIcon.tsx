import type { LucideIcon } from "lucide-react";
import {
  Apple,
  Beef,
  Candy,
  Carrot,
  Cookie,
  Croissant,
  Fish,
  GlassWater,
  Milk,
  Package,
  ShoppingBasket,
  Snowflake,
  Soup,
  Wheat
} from "lucide-react";

import { cx } from "class-variance-authority";

import type { ItemCategory } from "../domain/item-category";

export const itemCategoryLabels: Record<ItemCategory, string> = {
  vegetables: "Zelenjava",
  fruit: "Sadje",
  bread: "Kruh in pekovsko",
  dairy: "Mlečni izdelki in jajca",
  meat: "Meso",
  fish: "Riba in morski sadeži",
  sweets: "Sladkarije",
  chocolate: "Čokolada",
  flour_baking: "Moka in peka",
  canned: "Konserve",
  beverages: "Pijača",
  frozen: "Zamrznuto",
  pantry: "Živila na zalogi",
  other: "Drugo"
};

const ICONS: Record<ItemCategory, LucideIcon> = {
  vegetables: Carrot,
  fruit: Apple,
  bread: Croissant,
  dairy: Milk,
  meat: Beef,
  fish: Fish,
  sweets: Candy,
  chocolate: Cookie,
  flour_baking: Wheat,
  canned: Soup,
  beverages: GlassWater,
  frozen: Snowflake,
  pantry: Package,
  other: ShoppingBasket
};

type ItemCategoryIconProps = {
  category: ItemCategory;
  className?: string;
  /** Pixel size for Lucide icons (default 24). */
  size?: number;
};

export function ItemCategoryIcon({ category, className, size = 24 }: ItemCategoryIconProps) {
  const Icon = ICONS[category] ?? ShoppingBasket;
  return (
    <Icon
      className={cx("shrink-0 text-cyan-100/90", className)}
      size={size}
      aria-hidden
      strokeWidth={2}
    />
  );
}
