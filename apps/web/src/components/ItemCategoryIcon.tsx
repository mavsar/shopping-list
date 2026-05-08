import { useEffect, useState } from "react";
import { cx } from "class-variance-authority";

import type { ItemCategory } from "../domain/item-category";
import { LordIcon } from "./lordicon/lord-icon";

export const itemCategoryLabels: Record<ItemCategory, string> = {
  vegetables: "Zelenjava",
  fruit: "Sadje",
  bread: "Kruh in pekovsko",
  dairy: "Mlečni izdelki",
  eggs: "Jajca",
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

const ICONS: Record<ItemCategory, { reveal: string; base: string }> = {
  vegetables: { reveal: "/lordicon/vegetables-reveal.json", base: "/lordicon/vegetables.json" },
  fruit: { reveal: "/lordicon/apple-reveal.json", base: "/lordicon/apple.json" },
  bread: { reveal: "/lordicon/bread.json", base: "/lordicon/bread.json" },
  dairy: { reveal: "/lordicon/milk-reveal.json", base: "/lordicon/milk.json" },
  eggs: { reveal: "/lordicon/egg-reveal.json", base: "/lordicon/egg.json" },
  meat: { reveal: "/lordicon/meat-reveal.json", base: "/lordicon/meat.json" },
  fish: { reveal: "/lordicon/fish-reveal.json", base: "/lordicon/fish.json" },
  sweets: { reveal: "/lordicon/ready-to-eat-reveal.json", base: "/lordicon/ready-to-eat.json" },
  chocolate: { reveal: "/lordicon/chocolate-bar-reveal.json", base: "/lordicon/chocolate-bar.json" },
  flour_baking: { reveal: "/lordicon/flour-wheat-reveal.json", base: "/lordicon/flour-wheat.json" },
  canned: { reveal: "/lordicon/canned-food-reveal.json", base: "/lordicon/canned-food.json" },
  beverages: { reveal: "/lordicon/drinks-reveal.json", base: "/lordicon/drinks.json" },
  frozen: { reveal: "/lordicon/snowflake-reveal.json", base: "/lordicon/snowflake.json" },
  pantry: { reveal: "/lordicon/spices-reveal.json", base: "/lordicon/spices.json" },
  other: { reveal: "/lordicon/other-reveal.json", base: "/lordicon/other.json" }
};

type ItemCategoryIconProps = {
  category: ItemCategory;
  className?: string;
  /** Pixel size for the Lordicon wrapper (default 24). */
  size?: number;
};

export function ItemCategoryIcon({ category, className, size = 24 }: ItemCategoryIconProps) {
  const [showRevealOverlay, setShowRevealOverlay] = useState(true);
  const [revealReady, setRevealReady] = useState(false);
  const iconSet = ICONS[category] ?? { reveal: "/lordicon/other-reveal.json", base: "/lordicon/other.json" };

  useEffect(() => {
    setShowRevealOverlay(true);
    setRevealReady(false);
    const timeoutId = window.setTimeout(() => setShowRevealOverlay(false), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [category]);

  return (
    <span className={cx("relative inline-flex shrink-0", className)}>
      <LordIcon
        src={iconSet.base}
        trigger="hover"
        className={showRevealOverlay && revealReady ? "opacity-0" : "opacity-100"}
        size={size}
      />
      {showRevealOverlay ? (
        <LordIcon
          src={iconSet.reveal}
          trigger="in"
          animateOnHover={false}
          className="pointer-events-none absolute inset-0"
          size={size}
          onReady={() => setRevealReady(true)}
          onComplete={() => setShowRevealOverlay(false)}
        />
      ) : null}
    </span>
  );
}
