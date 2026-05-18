import { cx } from 'class-variance-authority';
import { AnimatePresence, motion } from 'motion/react';
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { AppHeader } from '../components/AppHeader';
import { ItemCategoryIcon, itemCategoryLabels } from '../components/ItemCategoryIcon';
import { ListItemCard } from '../components/ListItemCard';
import {
  ArrowLeft,
  CheckCheck,
  Edit,
  Minus,
  Plus,
  Search,
  SettingsCog,
  Trash2,
} from '../components/lordicon/icons';
import { Button, Dialog, Input, Loader, Select, SharedTabs, Textarea } from '../components/ui';
import type { ItemCategory } from '../domain/item-category';
import { inferCategoryFromTitle, itemCategoryValues } from '../domain/item-category';
import { toListSlug } from '../domain/list-slug';
import type { AuthUser } from '../types/auth';
import {
  CatalogItem,
  getItemUnitLabel,
  itemUnitSelectValues,
  normalizeShoppingItemUnit,
  ShoppingItemUnit,
  ShoppingList,
  ShoppingListItem,
} from '../types/lists';

type ListDetailsPageProps = {
  token: string;
  authUser: AuthUser;
  onLogout: () => Promise<void>;
};

type ImageCandidate = {
  imageUrl: string;
  sourceUrl: string;
};

const quantityStep = 1;

function formatItemTitle(title: string): string {
  const normalized = title.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return '';
  }
  return normalized.charAt(0).toLocaleUpperCase() + normalized.slice(1);
}

function isVisibleListItemStatus(status: ShoppingListItem['status']): boolean {
  return status === 'active' || status === 'completed';
}

function sortShoppingItemsNewestFirst(a: ShoppingListItem, b: ShoppingListItem): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function resolveImageSearchTarget(...candidates: string[]): string {
  for (const candidate of candidates) {
    const normalizedCandidate = candidate.trim();
    if (normalizedCandidate) {
      return normalizedCandidate;
    }
  }
  return '';
}

type ItemQuantityUnitControlsProps = {
  quantity: number;
  onQuantityChange: (value: number) => void;
  unit: ShoppingItemUnit;
  onUnitChange: (value: ShoppingItemUnit) => void;
  disabled?: boolean;
  buttonSize?: 'sm' | 'md' | 'lg';
};

function ItemQuantityUnitControls({
  quantity,
  onQuantityChange,
  unit,
  onUnitChange,
  disabled = false,
  buttonSize,
}: ItemQuantityUnitControlsProps) {
  return (
    <div className="flex no-wrap items-center gap-2">
      <Button
        type="button"
        color="white"
        appearance="outline"
        iconOnly
        size={buttonSize}
        icon={<Minus animateOnHover />}
        aria-label="Zmanjšaj količino"
        disabled={disabled}
        onClick={() => onQuantityChange(Math.max(1, Number((quantity - quantityStep).toFixed(2))))}
      />
      <Input
        type="text"
        className="w-12 text-center"
        min={1}
        max={9999}
        step={0.5}
        value={quantity}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          onQuantityChange(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
        }}
        required
      />
      <Button
        type="button"
        color="white"
        appearance="outline"
        iconOnly
        size={buttonSize}
        icon={<Plus animateOnHover />}
        aria-label="Povečaj količino"
        disabled={disabled}
        onClick={() => onQuantityChange(Number((quantity + quantityStep).toFixed(2)))}
      />
      <Select
        value={unit}
        onChange={(event) => onUnitChange(event.target.value as ShoppingItemUnit)}
      >
        {itemUnitSelectValues.map((itemUnit) => (
          <option key={itemUnit} value={itemUnit}>
            {getItemUnitLabel(itemUnit)}
          </option>
        ))}
      </Select>
    </div>
  );
}

type SharedItemFormFieldsProps = {
  name: string;
  onNameChange: (value: string) => void;
  onNameBlur?: (value: string) => void;
  quantity: number;
  onQuantityChange: (value: number) => void;
  quantityButtonSize?: 'sm' | 'md' | 'lg';
  unit: ShoppingItemUnit;
  onUnitChange: (value: ShoppingItemUnit) => void;
  note: string;
  onNoteChange: (value: string) => void;
  notePlaceholder: string;
  noteRows: 2 | 3;
  category: ItemCategory;
  onCategoryChange: (value: ItemCategory) => void;
  categoryLoading?: boolean;
  imageSearchQuery: string;
  onImageSearchQueryChange: (value: string) => void;
  onFindImage: () => void;
  imageCandidates: ImageCandidate[];
  onSelectImageCandidate: (candidate: ImageCandidate) => void;
  selectingImageCandidateUrl: string;
  findImageLoading: boolean;
  imageUrl: string;
  imagePreviewUrl: string;
  sourceUrl: string;
  findImageError: string;
  onRemoveImage?: () => void;
  onUploadImageFile: (file: File) => Promise<void>;
  onPasteImageFromClipboard: () => Promise<void>;
  disabled?: boolean;
};

