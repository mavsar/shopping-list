import type { CSSProperties } from 'react';
import { cva, cx } from 'class-variance-authority';

/** Palette offered when creating or editing a recipe label. */
export const RECIPE_LABEL_COLORS = [
  '#d9482b',
  '#ef8a2c',
  '#c9a227',
  '#3b8f5e',
  '#2f9aa8',
  '#3f7fb8',
  '#5b6abf',
  '#8e4a8b',
  '#d65a8e',
  '#7a4f2a',
  '#6f8f3a',
  '#8b7c6d',
];

export interface RecipeLabel {
  id: number;
  name: string;
  color: string;
}

const badgeClass = cva('inline-flex items-center rounded-full font-medium transition-opacity', {
  variants: {
    size: {
      sm: 'gap-1 px-1.5 py-0.5 text-[9px]',
      md: 'gap-1.5 px-3 py-1 text-xs',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

type RecipeLabelBadgeProps = {
  name: string;
  color: string;
  size?: 'sm' | 'md';
  dot?: boolean;
  /** Only meaningful when onClick is provided — controls active/inactive visual state. */
  active?: boolean;
  onClick?: () => void;
  className?: string;
};

export function RecipeLabelBadge({
  name,
  color,
  size = 'md',
  dot = false,
  active,
  onClick,
  className,
}: RecipeLabelBadgeProps) {
  const isInteractive = onClick !== undefined;
  const isActive = isInteractive ? (active ?? false) : true;

  const content = (
    <>
      {dot && <span className="h-2 w-2 shrink-0 rounded-full bg-white/50" />}
      {name}
    </>
  );

  const pillStyle: CSSProperties = { backgroundColor: color, color: 'rgba(255,255,255,0.95)' };

  if (isInteractive) {
    // The "selected" ring is drawn inside the button's own box (a border that is always there,
    // just transparent when inactive), so scrolling or clipping containers never cut it off
    // and toggling never shifts the layout.
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={isActive}
        className={cx(
          'inline-flex shrink-0 cursor-pointer rounded-full border-2 p-[2px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-basil/40',
          className,
        )}
        style={{ borderColor: isActive ? color : 'transparent' }}
      >
        <span
          className={cx(badgeClass({ size }), !isActive && 'opacity-80 hover:opacity-100')}
          style={pillStyle}
        >
          {content}
        </span>
      </button>
    );
  }

  return (
    <span className={cx(badgeClass({ size }), className)} style={pillStyle}>
      {content}
    </span>
  );
}
