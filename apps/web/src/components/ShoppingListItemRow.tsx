import { cx } from 'class-variance-authority';
import { memo } from 'react';

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

type ShoppingListItemRowProps = {
  item: ShoppingListItem;
  updating: boolean;
  sparkleOnMount?: boolean;
  supportsHoverPointer: boolean;
  quantityExpanded: boolean;
  formatTitle: (title: string) => string;
  onOpenDetails: (item: ShoppingListItem) => void;
  onCompletionToggle: (item: ShoppingListItem) => void;
  onQuantityToggle: (itemId: number) => void;
  onDecreaseQuantity: (item: ShoppingListItem) => void;
  onIncreaseQuantity: (item: ShoppingListItem) => void;
};

function ShoppingListItemRowComponent({
  item,
  updating,
  sparkleOnMount,
  supportsHoverPointer,
  quantityExpanded,
  formatTitle,
  onOpenDetails,
  onCompletionToggle,
  onQuantityToggle,
  onDecreaseQuantity,
  onIncreaseQuantity,
}: ShoppingListItemRowProps) {
  const displayTitle = formatTitle(item.title);
  const showMobileQuantityControls = !supportsHoverPointer && quantityExpanded;

  return (
    <Card
      tone={item.status === 'completed' ? 'completed' : 'default'}
      interactive={item.status !== 'completed'}
      padding="none"
    >
      <div className="grid min-h-14 grid-cols-[3.5rem_minmax(0,1fr)_auto] items-stretch">
        <button
          type="button"
          className="flex h-full w-full items-center justify-center border-0 bg-transparent px-3 touch-manipulation disabled:cursor-default disabled:opacity-50"
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
            presentational
            onToggle={() => undefined}
          />
        </button>

        <div className="relative min-w-0">
          <div className="pointer-events-none flex h-full items-center gap-4 py-2.5 pr-2 select-none">
            <ItemCategoryIcon category={item.category} size={30} staticDisplay />
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
          <button
            type="button"
            className="absolute inset-0 m-0 border-0 bg-transparent p-0 touch-manipulation [-webkit-touch-callout:none]"
            aria-label={`Uredi ${displayTitle}`}
            onClick={() => onOpenDetails(item)}
          />
        </div>

        <div className="group/qty flex items-center pr-2">
          <div
            className={cx(
              'inline-flex shrink-0 items-center overflow-hidden transition-[width,opacity] duration-150 ease-out',
              supportsHoverPointer
                ? 'w-0 opacity-0 pointer-events-none group-hover/qty:w-7 group-hover/qty:opacity-100 group-hover/qty:pointer-events-auto'
                : showMobileQuantityControls
                  ? 'w-7 opacity-100'
                  : 'w-0 opacity-0 pointer-events-none',
            )}
          >
            <Button
              type="button"
              color="white"
              appearance="transparent"
              size="xs"
              iconOnly
              icon={<Minus animateOnHover={false} />}
              aria-label={`Zmanjšaj količino za ${displayTitle}`}
              disabled={updating}
              onClick={() => onDecreaseQuantity(item)}
            />
          </div>

          <button
            type="button"
            className={cx(
              'inline-flex min-w-14 items-center justify-center whitespace-nowrap rounded-lg border-0 bg-transparent px-1.5 py-1 text-center text-xs text-slate-100 touch-manipulation',
              supportsHoverPointer ? 'cursor-default' : 'cursor-pointer hover:bg-white/10',
            )}
            aria-label={`Količina za ${displayTitle}`}
            aria-expanded={showMobileQuantityControls}
            onClick={() => onQuantityToggle(item.id)}
          >
            {item.quantity} {getItemUnitLabel(item.unit)}
          </button>

          <div
            className={cx(
              'inline-flex shrink-0 items-center overflow-hidden transition-[width,opacity] duration-150 ease-out',
              supportsHoverPointer
                ? 'w-0 opacity-0 pointer-events-none group-hover/qty:w-7 group-hover/qty:opacity-100 group-hover/qty:pointer-events-auto'
                : showMobileQuantityControls
                  ? 'w-7 opacity-100'
                  : 'w-0 opacity-0 pointer-events-none',
            )}
          >
            <Button
              type="button"
              color="white"
              appearance="transparent"
              size="xs"
              iconOnly
              icon={<Plus animateOnHover={false} />}
              aria-label={`Povečaj količino za ${displayTitle}`}
              disabled={updating}
              onClick={() => onIncreaseQuantity(item)}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

export const ShoppingListItemRow = memo(ShoppingListItemRowComponent);
