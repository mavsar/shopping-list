import { cx } from 'class-variance-authority';
import { memo } from 'react';

import { getItemUnitLabel, ShoppingListItem } from '../types/lists';
import { CompletionCircleToggle } from './CompletionCircleToggle';
import { getItemCategoryColors, ItemCategoryIcon } from './ItemCategoryIcon';
import { Minus, Plus } from './lordicon/icons';
import { Button } from './ui';

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
  return `${day}. ${month} ${year} ob ${hours}:${minutes}`;
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
  const completed = item.status === 'completed';
  const showMobileQuantityControls = !supportsHoverPointer && quantityExpanded;
  const quantityLabel = `${item.quantity} ${getItemUnitLabel(item.unit)}`;
  const { soft } = getItemCategoryColors(item.category);

  const stepperSlotClassName = cx(
    'inline-flex shrink-0 items-center overflow-hidden transition-[width,opacity] duration-150 ease-out',
    supportsHoverPointer
      ? 'pointer-events-none w-0 opacity-0 group-hover/qty:pointer-events-auto group-hover/qty:w-8 group-hover/qty:opacity-100'
      : showMobileQuantityControls
        ? 'w-8 opacity-100'
        : 'pointer-events-none w-0 opacity-0',
  );

  return (
    <div
      className={cx(
        'grid min-h-12 grid-cols-[2.75rem_minmax(0,1fr)_auto] items-stretch',
        completed && 'opacity-60',
      )}
    >
        <button
          type="button"
          className="flex h-full w-full items-center justify-center border-0 bg-transparent pl-1 disabled:cursor-default disabled:opacity-50"
          aria-label={completed ? 'Označi kot aktivno' : 'Označi kot kupljeno'}
          aria-pressed={completed}
          disabled={updating}
          onClick={() => onCompletionToggle(item)}
        >
          <CompletionCircleToggle
            size="sm"
            completed={completed}
            disabled={updating}
            sparkleOnMount={sparkleOnMount}
            presentational
            onToggle={() => undefined}
          />
        </button>

        <div className="flex min-w-0 items-center gap-2.5 py-1.5 pr-1">
          <span
            className={cx(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
              completed && 'grayscale',
            )}
            style={{ backgroundColor: completed ? 'transparent' : soft }}
          >
            <ItemCategoryIcon category={item.category} size={22} staticDisplay />
          </span>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              className="block w-full rounded text-left"
              aria-label={`Uredi ${displayTitle}`}
              onClick={() => onOpenDetails(item)}
            >
              <span
                className={cx(
                  'block line-clamp-2 text-sm font-medium leading-4',
                  completed ? 'text-ink-muted line-through decoration-ink-faint' : 'text-ink',
                )}
              >
                {displayTitle}
                {item.oneTime ? (
                  <span
                    className="ml-1.5 inline-block rounded-full bg-butter-soft px-1.5 py-px align-middle text-[10px] font-medium uppercase tracking-wide leading-3 text-ink-soft no-underline"
                    title="Enkratni nakup — po nakupu se izbriše"
                  >
                    enkratno
                  </span>
                ) : null}
              </span>
            </button>
            {completed ? (
              <span className="mt-0.5 block text-[10px] leading-3 text-ink-faint">
                Kupljeno {formatCompletedAt(item.updatedAt)}
              </span>
            ) : null}
            {item.note ? (
              <span className="mt-0.5 block line-clamp-1 text-xs text-ink-muted">{item.note}</span>
            ) : null}
          </div>
        </div>

        <div className="group/qty flex items-center pr-2">
          <div className={stepperSlotClassName}>
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
              'min-w-11 whitespace-nowrap rounded-full border-0 px-2 py-0.5 text-center text-[11px] font-semibold tabular-nums',
              completed ? 'bg-transparent text-ink-faint' : 'bg-paper-deep text-ink-soft',
              supportsHoverPointer ? 'cursor-default' : 'cursor-pointer active:bg-line',
            )}
            aria-label={`Količina za ${displayTitle}`}
            aria-expanded={showMobileQuantityControls}
            onClick={() => onQuantityToggle(item.id)}
          >
            {quantityLabel}
          </button>

          <div className={stepperSlotClassName}>
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
  );
}

export const ShoppingListItemRow = memo(ShoppingListItemRowComponent);
