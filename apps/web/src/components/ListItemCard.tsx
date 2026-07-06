import { cx } from 'class-variance-authority';
import { memo } from 'react';

const SLOVENIAN_MONTHS = [
  'januar', 'februar', 'marec', 'april', 'maj', 'junij',
  'julij', 'avgust', 'september', 'oktober', 'november', 'december',
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
import { motion } from 'motion/react';
import type { Transition } from 'motion/react';

import { getItemUnitLabel, ShoppingListItem } from '../types/lists';
import { CompletionCircleToggle } from './CompletionCircleToggle';
import { ItemCategoryIcon } from './ItemCategoryIcon';
import { Minus, Plus } from './lordicon/icons';
import { Button, Card } from './ui';

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

  return (
    <Card
      tone={item.status === 'completed' ? 'completed' : 'default'}
      interactive={item.status !== 'completed'}
      padding="none"
    >
      <div className="flex items-stretch pr-2">
        <button
          type="button"
          className="flex shrink-0 items-center px-4 py-2.5 cursor-pointer disabled:cursor-default"
          aria-label={item.status === 'completed' ? 'Označi kot aktivno' : 'Označi kot kupljeno'}
          aria-pressed={item.status === 'completed'}
          disabled={updating}
          onClick={() => onCompletionToggle(item)}
        >
          <div className="flex pointer-events-none">
            <CompletionCircleToggle
              size="sm"
              completed={item.status === 'completed'}
              disabled={updating}
              sparkleOnMount={sparkleOnMount}
              onToggle={() => undefined}
            />
          </div>
        </button>
        <button
          type="button"
          className="m-0 flex min-w-0 flex-1 items-center gap-4 border-0 bg-transparent py-2.5 pr-2 text-left cursor-pointer select-none touch-manipulation [-webkit-touch-callout:none]"
          aria-label={`Uredi ${formatTitle(item.title)}`}
          onClick={() => onOpenDetails(item)}
        >
          <ItemCategoryIcon category={item.category} size={30} className="pointer-events-none" />
          <div className="pointer-events-none block min-w-0 flex-1">
            <span className="block line-clamp-2 text-sm leading-4 font-semibold text-slate-50">
              {formatTitle(item.title)}
            </span>
            {item.status === 'completed' ? (
              <span className="mt-0.5 block text-[10px] leading-3 text-white/50">
                Kupljeno ({formatCompletedAt(item.updatedAt)})
              </span>
            ) : null}
            {item.note ? (
              <span className="mt-0.5 block line-clamp-1 text-xs text-slate-200/90">{item.note}</span>
            ) : null}
          </div>
        </button>
        <div className="flex shrink-0 items-center">
          <div className="flex items-center justify-between gap-2">
            <div
              className="inline-flex items-center justify-center"
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
                    aria-label={`Zmanjšaj količino za ${formatTitle(item.title)}`}
                    disabled={updating}
                    onClick={() => onDecreaseQuantity(item)}
                  />
                </span>
              </motion.span>
              <button
                type="button"
                className={cx(
                  'inline-flex min-w-14 items-center justify-center whitespace-nowrap rounded-lg px-1.5 py-1 text-center text-xs text-slate-100 transition',
                  supportsHoverPointer ? 'cursor-default' : 'cursor-pointer hover:bg-white/10',
                )}
                aria-label={`Količina za ${formatTitle(item.title)}`}
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
                    aria-label={`Povečaj količino za ${formatTitle(item.title)}`}
                    disabled={updating}
                    onClick={() => onIncreaseQuantity(item)}
                  />
                </span>
              </motion.span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export const ListItemCard = memo(ListItemCardComponent);