function SharedItemFormFields({
  name,
  onNameChange,
  onNameBlur,
  quantity,
  onQuantityChange,
  quantityButtonSize,
  unit,
  onUnitChange,
  note,
  onNoteChange,
  notePlaceholder,
  noteRows,
  category,
  onCategoryChange,
  categoryLoading = false,
  imageSearchQuery,
  onImageSearchQueryChange,
  onFindImage,
  imageCandidates,
  onSelectImageCandidate,
  selectingImageCandidateUrl,
  findImageLoading,
  imageUrl,
  imagePreviewUrl,
  sourceUrl,
  findImageError,
  onRemoveImage,
  onUploadImageFile,
  onPasteImageFromClipboard,
  disabled = false,
}: SharedItemFormFieldsProps) {
  const [brokenCandidateUrls, setBrokenCandidateUrls] = useState<Set<string>>(new Set());
  const [imageMode, setImageMode] = useState<'find-online' | 'upload' | 'clipboard'>('find-online');
  const [imageToolsVisible, setImageToolsVisible] = useState(
    !(Boolean(imageUrl) && Boolean(onRemoveImage)),
  );
  const [clipboardHasImage, setClipboardHasImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const visibleImageCandidates = useMemo(
    () => imageCandidates.filter((candidate) => !brokenCandidateUrls.has(candidate.imageUrl)),
    [brokenCandidateUrls, imageCandidates],
  );

  useEffect(() => {
    setBrokenCandidateUrls(new Set());
  }, [imageCandidates]);

  useEffect(() => {
    if (!imageUrl || !onRemoveImage) {
      setImageToolsVisible(true);
    }
  }, [imageUrl, onRemoveImage]);

  useEffect(() => {
    let isMounted = true;

    async function refreshClipboardAvailability() {
      if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
        if (isMounted) {
          setClipboardHasImage(false);
        }
        return;
      }
      try {
        const clipboardItems = await navigator.clipboard.read();
        const hasImage = clipboardItems.some((item) =>
          item.types.some((type) => type.startsWith('image/')),
        );
        if (isMounted) {
          setClipboardHasImage(hasImage);
        }
      } catch {
        if (isMounted) {
          setClipboardHasImage(false);
        }
      }
    }

    void refreshClipboardAvailability();
    const handleWindowFocus = () => {
      void refreshClipboardAvailability();
    };
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      isMounted = false;
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  return (
    <>
      <div className="flex no-wrap gap-2">
        <Input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          onBlur={(event) => onNameBlur?.(event.target.value)}
          placeholder="Ime izdelka"
          minLength={1}
          maxLength={200}
          required
          className="flex-1"
        />
        <ItemQuantityUnitControls
          quantity={quantity}
          onQuantityChange={onQuantityChange}
          unit={unit}
          onUnitChange={onUnitChange}
          disabled={disabled}
          buttonSize={quantityButtonSize}
        />
      </div>
      <div className="relative">
        <Select
          value={category}
          onChange={(event) => onCategoryChange(event.target.value as ItemCategory)}
          disabled={categoryLoading || disabled}
          className="w-full"
        >
          {itemCategoryValues.map((itemCategory) => (
            <option key={itemCategory} value={itemCategory}>
              {itemCategoryLabels[itemCategory]}
            </option>
          ))}
        </Select>
        {categoryLoading ? (
          <p className="m-0 mt-1 flex items-center gap-1.5 text-xs text-slate-400 italic">
            <svg className="h-3 w-3 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Gemini predlaga kategorijo...
          </p>
        ) : null}
      </div>
      <Textarea
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
        placeholder={notePlaceholder}
        maxLength={500}
        resize="none"
        rows={noteRows}
      />
      <div className="grid gap-3 rounded-2xl">
        {imageUrl ? (
          <div
            className={cx(
              'aspect-square w-full overflow-hidden rounded-xl bg-white',
              findImageLoading && 'opacity-60',
            )}
          >
            <img
              src={imagePreviewUrl || imageUrl}
              alt={name || 'Predogled'}
              className="block h-full w-full object-cover object-center"
              loading="lazy"
            />
          </div>
        ) : null}
        {imageUrl && onRemoveImage ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="xs"
              color="white"
              appearance="outline"
              icon={<Edit animateOnHover />}
              disabled={findImageLoading || disabled}
              onClick={() => setImageToolsVisible(true)}
            >
              Spremeni sliko
            </Button>
            <Button
              type="button"
              size="xs"
              color="white"
              appearance="outline"
              icon={<Trash2 animateOnHover />}
              disabled={findImageLoading || disabled}
              onClick={() => {
                onRemoveImage();
                setImageToolsVisible(true);
              }}
            >
              Izbriši sliko
            </Button>
          </div>
        ) : null}
        {imageToolsVisible ? (
          <>
            <div className="h-px w-full bg-white/12" />
            <SharedTabs
              value={imageMode}
              onValueChange={(value) =>
                setImageMode(value as 'find-online' | 'upload' | 'clipboard')
              }
              items={[
                { value: 'find-online', label: 'Poišči sliko na spletu', disabled },
                { value: 'upload', label: 'Naloži', disabled },
                {
                  value: 'clipboard',
                  label: 'Prilepi iz odložišča',
                  disabled: disabled || !clipboardHasImage,
                },
              ]}
              listClassName="grid-cols-3"
            />
            {imageMode === 'find-online' ? (
              <>
                <div className="flex items-center gap-2">
                  <Input
                    value={imageSearchQuery}
                    onChange={(event) => onImageSearchQueryChange(event.target.value)}
                    placeholder="Išči ..."
                    maxLength={200}
                    aria-label="Iskalna fraza slike"
                  />
                  <Button
                    type="button"
                    appearance="outline"
                    color="white"
                    iconOnly
                    icon={<Search animateOnHover />}
                    aria-label={findImageLoading ? 'Iščem sliko' : 'Poišči sliko'}
                    disabled={findImageLoading || disabled}
                    onClick={() => void onFindImage()}
                  />
                </div>
                {findImageLoading ? (
                  <Loader
                    label={
                      selectingImageCandidateUrl
                        ? 'Uporabljam izbrano sliko...'
                        : 'Iščem predloge slik...'
                    }
                  />
                ) : null}
                {visibleImageCandidates.length ? (
                  <div className="grid grid-cols-3 gap-2">
                    {visibleImageCandidates.map((candidate) => (
                      <button
                        key={candidate.imageUrl}
                        type="button"
                        className={cx(
                          'aspect-square cursor-pointer overflow-hidden rounded-lg border border-white/12 bg-slate-900/50 p-0 transition',
                          selectingImageCandidateUrl === candidate.imageUrl &&
                            'border-cyan-300/60 opacity-70',
                          !findImageLoading && 'hover:border-cyan-300/45',
                        )}
                        onClick={() => onSelectImageCandidate(candidate)}
                        disabled={findImageLoading || disabled}
                        title="Uporabi to sliko"
                      >
                        <img
                          src={candidate.imageUrl}
                          alt="Predlog slike"
                          className="block h-full w-full object-contain object-center"
                          loading="lazy"
                          onError={() =>
                            setBrokenCandidateUrls((currentBrokenUrls) => {
                              const nextBrokenUrls = new Set(currentBrokenUrls);
                              nextBrokenUrls.add(candidate.imageUrl);
                              return nextBrokenUrls;
                            })
                          }
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
            {imageMode === 'upload' ? (
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const selectedFile = event.target.files?.[0];
                    if (!selectedFile) {
                      return;
                    }
                    void onUploadImageFile(selectedFile);
                    event.target.value = '';
                  }}
                />
                <Button
                  type="button"
                  color="white"
                  appearance="outline"
                  disabled={findImageLoading || disabled}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Izberi iz galerije/računalnika
                </Button>
              </div>
            ) : null}
            {imageMode === 'clipboard' ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  color="white"
                  appearance="outline"
                  disabled={findImageLoading || disabled || !clipboardHasImage}
                  onClick={() => void onPasteImageFromClipboard()}
                >
                  Prilepi sliko zdaj
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
        {findImageError ? <p className="m-0 text-xs text-rose-200">{findImageError}</p> : null}
      </div>
    </>
  );
}

export function ListDetailsPage({ token, authUser, onLogout: _onLogout }: ListDetailsPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { listSlug } = useParams();
  const initialListName = ((location.state as { listName?: string } | null)?.listName ?? '').trim();
  const [list, setList] = useState<ShoppingList | null>(null);
  const [resolvedListId, setResolvedListId] = useState<number | null>(null);
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [itemsLoading, setItemsLoading] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [searchResults, setSearchResults] = useState<CatalogItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [showCreateItemStep, setShowCreateItemStep] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState(1);
  const [newItemUnit, setNewItemUnit] = useState<ShoppingItemUnit>('kos');
  const [newItemNote, setNewItemNote] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<ItemCategory>('drugo');
  const [newItemCategoryLoading, setNewItemCategoryLoading] = useState(false);
  const [newItemImageUrl, setNewItemImageUrl] = useState('');
  const [newItemImagePreviewUrl, setNewItemImagePreviewUrl] = useState('');
  const [newItemSourceUrl, setNewItemSourceUrl] = useState('');
  const [imageSearchQuery, setImageSearchQuery] = useState('');
  const [imageCandidates, setImageCandidates] = useState<ImageCandidate[]>([]);
  const [selectingImageCandidateUrl, setSelectingImageCandidateUrl] = useState('');
  const [findImageLoading, setFindImageLoading] = useState(false);
  const [findImageError, setFindImageError] = useState('');

  const [addItemLoading, setAddItemLoading] = useState(false);
  const [addItemError, setAddItemError] = useState('');
  const [updatingItemId, setUpdatingItemId] = useState<number | null>(null);
  const [updatingItemError, setUpdatingItemError] = useState('');
  const [recentlyCompletedItemId, setRecentlyCompletedItemId] = useState<number | null>(null);
  const [supportsHoverPointer, setSupportsHoverPointer] = useState(false);
  const [hoveredQuantityItemId, setHoveredQuantityItemId] = useState<number | null>(null);
  const [expandedQuantityItemId, setExpandedQuantityItemId] = useState<number | null>(null);
  const [detailsListItemId, setDetailsListItemId] = useState<number | null>(null);
  const [detailsEditQuantity, setDetailsEditQuantity] = useState(1);
  const [detailsEditUnit, setDetailsEditUnit] = useState<ShoppingItemUnit>('kos');
  const [detailsEditNote, setDetailsEditNote] = useState('');
  const [detailsEditName, setDetailsEditName] = useState('');
  const [detailsEditCategory, setDetailsEditCategory] = useState<ItemCategory>('drugo');
  const [detailsEditImageUrl, setDetailsEditImageUrl] = useState('');
  const [detailsEditImagePreviewUrl, setDetailsEditImagePreviewUrl] = useState('');
  const [detailsEditSourceUrl, setDetailsEditSourceUrl] = useState('');
  const [detailsEditImageRemoved, setDetailsEditImageRemoved] = useState(false);
  const [detailsImageSearchQuery, setDetailsImageSearchQuery] = useState('');
  const [detailsImageCandidates, setDetailsImageCandidates] = useState<ImageCandidate[]>([]);
  const [detailsSelectingImageCandidateUrl, setDetailsSelectingImageCandidateUrl] = useState('');
  const [detailsFindImageLoading, setDetailsFindImageLoading] = useState(false);
  const [detailsFindImageError, setDetailsFindImageError] = useState('');
  const [detailsCategoryLoading, setDetailsCategoryLoading] = useState(false);
  const searchRequestIdRef = useRef(0);
  const categoryManualRef = useRef(false);
  const recentlyCompletedTimeoutRef = useRef<number | null>(null);
  const detailsCategoryTimeoutRef = useRef<number | null>(null);

  const detailsItem = useMemo(
    () =>
      detailsListItemId === null
        ? null
        : (items.find((row) => row.id === detailsListItemId) ?? null),
    [detailsListItemId, items],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    const updateSupportsHoverPointer = () => {
      setSupportsHoverPointer(mediaQuery.matches);
    };

    updateSupportsHoverPointer();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateSupportsHoverPointer);
      return () => {
        mediaQuery.removeEventListener('change', updateSupportsHoverPointer);
      };
    }

    mediaQuery.addListener(updateSupportsHoverPointer);
    return () => {
      mediaQuery.removeListener(updateSupportsHoverPointer);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (recentlyCompletedTimeoutRef.current !== null) {
        window.clearTimeout(recentlyCompletedTimeoutRef.current);
      }
    };
  }, []);

  const groupedActiveItems = useMemo(() => {
    const activeItems = items.filter((row) => row.status === 'active');
    const byCategory = new Map<ItemCategory, ShoppingListItem[]>();

    for (const row of activeItems) {
      const categoryRows = byCategory.get(row.category) ?? [];
      categoryRows.push(row);
      byCategory.set(row.category, categoryRows);
    }

    return Array.from(byCategory.entries())
      .sort((a, b) => itemCategoryLabels[a[0]].localeCompare(itemCategoryLabels[b[0]], 'sl'))
      .map(([category, rows]) => ({
        category,
        items: rows.sort(sortShoppingItemsNewestFirst),
      }));
  }, [items]);

  const completedVisibleItems = useMemo(
    () => items.filter((row) => row.status === 'completed').sort(sortShoppingItemsNewestFirst),
    [items],
  );

  function isQuantityControlsVisible(itemId: number) {
    return supportsHoverPointer
      ? hoveredQuantityItemId === itemId
      : expandedQuantityItemId === itemId;
  }

  function handleQuantityLabelClick(itemId: number) {
    if (supportsHoverPointer) {
      return;
    }
    setExpandedQuantityItemId((current) => (current === itemId ? null : itemId));
  }

  const quantityControlsTransition = { duration: 0.16, ease: 'easeOut' } as const;

  function handleCompletionToggle(item: ShoppingListItem) {
    const nextStatus = item.status === 'completed' ? 'active' : 'completed';

    if (nextStatus === 'completed') {
      setRecentlyCompletedItemId(item.id);
      if (recentlyCompletedTimeoutRef.current !== null) {
        window.clearTimeout(recentlyCompletedTimeoutRef.current);
      }
      recentlyCompletedTimeoutRef.current = window.setTimeout(() => {
        setRecentlyCompletedItemId((current) => (current === item.id ? null : current));
      }, 900);
    } else {
      setRecentlyCompletedItemId((current) => (current === item.id ? null : current));
    }

    void patchListItem(item.id, { status: nextStatus });
  }

  function decreaseItemQuantity(item: ShoppingListItem) {
    void patchListItem(item.id, {
      quantity: Math.max(1, Number((item.quantity - quantityStep).toFixed(2))),
    });
  }

  function increaseItemQuantity(item: ShoppingListItem) {
    void patchListItem(item.id, { quantity: Number((item.quantity + quantityStep).toFixed(2)) });
  }

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
    }),
    [token],
  );

  useEffect(() => {
    if (!listSlug?.trim()) {
      setListError('Neveljaven URL seznama.');
      setResolvedListId(null);
      setList(null);
      return;
    }
    const currentListSlug = listSlug.trim();

    async function resolveListFromSlug() {
      setListLoading(true);
      setListError('');
      try {
        const response = await fetch('/api/lists', { headers: authHeaders });
        if (!response.ok) {
          throw new Error(`Pridobivanje seznamov ni uspelo (status ${response.status}).`);
        }
        const payload = (await response.json()) as { lists: ShoppingList[] };
        const matched =
          payload.lists.find((row) => toListSlug(row.name) === currentListSlug) ?? null;
        if (!matched) {
          setList(null);
          setResolvedListId(null);
          setListError('Seznam ni najden.');
          return;
        }
        setList(matched);
        setResolvedListId(matched.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Neznana napaka';
        setListError(message);
        setResolvedListId(null);
      } finally {
        setListLoading(false);
      }
    }

    void resolveListFromSlug();
  }, [authHeaders, listSlug, refreshVersion]);

  useEffect(() => {
    if (!resolvedListId) {
      setItems([]);
      return;
    }

    async function loadItems() {
      setItemsLoading(true);
      setUpdatingItemError('');
      try {
        const itemsResponse = await fetch(`/api/lists/${resolvedListId}/items?status=all`, {
          headers: authHeaders,
        });

        if (!itemsResponse.ok) {
          throw new Error(`Pridobivanje izdelkov ni uspelo (status ${itemsResponse.status}).`);
        }

        const itemsPayload = (await itemsResponse.json()) as { items: ShoppingListItem[] };
        setItems(itemsPayload.items.filter((row) => isVisibleListItemStatus(row.status)));
        setLastSyncedAt(new Date());
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Neznana napaka';
        setUpdatingItemError(message);
      } finally {
        setItemsLoading(false);
      }
    }

    void loadItems();
  }, [authHeaders, resolvedListId, refreshVersion]);

  const refreshData = useCallback(async () => {
    setRefreshVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!showCreateItemStep || categoryManualRef.current) {
      return;
    }
    setNewItemCategory(inferCategoryFromTitle(newItemName));

    const trimmed = newItemName.trim();
    if (!trimmed) {
      return;
    }

    const timeout = window.setTimeout(async () => {
      if (categoryManualRef.current) {
        return;
      }
      setNewItemCategoryLoading(true);
      try {
        const response = await fetch(
          `/api/items/suggest-category?title=${encodeURIComponent(trimmed)}`,
          { headers: authHeaders },
        );
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { category: string };
        if (!categoryManualRef.current) {
          setNewItemCategory(data.category as ItemCategory);
        }
      } catch {
        // silently ignore — local guess remains
      } finally {
        setNewItemCategoryLoading(false);
      }
    }, 500);

    return () => {
      window.clearTimeout(timeout);
      setNewItemCategoryLoading(false);
    };
  }, [newItemName, showCreateItemStep, authHeaders]);

  useEffect(() => {
    if (!addDialogOpen || showCreateItemStep) {
      return;
    }

    const normalizedQuery = searchValue.trim();

    const timeout = window.setTimeout(() => {
      async function runSearch() {
        const requestId = searchRequestIdRef.current + 1;
        searchRequestIdRef.current = requestId;
        setSearchLoading(true);
        setSearchError('');
        try {
          const response = await fetch(
            `/api/items/suggest?q=${encodeURIComponent(normalizedQuery)}&limit=500`,
            {
              headers: authHeaders,
            },
          );
          if (!response.ok) {
            throw new Error(`Iskanje ni uspelo (status ${response.status}).`);
          }

          const payload = (await response.json()) as { items: CatalogItem[] };
          if (searchRequestIdRef.current === requestId) {
            setSearchResults(payload.items);
          }
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            return;
          }
          const message = error instanceof Error ? error.message : 'Neznana napaka';
          if (searchRequestIdRef.current === requestId) {
            setSearchError(message);
          }
        } finally {
          if (searchRequestIdRef.current === requestId) {
            setSearchLoading(false);
          }
        }
      }

      void runSearch();
    }, 220);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [addDialogOpen, authHeaders, searchValue, showCreateItemStep]);

  function resetDialogState() {
    setAddDialogOpen(false);
    setSearchValue('');
    setSearchResults([]);
    setSearchError('');
    setSearchLoading(false);
    setShowCreateItemStep(false);
    setNewItemName('');
    setNewItemQuantity(1);
    setNewItemUnit('kos');
    setNewItemNote('');
    setNewItemCategory('drugo');
    setNewItemCategoryLoading(false);
    categoryManualRef.current = false;
    setNewItemImageUrl('');
    setNewItemImagePreviewUrl('');
    setNewItemSourceUrl('');
    setImageSearchQuery('');
    setImageCandidates([]);
    setSelectingImageCandidateUrl('');
    setFindImageError('');
    setFindImageLoading(false);
    setAddItemError('');
    setAddItemLoading(false);
  }

  function openCreateItemStep(prefillName?: string) {
    categoryManualRef.current = false;
    setShowCreateItemStep(true);
    setAddItemError('');
    setFindImageError('');
    setFindImageLoading(false);
    setImageSearchQuery('');
    setImageCandidates([]);
    setSelectingImageCandidateUrl('');
    setNewItemImageUrl('');
    setNewItemImagePreviewUrl('');
    setNewItemSourceUrl('');
    setNewItemName(prefillName?.trim() || searchValue.trim());
  }

  function openCreateItemEditStep(item: CatalogItem) {
    openCreateItemStep(item.title);
    categoryManualRef.current = true;
    setNewItemCategory(item.category);
    setNewItemImageUrl(item.imageUrl ?? '');
    setNewItemImagePreviewUrl(item.imageUrl ?? '');
    setNewItemSourceUrl('');
  }

  async function addExistingItem(itemTitle: string) {
    if (!resolvedListId) {
      setAddItemError('Seznam še ni naložen.');
      return;
    }
    setAddItemLoading(true);
    setAddItemError('');
    try {
      const response = await fetch(`/api/lists/${resolvedListId}/items`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: formatItemTitle(itemTitle),
          quantity: 1,
          unit: 'kos',
        }),
      });

      const payload = (await response.json()) as { listItem?: ShoppingListItem; error?: string };
      if (!response.ok || !payload.listItem) {
        throw new Error(payload.error ?? `Dodajanje izdelka ni uspelo (status ${response.status}).`);
      }

      setItems((currentItems) => {
        const withoutExisting = currentItems.filter(
          (currentItem) => currentItem.id !== payload.listItem?.id,
        );
        if (!isVisibleListItemStatus((payload.listItem as ShoppingListItem).status)) {
          return withoutExisting;
        }
        return [payload.listItem as ShoppingListItem, ...withoutExisting];
      });
      resetDialogState();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Neznana napaka';
      setAddItemError(message);
    } finally {
      setAddItemLoading(false);
    }
  }

  async function handleCreateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resolvedListId) {
      setAddItemError('Seznam še ni naložen.');
      return;
    }
    if (!newItemName.trim()) {
      setAddItemError('Ime izdelka je obvezno.');
      return;
    }

    setAddItemLoading(true);
    setAddItemError('');
    try {
      const response = await fetch(`/api/lists/${resolvedListId}/items`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: formatItemTitle(newItemName),
          quantity: newItemQuantity,
          unit: newItemUnit,
          note: newItemNote.trim() ? newItemNote.trim() : undefined,
          category: newItemCategory,
          imageUrl: newItemImageUrl.trim() ? newItemImageUrl.trim() : undefined,
          sourceUrl: newItemSourceUrl.trim() ? newItemSourceUrl.trim() : undefined,
        }),
      });

      const payload = (await response.json()) as { listItem?: ShoppingListItem; error?: string };
      if (!response.ok || !payload.listItem) {
        throw new Error(payload.error ?? `Dodajanje izdelka ni uspelo (status ${response.status}).`);
      }

      setItems((currentItems) => {
        const withoutExisting = currentItems.filter(
          (currentItem) => currentItem.id !== payload.listItem?.id,
        );
        if (!isVisibleListItemStatus((payload.listItem as ShoppingListItem).status)) {
          return withoutExisting;
        }
        return [payload.listItem as ShoppingListItem, ...withoutExisting];
      });
      resetDialogState();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Neznana napaka';
      setAddItemError(message);
    } finally {
      setAddItemLoading(false);
    }
  }

  async function searchImageCandidatesWithQuery(
    searchTarget: string,
    setLoading: (value: boolean) => void,
    setError: (value: string) => void,
    setCandidates: (value: ImageCandidate[]) => void,
    setSelectingCandidateUrl: (value: string) => void,
  ) {
    if (!searchTarget) {
      setError('Vnesi ime izdelka ali iskalno frazo slike.');
      return;
    }

    setLoading(true);
    setError('');
    setCandidates([]);
    setSelectingCandidateUrl('');
    try {
      const response = await fetch(
        `/api/items/search-images?q=${encodeURIComponent(searchTarget)}`,
        {
          headers: authHeaders,
        },
      );

      const payload = (await response.json()) as {
        found?: boolean;
        candidates?: ImageCandidate[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          payload.error ?? `Iskanje predlogov slik ni uspelo (status ${response.status}).`,
        );
      }
      if (!payload.found || !payload.candidates?.length) {
        throw new Error(payload.error ?? 'Za ta izdelek ni najdenih predlogov slik.');
      }

      setCandidates(payload.candidates);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Neznana napaka';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function selectImageCandidateWithQuery(
    searchTarget: string,
    candidate: ImageCandidate,
    setLoading: (value: boolean) => void,
    setError: (value: string) => void,
    setImageUrl: (value: string) => void,
    setImagePreviewUrl: (value: string) => void,
    setSourceUrl: (value: string) => void,
    setCandidates: (value: ImageCandidate[]) => void,
    setSelectingCandidateUrl: (value: string) => void,
  ) {
    if (!searchTarget) {
      setError('Vnesi ime izdelka ali iskalno frazo slike.');
      return;
    }

    setLoading(true);
    setError('');
    setSelectingCandidateUrl(candidate.imageUrl);
    try {
      const response = await fetch('/api/items/select-image', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: searchTarget,
          imageUrl: candidate.imageUrl,
          sourceUrl: candidate.sourceUrl,
        }),
      });

      const payload = (await response.json()) as {
        found?: boolean;
        imageUrl?: string;
        sourceUrl?: string;
        error?: string;
      };
      if (!response.ok || !payload.found || !payload.imageUrl) {
        throw new Error(
          payload.error ?? `Uporaba izbrane slike ni uspela (status ${response.status}).`,
        );
      }

      setImageUrl(payload.imageUrl);
      setImagePreviewUrl(`${payload.imageUrl}?v=${Date.now()}`);
      setSourceUrl(payload.sourceUrl ?? candidate.sourceUrl ?? '');
      setCandidates([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Neznana napaka';
      setError(message);
    } finally {
      setSelectingCandidateUrl('');
      setLoading(false);
    }
  }

  async function uploadImageFileWithQuery(
    searchTarget: string,
    file: File,
    setLoading: (value: boolean) => void,
    setError: (value: string) => void,
    setImageUrl: (value: string) => void,
    setImagePreviewUrl: (value: string) => void,
    setSourceUrl: (value: string) => void,
    setCandidates: (value: ImageCandidate[]) => void,
    setSelectingCandidateUrl: (value: string) => void,
  ) {
    if (!searchTarget) {
      setError('Najprej vnesi ime izdelka.');
      return;
    }

    setLoading(true);
    setError('');
    setSelectingCandidateUrl('');
    try {
      const response = await fetch(
        `/api/items/upload-image?q=${encodeURIComponent(searchTarget)}`,
        {
          method: 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': file.type || 'application/octet-stream',
          },
          body: file,
        },
      );

      const payload = (await response.json()) as {
        found?: boolean;
        imageUrl?: string;
        error?: string;
      };
      if (!response.ok || !payload.found || !payload.imageUrl) {
        throw new Error(payload.error ?? `Nalaganje slike ni uspelo (status ${response.status}).`);
      }

      setImageUrl(payload.imageUrl);
      setImagePreviewUrl(`${payload.imageUrl}?v=${Date.now()}`);
      setSourceUrl('');
      setCandidates([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Neznana napaka';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function readImageFromClipboard(): Promise<File | null> {
    if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
      return null;
    }

    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const clipboardItem of clipboardItems) {
        const imageType = clipboardItem.types.find((type) => type.startsWith('image/'));
        if (!imageType) {
          continue;
        }
        const blob = await clipboardItem.getType(imageType);
        const extension = imageType.split('/')[1] || 'png';
        return new File([blob], `clipboard-${Date.now()}.${extension}`, { type: imageType });
      }
    } catch {
      return null;
    }

    return null;
  }

  async function findImage() {
    const searchTarget = resolveImageSearchTarget(imageSearchQuery, newItemName, searchValue);
    await searchImageCandidatesWithQuery(
      searchTarget,
      setFindImageLoading,
      setFindImageError,
      setImageCandidates,
      setSelectingImageCandidateUrl,
    );
  }

  async function selectImageCandidate(candidate: ImageCandidate) {
    const searchTarget = resolveImageSearchTarget(imageSearchQuery, newItemName, searchValue);
    await selectImageCandidateWithQuery(
      searchTarget,
      candidate,
      setFindImageLoading,
      setFindImageError,
      setNewItemImageUrl,
      setNewItemImagePreviewUrl,
      setNewItemSourceUrl,
      setImageCandidates,
      setSelectingImageCandidateUrl,
    );
  }

  async function uploadNewItemImage(file: File) {
    const searchTarget = resolveImageSearchTarget(imageSearchQuery, newItemName, searchValue);
    await uploadImageFileWithQuery(
      searchTarget,
      file,
      setFindImageLoading,
      setFindImageError,
      setNewItemImageUrl,
      setNewItemImagePreviewUrl,
      setNewItemSourceUrl,
      setImageCandidates,
      setSelectingImageCandidateUrl,
    );
  }

  async function pasteNewItemImageFromClipboard() {
    const clipboardImage = await readImageFromClipboard();
    if (!clipboardImage) {
      setFindImageError('V odložišču ni slike.');
      return;
    }
    await uploadNewItemImage(clipboardImage);
  }

  async function findDetailsImage() {
    const searchTarget = resolveImageSearchTarget(detailsImageSearchQuery, detailsEditName);
    await searchImageCandidatesWithQuery(
      searchTarget,
      setDetailsFindImageLoading,
      setDetailsFindImageError,
      setDetailsImageCandidates,
      setDetailsSelectingImageCandidateUrl,
    );
  }

  async function selectDetailsImageCandidate(candidate: ImageCandidate) {
    setDetailsEditImageRemoved(false);
    const searchTarget = resolveImageSearchTarget(detailsImageSearchQuery, detailsEditName);
    await selectImageCandidateWithQuery(
      searchTarget,
      candidate,
      setDetailsFindImageLoading,
      setDetailsFindImageError,
      setDetailsEditImageUrl,
      setDetailsEditImagePreviewUrl,
      setDetailsEditSourceUrl,
      setDetailsImageCandidates,
      setDetailsSelectingImageCandidateUrl,
    );
  }

  async function uploadDetailsItemImage(file: File) {
    setDetailsEditImageRemoved(false);
    const searchTarget = resolveImageSearchTarget(detailsImageSearchQuery, detailsEditName);
    await uploadImageFileWithQuery(
      searchTarget,
      file,
      setDetailsFindImageLoading,
      setDetailsFindImageError,
      setDetailsEditImageUrl,
      setDetailsEditImagePreviewUrl,
      setDetailsEditSourceUrl,
      setDetailsImageCandidates,
      setDetailsSelectingImageCandidateUrl,
    );
  }

  async function pasteDetailsImageFromClipboard() {
    const clipboardImage = await readImageFromClipboard();
    if (!clipboardImage) {
      setDetailsFindImageError('V odložišču ni slike.');
      return;
    }
    await uploadDetailsItemImage(clipboardImage);
  }

  function handleSearchEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    if (!searchLoading && !searchResults.length && searchValue.trim()) {
      openCreateItemStep(searchValue.trim());
    }
  }

  async function patchListItem(
    listItemId: number,
    payload: Partial<
      Pick<ShoppingListItem, 'title' | 'quantity' | 'unit' | 'note' | 'status' | 'category'>
    > & {
      imageUrl?: string | null;
      sourceUrl?: string | null;
    },
  ): Promise<boolean> {
    if (!resolvedListId) {
      setUpdatingItemError('Seznam še ni naložen.');
      return false;
    }
    setUpdatingItemId(listItemId);
    setUpdatingItemError('');
    try {
      const response = await fetch(`/api/lists/${resolvedListId}/items/${listItemId}`, {
        method: 'PATCH',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const responsePayload = (await response.json()) as {
        listItem?: ShoppingListItem;
        error?: string;
      };
      if (!response.ok || !responsePayload.listItem) {
        throw new Error(
          responsePayload.error ?? `Posodobitev izdelka ni uspela (status ${response.status}).`,
        );
      }

      setItems((currentItems) => {
        const nextItem = responsePayload.listItem as ShoppingListItem;
        if (!isVisibleListItemStatus(nextItem.status)) {
          return currentItems.filter((item) => item.id !== listItemId);
        }
        const hasExisting = currentItems.some((item) => item.id === listItemId);
        if (!hasExisting) {
          return [nextItem, ...currentItems];
        }
        return currentItems.map((item) => (item.id === listItemId ? nextItem : item));
      });
      setUpdatingItemError('');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Neznana napaka';
      setUpdatingItemError(message);
      return false;
    } finally {
      setUpdatingItemId(null);
    }
  }

  function openItemDetails(item: ShoppingListItem) {
    applyDetailsItemToEditState(item);
    setDetailsListItemId(item.id);
    setUpdatingItemError('');
  }

  function resetDetailsEditImageSearchState() {
    setDetailsImageSearchQuery('');
    setDetailsImageCandidates([]);
    setDetailsSelectingImageCandidateUrl('');
    setDetailsFindImageError('');
    setDetailsFindImageLoading(false);
  }

  function applyDetailsItemToEditState(item: ShoppingListItem) {
    setDetailsEditQuantity(item.quantity);
    setDetailsEditUnit(normalizeShoppingItemUnit(item.unit));
    setDetailsEditNote(item.note ?? '');
    setDetailsEditName(formatItemTitle(item.title));
    setDetailsEditCategory(item.category);
    setDetailsEditImageUrl(item.imageUrl ?? '');
    setDetailsEditImagePreviewUrl(item.imageUrl ?? '');
    setDetailsEditSourceUrl('');
    setDetailsEditImageRemoved(false);
    resetDetailsEditImageSearchState();
  }

  function applyDetailsCategoryGuessFromTitle(title: string) {
    setDetailsEditCategory(inferCategoryFromTitle(title));

    const trimmed = title.trim();
    if (detailsCategoryTimeoutRef.current !== null) {
      window.clearTimeout(detailsCategoryTimeoutRef.current);
      setDetailsCategoryLoading(false);
    }
    if (!trimmed) {
      return;
    }
    detailsCategoryTimeoutRef.current = window.setTimeout(async () => {
      setDetailsCategoryLoading(true);
      try {
        const response = await fetch(
          `/api/items/suggest-category?title=${encodeURIComponent(trimmed)}`,
          { headers: authHeaders },
        );
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { category: string };
        setDetailsEditCategory(data.category as ItemCategory);
      } catch {
        // silently ignore — local guess remains
      } finally {
        setDetailsCategoryLoading(false);
      }
    }, 500);
  }

  function handleDetailsEditNameChange(value: string) {
    setDetailsEditName(value);
    applyDetailsCategoryGuessFromTitle(value);
  }

  function handleDetailsEditNameBlur(value: string) {
    applyDetailsCategoryGuessFromTitle(value);
  }

  function removeDetailsEditImage() {
    setDetailsEditImageRemoved(true);
    setDetailsEditImageUrl('');
    setDetailsEditImagePreviewUrl('');
    setDetailsEditSourceUrl('');
  }

  async function saveDetailsEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detailsItem) {
      return;
    }
    if (!detailsEditName.trim()) {
      setUpdatingItemError('Ime izdelka je obvezno.');
      return;
    }
    const ok = await patchListItem(detailsItem.id, {
      title: formatItemTitle(detailsEditName),
      quantity: detailsEditQuantity,
      unit: detailsEditUnit,
      note: detailsEditNote.trim(),
      category: detailsEditCategory,
      imageUrl: detailsEditImageRemoved
        ? null
        : detailsEditImageUrl.trim()
          ? detailsEditImageUrl.trim()
          : undefined,
      sourceUrl: detailsEditImageRemoved
        ? null
        : detailsEditSourceUrl.trim()
          ? detailsEditSourceUrl.trim()
          : undefined,
    });
    if (ok) {
      setDetailsListItemId(null);
    }
  }

  function cancelDetailsEdit() {
    setDetailsListItemId(null);
  }

  return (
    <>
      <AppHeader
        title={list ? list.name : initialListName || 'Seznam'}
        syncInfo={{
          lastSyncedAt,
          refreshing: listLoading || itemsLoading,
          onRefresh: refreshData,
        }}
        actions={
          <>
            <Button
              color="white"
              appearance="outline"
              type="button"
              icon={<ArrowLeft animateOnHover />}
              iconOnly
              aria-label="Nazaj"
              title="Nazaj"
              onClick={() => navigate('/')}
            />
            {authUser.isAdmin ? (
              <Button
                color="white"
                appearance="outline"
                type="button"
                icon={<SettingsCog animation="default" />}
                iconOnly
                aria-label="Skrbništvo"
                title="Skrbništvo"
                onClick={() => navigate('/admin/users')}
              />
            ) : null}
          </>
        }
      />

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42 }}
      >
        <section className="relative mt-6 min-h-[calc(100lvh-(74px+env(safe-area-inset-top)+1.5rem))]">
          {listLoading || itemsLoading ? (
            <Loader placement="overlay" label="Nalagam seznam..." />
          ) : null}
          {listError ? <p className="m-0 text-sm text-rose-300">{listError}</p> : null}
          {!listLoading && !itemsLoading && !listError ? (
            <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
              {groupedActiveItems.map((group) => (
                <li key={group.category} className="list-none">
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {group.items.map((item) => (
                      <li key={item.id} className="list-none">
                        <ListItemCard
                          item={item}
                          updating={Boolean(updatingItemId)}
                          supportsHoverPointer={supportsHoverPointer}
                          quantityControlsVisible={isQuantityControlsVisible(item.id)}
                          quantityControlsTransition={quantityControlsTransition}
                          formatTitle={formatItemTitle}
                          onHoverStart={setHoveredQuantityItemId}
                          onHoverEnd={(itemId) =>
                            setHoveredQuantityItemId((current) =>
                              current === itemId ? null : current,
                            )
                          }
                          onQuantityLabelClick={handleQuantityLabelClick}
                          onCompletionToggle={handleCompletionToggle}
                          onOpenDetails={openItemDetails}
                          onDecreaseQuantity={decreaseItemQuantity}
                          onIncreaseQuantity={increaseItemQuantity}
                        />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
              {completedVisibleItems.map((item) => (
                <li key={`completed-${item.id}`} className="list-none">
                  <ListItemCard
                    item={item}
                    updating={Boolean(updatingItemId)}
                    sparkleOnMount={recentlyCompletedItemId === item.id}
                    supportsHoverPointer={supportsHoverPointer}
                    quantityControlsVisible={isQuantityControlsVisible(item.id)}
                    quantityControlsTransition={quantityControlsTransition}
                    formatTitle={formatItemTitle}
                    onHoverStart={setHoveredQuantityItemId}
                    onHoverEnd={(itemId) =>
                      setHoveredQuantityItemId((current) => (current === itemId ? null : current))
                    }
                    onQuantityLabelClick={handleQuantityLabelClick}
                    onCompletionToggle={handleCompletionToggle}
                    onOpenDetails={openItemDetails}
                    onDecreaseQuantity={decreaseItemQuantity}
                    onIncreaseQuantity={increaseItemQuantity}
                  />
                </li>
              ))}
              {!groupedActiveItems.length && !completedVisibleItems.length ? (
                <li className="rounded-2xl border border-dashed border-white/18 bg-slate-900/20 p-4 text-sm text-slate-300">
                  Še ni izdelkov. Za dodajanje prvega uporabi gumb + spodaj desno.
                </li>
              ) : null}
            </ul>
          ) : null}
          {updatingItemError ? (
            <p className="m-0 mt-3 text-xs text-rose-200">{updatingItemError}</p>
          ) : null}
        </section>
      </motion.div>
      <div className="fixed right-8 bottom-8 z-40">
        <Button
          type="button"
          icon={<Plus animateOnHover />}
          iconOnly
          size="lg"
          aria-label="Dodaj izdelek"
          title="Dodaj izdelek"
          className="shadow-[0_12px_35px_rgba(99,102,241,0.4)]"
          onClick={() => {
            setAddDialogOpen(true);
            setAddItemError('');
          }}
        />
      </div>

      <Dialog
        open={addDialogOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            resetDialogState();
          }
        }}
        size="md"
        fullHeight
        title="Dodaj izdelek"
        footer={
          showCreateItemStep ? (
            <>
              <Button type="submit" form="create-item-form" disabled={addItemLoading}>
                {addItemLoading ? 'Dodajam...' : 'Dodaj izdelek'}
              </Button>
              <Button
                type="button"
                color="white"
                appearance="outline"
                onClick={() => {
                  setShowCreateItemStep(false);
                  setFindImageLoading(false);
                  setFindImageError('');
                  setImageSearchQuery('');
                  setImageCandidates([]);
                  setSelectingImageCandidateUrl('');
                  setNewItemImageUrl('');
                  setNewItemImagePreviewUrl('');
                  setNewItemSourceUrl('');
                  setAddItemError('');
                }}
                disabled={addItemLoading}
              >
                Nazaj na iskanje
              </Button>
            </>
          ) : (
            <Button
              type="button"
              stretch
              appearance="outline"
              color="white"
              onClick={() => openCreateItemStep(searchValue.trim())}
              disabled={addItemLoading}
            >
              DODAJ NOV IZDELEK
            </Button>
          )
        }
      >
        <div className="h-full overflow-hidden">
          <AnimatePresence initial={false} mode="wait">
            {!showCreateItemStep ? (
              <motion.div
                key="search-step"
                initial={{ x: 26, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -26, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex h-full flex-col gap-3"
              >
                <Input
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  onKeyDown={handleSearchEnter}
                  placeholder="Išči izdelek..."
                  autoFocus
                />
                {searchError ? <p className="m-0 text-xs text-rose-200">{searchError}</p> : null}
                <div className="grid content-start flex-1 gap-2 overflow-y-auto pr-1">
                  {searchResults.map((item) => (
                    <div
                      key={item.id}
                      className="flex w-full items-center gap-2 rounded-2xl border border-white/16 bg-slate-900/30 p-2 text-slate-100 transition hover:border-cyan-300/45"
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left text-slate-100"
                        onClick={() => void addExistingItem(item.title)}
                        disabled={addItemLoading}
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center">
                          <ItemCategoryIcon category={item.category} size={22} />
                        </div>
                        <span className="text-sm line-clamp-2">{formatItemTitle(item.title)}</span>
                      </button>
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center">
                        <Button
                          type="button"
                          color="white"
                          appearance="transparent"
                          size="sm"
                          iconOnly
                          icon={<Edit animateOnHover />}
                          aria-label={`Uredi ${formatItemTitle(item.title)}`}
                          disabled={addItemLoading}
                          onClick={() => openCreateItemEditStep(item)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {addItemError ? <p className="m-0 text-xs text-rose-200">{addItemError}</p> : null}
              </motion.div>
            ) : (
              <motion.form
                key="create-step"
                id="create-item-form"
                initial={{ x: 26, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -26, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="grid gap-3"
                onSubmit={handleCreateItem}
              >
                <SharedItemFormFields
                  name={newItemName}
                  onNameChange={setNewItemName}
                  quantity={newItemQuantity}
                  onQuantityChange={setNewItemQuantity}
                  unit={newItemUnit}
                  onUnitChange={setNewItemUnit}
                  note={newItemNote}
                  onNoteChange={setNewItemNote}
                  notePlaceholder="Opcijska opomba"
                  noteRows={2}
                  category={newItemCategory}
                  onCategoryChange={(value) => {
                    categoryManualRef.current = true;
                    setNewItemCategory(value);
                  }}
                  categoryLoading={newItemCategoryLoading}
                  imageSearchQuery={imageSearchQuery}
                  onImageSearchQueryChange={setImageSearchQuery}
                  onFindImage={findImage}
                  imageCandidates={imageCandidates}
                  onSelectImageCandidate={selectImageCandidate}
                  selectingImageCandidateUrl={selectingImageCandidateUrl}
                  findImageLoading={findImageLoading}
                  imageUrl={newItemImageUrl}
                  imagePreviewUrl={newItemImagePreviewUrl}
                  sourceUrl={newItemSourceUrl}
                  findImageError={findImageError}
                  onUploadImageFile={uploadNewItemImage}
                  onPasteImageFromClipboard={pasteNewItemImageFromClipboard}
                />

                {addItemError ? <p className="m-0 text-xs text-rose-200">{addItemError}</p> : null}
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </Dialog>

      <Dialog
        open={detailsListItemId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetailsListItemId(null);
          }
        }}
        size="md"
        title={
          detailsItem ? (
            <span className="flex items-center gap-2">
              <ItemCategoryIcon category={detailsEditCategory} size={36} />
              <span className="break-words">{formatItemTitle(detailsItem.title)}</span>
            </span>
          ) : (
            <span className="break-words">Podrobnosti</span>
          )
        }
        footer={
          detailsItem ? (
            <>
              <Button
                type="submit"
                form="details-edit-form"
                icon={<CheckCheck animateOnHover />}
                disabled={updatingItemId === detailsItem.id}
              >
                {updatingItemId === detailsItem.id ? 'Shranjujem...' : 'Shrani'}
              </Button>
              <Button
                type="button"
                color="white"
                appearance="outline"
                disabled={updatingItemId === detailsItem.id}
                onClick={cancelDetailsEdit}
              >
                Prekliči
              </Button>
            </>
          ) : null
        }
      >
        {detailsItem ? (
          <form id="details-edit-form" className="grid gap-3" onSubmit={saveDetailsEdit}>
            <p className="m-0 text-xs text-slate-400">
              Stanje:{' '}
              <span className="text-slate-200">
                {detailsItem.status === 'completed' ? 'Kupljeno' : 'Aktivno'}
              </span>
            </p>
            <SharedItemFormFields
              name={detailsEditName}
              onNameChange={handleDetailsEditNameChange}
              onNameBlur={handleDetailsEditNameBlur}
              quantity={detailsEditQuantity}
              onQuantityChange={setDetailsEditQuantity}
              unit={detailsEditUnit}
              onUnitChange={setDetailsEditUnit}
              note={detailsEditNote}
              onNoteChange={setDetailsEditNote}
              notePlaceholder="Opcijska opomba"
              noteRows={3}
              category={detailsEditCategory}
              onCategoryChange={setDetailsEditCategory}
              categoryLoading={detailsCategoryLoading}
              imageSearchQuery={detailsImageSearchQuery}
              onImageSearchQueryChange={setDetailsImageSearchQuery}
              onFindImage={findDetailsImage}
              imageCandidates={detailsImageCandidates}
              onSelectImageCandidate={selectDetailsImageCandidate}
              selectingImageCandidateUrl={detailsSelectingImageCandidateUrl}
              findImageLoading={detailsFindImageLoading}
              imageUrl={detailsEditImageUrl}
              imagePreviewUrl={detailsEditImagePreviewUrl}
              sourceUrl={detailsEditSourceUrl}
              findImageError={detailsFindImageError}
              onRemoveImage={removeDetailsEditImage}
              onUploadImageFile={uploadDetailsItemImage}
              onPasteImageFromClipboard={pasteDetailsImageFromClipboard}
              disabled={updatingItemId === detailsItem.id}
              quantityButtonSize="md"
            />
            {updatingItemError ? (
              <p className="m-0 text-xs text-rose-200">{updatingItemError}</p>
            ) : null}
          </form>
        ) : null}
      </Dialog>
    </>
  );
}
