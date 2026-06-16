import type { CSSProperties } from 'react';
import { cva, cx } from 'class-variance-authority';

export interface RecipeLabel {
  id: number;
  name: string;
  color: string;
}

const badgeClass = cva(
  'inline-flex items-center rounded-full font-medium transition-opacity',
  {
    variants: {
      size: {
        sm: 'gap-1 px-1.5 py-0.5 text-[9px]',
        md: 'gap-1.5 px-3 py-1 text-xs',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

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

  const sharedClassName = cx(
    badgeClass({ size }),
    isInteractive && !isActive && 'opacity-80 hover:opacity-100',
    isInteractive && 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
    className,
  );

  const sharedStyle: CSSProperties = {
    backgroundColor: color,
    color: 'rgba(255,255,255,0.95)',
    ...(isInteractive && isActive
      ? { outline: `2px solid ${color}`, outlineOffset: '2px' }
      : {}),
  };

  const content = (
    <>
      {dot && <span className="h-2 w-2 shrink-0 rounded-full bg-white/50" />}
      {name}
    </>
  );

  if (isInteractive) {
    return (
      <button type="button" onClick={onClick} className={sharedClassName} style={sharedStyle}>
        {content}
      </button>
    );
  }

  return (
    <span className={sharedClassName} style={sharedStyle}>
      {content}
    </span>
  );
}
