import { cx } from 'class-variance-authority';
import { memo, useEffect, useState } from 'react';

import type { ItemCategory } from '../domain/item-category';
import { LordIcon } from './lordicon/lord-icon';

export const itemCategoryLabels: Record<ItemCategory, string> = {
  alkoholi: 'Alkoholi',
  dom_in_vrt: 'Dom in vrt',
  drugo: 'Drugo',
  elektronika: 'Elektronika',
  hisni_ljubljencki: 'Hišni ljubljenčki',
  kava_in_caj: 'Kava in čaj',
  konzervirana_zivila: 'Konzervirana živila',
  meso_in_perutnina: 'Meso in perutnina',
  mlecni_izdelki_in_jajca: 'Mlečni izdelki in jajca',
  oblacila: 'Oblačila',
  osebna_nega: 'Osebna nega',
  pekovski_izdelki: 'Pekovski izdelki',
  pijace: 'Pijače',
  pisalne_potrebscine: 'Pisalne potrebščine',
  prigrizki: 'Prigrizki',
  sladkarije: 'Sladkarije',
  pripravljeni_obroki: 'Pripravljeni obroki',
  rastlinski_izdelki: 'Rastlinski izdelki',
  ribe_in_morski_sadezi: 'Ribe in morski sadeži',
  sadje: 'Sadje',
  zelenjava: 'Zelenjava',
  suhi_izdelki: 'Suhi izdelki',
  za_otroke: 'Za otroke',
  zamrznjeni_izdelki: 'Zamrznjeni izdelki',
  zacimbe_omake_in_olja: 'Začimbe, omake in olja',
  zdravje: 'Zdravje',
  ciscenje_in_pranje: 'Čiščenje in pranje',
};

const ICONS: Record<ItemCategory, { reveal: string; base: string }> = {
  alkoholi: { reveal: '/lordicon/alcohol-reveal.json', base: '/lordicon/alcohol.json' },
  dom_in_vrt: { reveal: '/lordicon/home-reveal.json', base: '/lordicon/home.json' },
  drugo: { reveal: '/lordicon/other-reveal.json', base: '/lordicon/other.json' },
  elektronika: { reveal: '/lordicon/laptop-reveal.json', base: '/lordicon/laptop.json' },
  hisni_ljubljencki: { reveal: '/lordicon/pets-reveal.json', base: '/lordicon/pets.json' },
  kava_in_caj: { reveal: '/lordicon/coffee-reveal.json', base: '/lordicon/coffee.json' },
  konzervirana_zivila: {
    reveal: '/lordicon/canned-food-reveal.json',
    base: '/lordicon/canned-food.json',
  },
  meso_in_perutnina: { reveal: '/lordicon/meat-reveal.json', base: '/lordicon/meat.json' },
  mlecni_izdelki_in_jajca: {
    reveal: '/lordicon/cheese-reveal.json',
    base: '/lordicon/cheese.json',
  },
  oblacila: { reveal: '/lordicon/clothes-reveal.json', base: '/lordicon/clothes.json' },
  osebna_nega: { reveal: '/lordicon/shampoo-reveal.json', base: '/lordicon/shampoo.json' },
  pekovski_izdelki: { reveal: '/lordicon/bread-reveal.json', base: '/lordicon/bread.json' },
  pijace: { reveal: '/lordicon/drinks-reveal.json', base: '/lordicon/drinks.json' },
  pisalne_potrebscine: { reveal: '/lordicon/crayons-reveal.json', base: '/lordicon/crayons.json' },
  prigrizki: { reveal: '/lordicon/brezel-reveal.json', base: '/lordicon/brezel.json' },
  sladkarije: {
    reveal: '/lordicon/chocolate-bar-reveal.json',
    base: '/lordicon/chocolate-bar.json',
  },
  pripravljeni_obroki: {
    reveal: '/lordicon/ready-to-eat-reveal.json',
    base: '/lordicon/ready-to-eat.json',
  },
  rastlinski_izdelki: {
    reveal: '/lordicon/plant-based-reveal.json',
    base: '/lordicon/plant-based.json',
  },
  ribe_in_morski_sadezi: { reveal: '/lordicon/fish-reveal.json', base: '/lordicon/fish.json' },
  sadje: { reveal: '/lordicon/apple-reveal.json', base: '/lordicon/apple.json' },
  zelenjava: { reveal: '/lordicon/carrot-reveal.json', base: '/lordicon/carrot.json' },
  suhi_izdelki: { reveal: '/lordicon/cereal-reveal.json', base: '/lordicon/cereal.json' },
  za_otroke: { reveal: '/lordicon/stroller-reveal.json', base: '/lordicon/stroller.json' },
  zamrznjeni_izdelki: {
    reveal: '/lordicon/snowflake-reveal.json',
    base: '/lordicon/snowflake.json',
  },
  zacimbe_omake_in_olja: { reveal: '/lordicon/spices-reveal.json', base: '/lordicon/spices.json' },
  zdravje: { reveal: '/lordicon/health-care-reveal.json', base: '/lordicon/health-care.json' },
  ciscenje_in_pranje: { reveal: '/lordicon/cleaning-reveal.json', base: '/lordicon/cleaning.json' },
};

