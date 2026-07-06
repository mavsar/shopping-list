import { cx } from 'class-variance-authority';
import { memo, type KeyboardEvent, type MouseEvent } from 'react';
import { motion } from 'motion/react';
import type { Transition } from 'motion/react';

import { getItemUnitLabel, ShoppingListItem } from '../types/lists';
import { CompletionCircleToggle } from './CompletionCircleToggle';
import { ItemCategoryIcon } from './ItemCategoryIcon';
import { Minus, Plus } from './lordicon/icons';
import { Button, Card } from './ui';

const SLOVENIAN_MONTHS = [
  'januar',
  'februar',
  'marec',
  'april',
  'maj',
  'junij',
  'julij',
  'avgust',
  'september',
  'oktober',
  'november',
  'december',
];

function formatCompletedAt(isoString: string): string {
  const d = new Date(isoString);
  const day = d.getDate();
  const month = SLOVENIAN_MONTHS[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} ob ${hours}:${minutes}`;
}

type ListItemCardProps = {
  item: ShoppingListItem;
  updating: boolean;
  sparkleOnMount?: boolean;
  supportsHoverPointer: boolean;
  quantityControlsVisible: boolean;
  quantityControlsTransition: Transition;
  formatTitle: (title: string) => string;
  onHoverStart: (itemId: number) => void;
  onHoverEnd: (itemId: number) => void;
  onQuantityLabelClick: (itemId: number) => void;
  onCompletionToggle: (item: ShoppingListItem) => void;
  onOpenDetails: (item: ShoppingListItem) => void;
  onDecreaseQuantity: (item: ShoppingListItem) => void;
  onIncreaseQuantity: (item: ShoppingListItem) => void;
};

function stopRowActivation(event: MouseEvent | KeyboardEvent) {
  event.stopPropagation();
}

function ListItemCardComponent({
  item,
  updating,
  sparkleOnMount,
  supportsHoverPointer,
  quantityControlsVisible,
  quantityControlsTransition,
  formatTitle,
  onHoverStart,
  onHoverEnd,
  onQuantityLabelClick,
  onCompletionToggle,
  onOpenDetails,
  onDecreaseQuantity,
  onIncreaseQuantity,
}: ListItemCardProps) {
  const quantityControlsWidth = item.status === 'completed' ? 36 : 28;
  const displayTitle = formatTitle(item.title);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Uredi ${displayTitle}`}
      className="block w-full cursor-pointer rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/45"
      onClick={() => onOpenDetails(item)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenDetails(item);
        }
      }}
    >
      <Card
        tone={item.status === 'completed' ? 'completed' : 'default'}
        interactive={item.status !== 'completed'}
        padding="none"
      >
        <div className="flex items-stretch pr-2">
          <div
            className="flex shrink-0 items-center px-4 py-2.5"
            onClick={stopRowActivation}
            onKeyDown={stopRowActivation}
          >
            <button
              type="button"
              className="flex cursor-pointer border-0 bg-transparent p-0 disabled:cursor-default"
              aria-label={item.status === 'completed' ? 'Označi kot aktivno' : 'Označi kot kupljeno'}
              aria-pressed={item.status === 'completed'}
              disabled={updating}
              onClick={() => onCompletionToggle(item)}
            >
              <CompletionCircleToggle
                size="sm"
                completed={item.status === 'completed'}
                disabled={updating}
                sparkleOnMount={sparkleOnMount}
                onToggle={() => undefined}
              />
            </button>
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-4 py-2.5 pr-2">
            <ItemCategoryIcon category={item.category} size={30} />
            <div className="min-w-0 flex-1">
              <p className="m-0 line-clamp-2 text-sm leading-4 font-semibold text-slate-50">{displayTitle}</p>
              {item.status === 'completed' ? (
                <p className="m-0 mt-0.5 text-[10px] leading-3 text-white/50">
                  Kupljeno ({formatCompletedAt(item.updatedAt)})
                </p>
              ) : null}
              {item.note ? (
                <p className="m-0 mt-0.5 line-clamp-1 text-xs text-slate-200/90">{item.note}</p>
              ) : null}
            </div>
          </div>

          <div
            className="flex shrink-0 items-center"
            onClick={stopRowActivation}
            onKeyDown={stopRowActivation}
          >
            <div
              className="flex items-center justify-between gap-2"
              onMouseEnter={() => {
                if (supportsHoverPointer) {
                  onHoverStart(item.id);
                }
              }}
              onMouseLeave={() => {
                if (supportsHoverPointer) {
                  onHoverEnd(item.id);
                }
              }}
            >
              <motion.span
                initial={false}
                animate={
                  quantityControlsVisible
                    ? { width: quantityControlsWidth, opacity: 1 }
                    : { width: 0, opacity: 0 }
                }
                transition={quantityControlsTransition}
                className={cx(
                  'inline-flex shrink-0 items-center overflow-hidden',
                  quantityControlsVisible ? 'pointer-events-auto' : 'pointer-events-none',
                )}
              >
                <span className="inline-flex pr-1">
                  <Button
                    type="button"
                    color="white"
                    appearance="transparent"
                    size="xs"
                    iconOnly
                    icon={<Minus animateOnHover />}
                    aria-label={`Zmanjšaj količino za ${displayTitle}`}
                    disabled={updating}
                    onClick={() => onDecreaseQuantity(item)}
                  />
                </span>
              </motion.span>
              <button
                type="button"
                className={cx(
                  'inline-flex min-w-14 items-center justify-center whitespace-nowrap rounded-lg border-0 bg-transparent px-1.5 py-1 text-center text-xs text-slate-100 transition',
                  supportsHoverPointer ? 'cursor-default' : 'cursor-pointer hover:bg-white/10',
                )}
                aria-label={`Količina za ${displayTitle}`}
                aria-expanded={quantityControlsVisible}
                onClick={() => onQuantityLabelClick(item.id)}
              >
                {item.quantity} {getItemUnitLabel(item.unit)}
              </button>
              <motion.span
                initial={false}
                animate={
                  quantityControlsVisible
                    ? { width: quantityControlsWidth, opacity: 1 }
                    : { width: 0, opacity: 0 }
                }
                transition={quantityControlsTransition}
                className={cx(
                  'inline-flex shrink-0 items-center overflow-hidden',
                  quantityControlsVisible ? 'pointer-events-auto' : 'pointer-events-none',
                )}
              >
                <span className="inline-flex pl-1">
                  <Button
                    type="button"
                    color="white"
                    appearance="transparent"
                    size="xs"
                    iconOnly
                    icon={<Plus animateOnHover />}
                    aria-label={`Povečaj količino za ${displayTitle}`}
                    disabled={updating}
                    onClick={() => onIncreaseQuantity(item)}
                  />
                </span>
              </motion.span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export const ListItemCard = memo(ListItemCardComponent);
