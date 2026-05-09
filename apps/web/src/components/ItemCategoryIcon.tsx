import { cx } from 'class-variance-authority';
import { useEffect, useState } from 'react';

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
  prigrizki_in_sladkarije: 'Prigrizki in sladkarije',
  pripravljeni_obroki: 'Pripravljeni obroki',
  rastlinski_izdelki: 'Rastlinski izdelki',
  ribe_in_morski_sadezi: 'Ribe in morski sadeži',
  sadje_in_zelenjava: 'Sadje in zelenjava',
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
  prigrizki_in_sladkarije: {
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
  sadje_in_zelenjava: { reveal: '/lordicon/apple-reveal.json', base: '/lordicon/apple.json' },
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

type ItemCategoryIconProps = {
  category: ItemCategory;
  className?: string;
  /** Pixel size for the Lordicon wrapper (default 24). */
  size?: number;
};

export function ItemCategoryIcon({ category, className, size = 24 }: ItemCategoryIconProps) {
  const [showRevealOverlay, setShowRevealOverlay] = useState(true);
  const [revealReady, setRevealReady] = useState(false);
  const iconSet = ICONS[category] ?? {
    reveal: '/lordicon/other-reveal.json',
    base: '/lordicon/other.json',
  };

  useEffect(() => {
    setShowRevealOverlay(true);
    setRevealReady(false);
    const timeoutId = window.setTimeout(() => setShowRevealOverlay(false), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [category]);

  return (
    <span className={cx('relative inline-flex shrink-0', className)}>
      <LordIcon
        src={iconSet.base}
        trigger="hover"
        className={showRevealOverlay && revealReady ? 'opacity-0' : 'opacity-100'}
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