/** Aisle colours: icon tint + soft chip background per category. */
export const itemCategoryColors: Record<ItemCategory, { accent: string; soft: string }> = {
  sadje: { accent: '#d9482b', soft: '#fbe5df' },
  zelenjava: { accent: '#3b8f5e', soft: '#e2f2e7' },
  meso_in_perutnina: { accent: '#c2434f', soft: '#fae3e6' },
  ribe_in_morski_sadezi: { accent: '#3f7fb8', soft: '#e1edf8' },
  mlecni_izdelki_in_jajca: { accent: '#5b6abf', soft: '#e6e9f8' },
  pekovski_izdelki: { accent: '#b8772b', soft: '#f7e9d6' },
  pijace: { accent: '#2f9aa8', soft: '#dff3f5' },
  alkoholi: { accent: '#8e4a8b', soft: '#f1e4f0' },
  kava_in_caj: { accent: '#7a4f2a', soft: '#f0e4d8' },
  sladkarije: { accent: '#d65a8e', soft: '#fbe3ee' },
  prigrizki: { accent: '#ef8a2c', soft: '#fdebd8' },
  konzervirana_zivila: { accent: '#7d8a3c', soft: '#eef1dc' },
  suhi_izdelki: { accent: '#c9a227', soft: '#fbf3d2' },
  zamrznjeni_izdelki: { accent: '#4aa3c9', soft: '#e0f2f9' },
  zacimbe_omake_in_olja: { accent: '#c96a2b', soft: '#f9e6d8' },
  rastlinski_izdelki: { accent: '#5aa05a', soft: '#e6f3e6' },
  pripravljeni_obroki: { accent: '#d4772e', soft: '#f9e8d8' },
  osebna_nega: { accent: '#7c6fcd', soft: '#ebe8f9' },
  ciscenje_in_pranje: { accent: '#3a9c9c', soft: '#dff3f3' },
  dom_in_vrt: { accent: '#6f8f3a', soft: '#ecf2df' },
  hisni_ljubljencki: { accent: '#a5732b', soft: '#f6ead7' },
  za_otroke: { accent: '#e07aa3', soft: '#fbe6ef' },
  zdravje: { accent: '#d64545', soft: '#fbe3e3' },
  elektronika: { accent: '#5a6b7c', soft: '#e6ebef' },
  oblacila: { accent: '#8a5fb8', soft: '#eee6f7' },
  pisalne_potrebscine: { accent: '#4c7fd6', soft: '#e3ecfa' },
  drugo: { accent: '#8b7c6d', soft: '#f2eadc' },
};

export function getItemCategoryColors(category: ItemCategory) {
  return itemCategoryColors[category] ?? itemCategoryColors.drugo;
}

type ItemCategoryIconProps = {
  category: ItemCategory;
  className?: string;
  /** Pixel size for the Lordicon wrapper (default 24). */
  size?: number;
  /** Skip hover-driven animation; use for list rows where hover breaks iOS taps. */
  staticDisplay?: boolean;
  /** Tint with the category's aisle colour (default) or ink. */
  tinted?: boolean;
};

function ItemCategoryIconComponent({
  category,
  className,
  size = 24,
  staticDisplay = false,
  tinted = true,
}: ItemCategoryIconProps) {
  const { accent } = getItemCategoryColors(category);
  const colors = tinted ? `primary:${accent},secondary:${accent}` : undefined;
  const [showRevealOverlay, setShowRevealOverlay] = useState(true);
  const [revealReady, setRevealReady] = useState(false);
  const iconSet = ICONS[category] ?? {
    reveal: '/lordicon/other-reveal.json',
    base: '/lordicon/other.json',
  };

  useEffect(() => {
    if (staticDisplay) {
      return;
    }

    setShowRevealOverlay(true);
    setRevealReady(false);
    const timeoutId = window.setTimeout(() => setShowRevealOverlay(false), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [category, staticDisplay]);

  return (
    <span
      className={cx(
        'relative inline-flex shrink-0',
        staticDisplay && 'pointer-events-none',
        className,
      )}
    >
      <LordIcon
        src={iconSet.base}
        trigger={staticDisplay ? 'click' : 'hover'}
        animateOnHover={false}
        className={showRevealOverlay && revealReady ? 'opacity-0' : 'opacity-100'}
        size={size}
        colors={colors}
      />
      {!staticDisplay && showRevealOverlay ? (
        <LordIcon
          src={iconSet.reveal}
          trigger="in"
          animateOnHover={false}
          className="pointer-events-none absolute inset-0"
          size={size}
          colors={colors}
          onReady={() => setRevealReady(true)}
          onComplete={() => setShowRevealOverlay(false)}
        />
      ) : null}
    </span>
  );
}

export const ItemCategoryIcon = memo(ItemCategoryIconComponent);
