import type { ReactNode } from 'react';
import { Button } from './ui/button';

type FabProps = {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  /** Show the label next to the icon (pill) instead of a round button. */
  extended?: boolean;
};

/** Floating action button pinned to the bottom-right corner (safe-area aware). */
export function Fab({ icon, label, onClick, extended = false }: FabProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] z-30 md:bottom-8">
      <div className="mx-auto flex w-full max-w-3xl justify-end px-4 md:px-8">
        <Button
          type="button"
          icon={icon}
          iconOnly={!extended}
          size="lg"
          aria-label={label}
          title={label}
          className="pointer-events-auto rounded-full shadow-basil"
          onClick={onClick}
        >
          {extended ? label : undefined}
        </Button>
      </div>
    </div>
  );
}
