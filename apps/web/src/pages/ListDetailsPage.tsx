import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cx } from "class-variance-authority";
import { useNavigate, useParams } from "react-router-dom";

import { AppHeader } from "../components/AppHeader";
import { CompletionCircleToggle } from "../components/CompletionCircleToggle";
import { ItemCategoryIcon, itemCategoryLabels } from "../components/ItemCategoryIcon";
import { ArrowLeft, Minus, Plus, Search, SettingsCog } from "../components/lordicon/icons";
import { Button, Dialog, H1, Input, Select, Textarea } from "../components/ui";
import type { AuthUser } from "../types/auth";
import type { ItemCategory } from "../domain/item-category";
import { inferCategoryFromTitle, itemCategoryValues } from "../domain/item-category";
import { toListSlug } from "../domain/list-slug";
import { CatalogItem, itemUnitValues, ShoppingItemUnit, ShoppingList, ShoppingListItem } from "../types/lists";

type ListDetailsPageProps = {
  token: string;
  authUser: AuthUser;
  onLogout: () => Promise<void>;
};

const quantityStep = 1;

function formatItemTitle(title: string): string {
  const normalized = title.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }
  return normalized.charAt(0).toLocaleUpperCase() + normalized.slice(1);
}

function isVisibleListItemStatus(status: ShoppingListItem["status"]): boolean {
  return status === "active" || status === "completed";
}

function sortShoppingItemsNewestFirst(a: ShoppingListItem, b: ShoppingListItem): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

type ItemQuantityUnitControlsProps = {
  quantity: number;
  onQuantityChange: (value: number) => void;
  unit: ShoppingItemUnit;
  onUnitChange: (value: ShoppingItemUnit) => void;
  disabled?: boolean;
  buttonSize?: "sm" | "md" | "lg";
};

function ItemQuantityUnitControls({
  quantity,
  onQuantityChange,
  unit,
  onUnitChange,
  disabled = false,
  buttonSize
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
        aria-label="Decrease quantity"
        disabled={disabled}
        onClick={() => onQuantityChange(Math.max(1, Number((quantity - quantityStep).toFixed(2))))}
      />
      <Input
        type="text"
        className="w-12"
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
        aria-label="Increase quantity"
        disabled={disabled}
        onClick={() => onQuantityChange(Number((quantity + quantityStep).toFixed(2)))}
      />
      <Select value={unit} onChange={(event) => onUnitChange(event.target.value as ShoppingItemUnit)}>
        {itemUnitValues.map((itemUnit) => (
          <option key={itemUnit} value={itemUnit}>
            {itemUnit}
          </option>
        ))}
      </Select>
    </div>
  );
}

type SharedItemFormFieldsProps = {
  name: string;
  onNameChange: (value: string) => void;
  quantity: number;
  onQuantityChange: (value: number) => void;
  quantityButtonSize?: "sm" | "md" | "lg";
  unit: ShoppingItemUnit;
  onUnitChange: (value: ShoppingItemUnit) => void;
  note: string;
  onNoteChange: (value: string) => void;
  notePlaceholder: string;
  noteRows: 2 | 3;
  category: ItemCategory;
  onCategoryChange: (value: ItemCategory) => void;
  imageSearchQuery: string;
  onImageSearchQueryChange: (value: string) => void;
  onFindImage: () => void;
  findImageLoading: boolean;
  imageUrl: string;
  sourceUrl: string;
  findImageError: string;
  disabled?: boolean;
};

function SharedItemFormFields({
  name,
  onNameChange,
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
  imageSearchQuery,
  onImageSearchQueryChange,
  onFindImage,
  findImageLoading,
  imageUrl,
  sourceUrl,
  findImageError,
  disabled = false
}: SharedItemFormFieldsProps) {
  return (
    <>
    <div className="flex no-wrap gap-2">
      <Input
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        placeholder="Item name"
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
      <Select value={category} onChange={(event) => onCategoryChange(event.target.value as ItemCategory)}>
        {itemCategoryValues.map((itemCategory) => (
          <option key={itemCategory} value={itemCategory}>
            {itemCategoryLabels[itemCategory]}
          </option>
        ))}
      </Select>
      <Textarea
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
        placeholder={notePlaceholder}
        maxLength={500}
        resize="none"
        rows={noteRows}
      />
      <div className="grid gap-3 rounded-2xl">
        <div className="flex items-center gap-2">
          <Input
            value={imageSearchQuery}
            onChange={(event) => onImageSearchQueryChange(event.target.value)}
            placeholder="Image search (optional) — e.g. bela sirova štručka"
            maxLength={200}
            aria-label="Image search phrase"
          />
          <Button
            type="button"
            appearance="outline"
            color="white"
            iconOnly
            icon={<Search animateOnHover />}
            aria-label={findImageLoading ? "Finding image" : "Find image"}
            disabled={findImageLoading || disabled}
            onClick={() => void onFindImage()}
          />
        </div>
        {imageUrl ? (
          <div
            className={cx(
              "aspect-square w-full overflow-hidden rounded-xl bg-slate-900/50",
              findImageLoading && "opacity-60"
            )}
          >
            <img src={imageUrl} alt={name || "Preview"} className="block h-full w-full object-cover object-center" loading="lazy" />
          </div>
        ) : null}
        {sourceUrl ? (
          <a className="text-xs text-cyan-200/90 underline underline-offset-2" href={sourceUrl} target="_blank" rel="noreferrer">
            Source page
          </a>
        ) : null}
        {findImageError ? <p className="m-0 text-xs text-rose-200">{findImageError}</p> : null}
      </div>
    </>
  );
}

export function ListDetailsPage({ token, authUser, onLogout: _onLogout }: ListDetailsPageProps) {
  const navigate = useNavigate();
  const { listSlug } = useParams();
  const [list, setList] = useState<ShoppingList | null>(null);
  const [resolvedListId, setResolvedListId] = useState<number | null>(null);
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [itemsLoading, setItemsLoading] = useState(false);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchResults, setSearchResults] = useState<CatalogItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [showCreateItemStep, setShowCreateItemStep] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState(1);
  const [newItemUnit, setNewItemUnit] = useState<ShoppingItemUnit>("pcs");
  const [newItemNote, setNewItemNote] = useState("");
  const [newItemCategory, setNewItemCategory] = useState<ItemCategory>("other");
  const [newItemImageUrl, setNewItemImageUrl] = useState("");
  const [newItemSourceUrl, setNewItemSourceUrl] = useState("");
  const [imageSearchQuery, setImageSearchQuery] = useState("");
  const [findImageLoading, setFindImageLoading] = useState(false);
  const [findImageError, setFindImageError] = useState("");

  const [addItemLoading, setAddItemLoading] = useState(false);
  const [addItemError, setAddItemError] = useState("");
  const [updatingItemId, setUpdatingItemId] = useState<number | null>(null);
  const [updatingItemError, setUpdatingItemError] = useState("");
  const [detailsListItemId, setDetailsListItemId] = useState<number | null>(null);
  const [detailsEditMode, setDetailsEditMode] = useState(false);
  const [detailsEditQuantity, setDetailsEditQuantity] = useState(1);
  const [detailsEditUnit, setDetailsEditUnit] = useState<ShoppingItemUnit>("pcs");
  const [detailsEditNote, setDetailsEditNote] = useState("");
  const [detailsEditName, setDetailsEditName] = useState("");
  const [detailsEditCategory, setDetailsEditCategory] = useState<ItemCategory>("other");
  const [detailsEditImageUrl, setDetailsEditImageUrl] = useState("");
  const [detailsEditSourceUrl, setDetailsEditSourceUrl] = useState("");
  const [detailsImageSearchQuery, setDetailsImageSearchQuery] = useState("");
  const [detailsFindImageLoading, setDetailsFindImageLoading] = useState(false);
  const [detailsFindImageError, setDetailsFindImageError] = useState("");
  const searchRequestIdRef = useRef(0);
  const categoryManualRef = useRef(false);

  const detailsItem = useMemo(
    () => (detailsListItemId === null ? null : (items.find((row) => row.id === detailsListItemId) ?? null)),
    [detailsListItemId, items]
  );

  useEffect(() => {
    setDetailsEditMode(false);
  }, [detailsListItemId]);

  const orderedVisibleItems = useMemo(() => {
    const visible = items.filter((row) => isVisibleListItemStatus(row.status));
    const activeRows = visible.filter((row) => row.status === "active").sort(sortShoppingItemsNewestFirst);
    const completedRows = visible.filter((row) => row.status === "completed").sort(sortShoppingItemsNewestFirst);
    return [...activeRows, ...completedRows];
  }, [items]);

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`
    }),
    [token]
  );

  useEffect(() => {
    if (!listSlug?.trim()) {
      setListError("Invalid list URL.");
      setResolvedListId(null);
      setList(null);
      return;
    }
    const currentListSlug = listSlug.trim();

    async function resolveListFromSlug() {
      setListLoading(true);
      setListError("");
      try {
        const response = await fetch("/api/lists", { headers: authHeaders });
        if (!response.ok) {
          throw new Error(`Lists API failed with status ${response.status}`);
        }
        const payload = (await response.json()) as { lists: ShoppingList[] };
        const matched = payload.lists.find((row) => toListSlug(row.name) === currentListSlug) ?? null;
        if (!matched) {
          setList(null);
          setResolvedListId(null);
          setListError("List not found.");
          return;
        }
        setList(matched);
        setResolvedListId(matched.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        setListError(message);
        setResolvedListId(null);
      } finally {
        setListLoading(false);
      }
    }

    void resolveListFromSlug();
  }, [authHeaders, listSlug]);

  useEffect(() => {
    if (!resolvedListId) {
      setItems([]);
      return;
    }

    async function loadItems() {
      setItemsLoading(true);
      setUpdatingItemError("");
      try {
        const itemsResponse = await fetch(`/api/lists/${resolvedListId}/items?status=all`, { headers: authHeaders });

        if (!itemsResponse.ok) {
          throw new Error(`Items API failed with status ${itemsResponse.status}`);
        }

        const itemsPayload = (await itemsResponse.json()) as { items: ShoppingListItem[] };
        setItems(itemsPayload.items.filter((row) => isVisibleListItemStatus(row.status)));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        setUpdatingItemError(message);
      } finally {
        setItemsLoading(false);
      }
    }

    void loadItems();
  }, [authHeaders, resolvedListId]);

  useEffect(() => {
    if (!showCreateItemStep || categoryManualRef.current) {
      return;
    }
    setNewItemCategory(inferCategoryFromTitle(newItemName));
  }, [newItemName, showCreateItemStep]);

  useEffect(() => {
    if (!addDialogOpen || showCreateItemStep) {
      return;
    }

    const normalizedQuery = searchValue.trim();
    if (normalizedQuery.length < 1) {
      setSearchResults([]);
      setSearchError("");
      setSearchLoading(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      async function runSearch() {
        const requestId = searchRequestIdRef.current + 1;
        searchRequestIdRef.current = requestId;
        setSearchLoading(true);
        setSearchError("");
        try {
          const response = await fetch(`/api/items/suggest?q=${encodeURIComponent(normalizedQuery)}&limit=16`, {
            headers: authHeaders
          });
          if (!response.ok) {
            throw new Error(`Search failed with status ${response.status}`);
          }

          const payload = (await response.json()) as { items: CatalogItem[] };
          if (searchRequestIdRef.current === requestId) {
            setSearchResults(payload.items);
          }
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }
          const message = error instanceof Error ? error.message : "Unknown error";
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
    setSearchValue("");
    setSearchResults([]);
    setSearchError("");
    setSearchLoading(false);
    setShowCreateItemStep(false);
    setNewItemName("");
    setNewItemQuantity(1);
    setNewItemUnit("pcs");
    setNewItemNote("");
    setNewItemCategory("other");
    categoryManualRef.current = false;
    setNewItemImageUrl("");
    setNewItemSourceUrl("");
    setImageSearchQuery("");
    setFindImageError("");
    setFindImageLoading(false);
    setAddItemError("");
    setAddItemLoading(false);
  }

  function openCreateItemStep(prefillName?: string) {
    categoryManualRef.current = false;
    setShowCreateItemStep(true);
    setAddItemError("");
    setFindImageError("");
    setFindImageLoading(false);
    setImageSearchQuery("");
    setNewItemImageUrl("");
    setNewItemSourceUrl("");
    setNewItemName(prefillName?.trim() || searchValue.trim());
  }

  async function addExistingItem(itemTitle: string) {
    if (!resolvedListId) {
      setAddItemError("List is not loaded yet.");
      return;
    }
    setAddItemLoading(true);
    setAddItemError("");
    try {
      const response = await fetch(`/api/lists/${resolvedListId}/items`, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: formatItemTitle(itemTitle),
          quantity: 1,
          unit: "pcs"
        })
      });

      const payload = (await response.json()) as { listItem?: ShoppingListItem; error?: string };
      if (!response.ok || !payload.listItem) {
        throw new Error(payload.error ?? `Adding item failed with status ${response.status}`);
      }

      setItems((currentItems) => {
        const withoutExisting = currentItems.filter((currentItem) => currentItem.id !== payload.listItem?.id);
        if (!isVisibleListItemStatus((payload.listItem as ShoppingListItem).status)) {
          return withoutExisting;
        }
        return [payload.listItem as ShoppingListItem, ...withoutExisting];
      });
      resetDialogState();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setAddItemError(message);
    } finally {
      setAddItemLoading(false);
    }
  }

  async function handleCreateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resolvedListId) {
      setAddItemError("List is not loaded yet.");
      return;
    }
    if (!newItemName.trim()) {
      setAddItemError("Item name is required.");
      return;
    }

    setAddItemLoading(true);
    setAddItemError("");
    try {
      const response = await fetch(`/api/lists/${resolvedListId}/items`, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: formatItemTitle(newItemName),
          quantity: newItemQuantity,
          unit: newItemUnit,
          note: newItemNote.trim() ? newItemNote.trim() : undefined,
          category: newItemCategory,
          imageUrl: newItemImageUrl.trim() ? newItemImageUrl.trim() : undefined,
          sourceUrl: newItemSourceUrl.trim() ? newItemSourceUrl.trim() : undefined
        })
      });

      const payload = (await response.json()) as { listItem?: ShoppingListItem; error?: string };
      if (!response.ok || !payload.listItem) {
        throw new Error(payload.error ?? `Adding item failed with status ${response.status}`);
      }

      setItems((currentItems) => {
        const withoutExisting = currentItems.filter((currentItem) => currentItem.id !== payload.listItem?.id);
        if (!isVisibleListItemStatus((payload.listItem as ShoppingListItem).status)) {
          return withoutExisting;
        }
        return [payload.listItem as ShoppingListItem, ...withoutExisting];
      });
      resetDialogState();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setAddItemError(message);
    } finally {
      setAddItemLoading(false);
    }
  }

  async function findImageWithQuery(
    searchTarget: string,
    setLoading: (value: boolean) => void,
    setError: (value: string) => void,
    setImageUrl: (value: string) => void,
    setSourceUrl: (value: string) => void
  ) {
    if (!searchTarget) {
      setError("Enter item name or an image search phrase.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/items/find-image?q=${encodeURIComponent(searchTarget)}`, {
        headers: authHeaders
      });

      const payload = (await response.json()) as {
        found?: boolean;
        imageUrl?: string;
        sourceUrl?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? `Image lookup failed with status ${response.status}`);
      }
      if (!payload.found || !payload.imageUrl) {
        throw new Error(payload.error ?? "No image found for this item yet.");
      }

      setImageUrl(payload.imageUrl);
      setSourceUrl(payload.sourceUrl ?? "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function findImage() {
    const searchTarget = imageSearchQuery.trim() || newItemName.trim() || searchValue.trim();
    await findImageWithQuery(searchTarget, setFindImageLoading, setFindImageError, setNewItemImageUrl, setNewItemSourceUrl);
  }

  async function findDetailsImage() {
    const searchTarget = detailsImageSearchQuery.trim() || detailsEditName.trim();
    await findImageWithQuery(
      searchTarget,
      setDetailsFindImageLoading,
      setDetailsFindImageError,
      setDetailsEditImageUrl,
      setDetailsEditSourceUrl
    );
  }

  function handleSearchEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    if (!searchLoading && !searchResults.length && searchValue.trim()) {
      openCreateItemStep(searchValue.trim());
    }
  }

  async function patchListItem(
    listItemId: number,
    payload: Partial<Pick<ShoppingListItem, "title" | "quantity" | "unit" | "note" | "status" | "category">> & {
      imageUrl?: string;
      sourceUrl?: string;
    }
  ): Promise<boolean> {
    if (!resolvedListId) {
      setUpdatingItemError("List is not loaded yet.");
      return false;
    }
    setUpdatingItemId(listItemId);
    setUpdatingItemError("");
    try {
      const response = await fetch(`/api/lists/${resolvedListId}/items/${listItemId}`, {
        method: "PATCH",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const responsePayload = (await response.json()) as { listItem?: ShoppingListItem; error?: string };
      if (!response.ok || !responsePayload.listItem) {
        throw new Error(responsePayload.error ?? `Item update failed with status ${response.status}`);
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
      setUpdatingItemError("");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setUpdatingItemError(message);
      return false;
    } finally {
      setUpdatingItemId(null);
    }
  }

  function openItemDetails(item: ShoppingListItem) {
    setDetailsListItemId(item.id);
  }

  function beginDetailsEdit() {
    if (!detailsItem) {
      return;
    }
    setDetailsEditQuantity(detailsItem.quantity);
    setDetailsEditUnit(detailsItem.unit);
    setDetailsEditNote(detailsItem.note ?? "");
    setDetailsEditName(formatItemTitle(detailsItem.title));
    setDetailsEditCategory(detailsItem.category);
    setDetailsEditImageUrl(detailsItem.imageUrl ?? "");
    setDetailsEditSourceUrl("");
    setDetailsImageSearchQuery("");
    setDetailsFindImageError("");
    setDetailsFindImageLoading(false);
    setDetailsEditMode(true);
    setUpdatingItemError("");
  }

  async function saveDetailsEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detailsItem) {
      return;
    }
    if (!detailsEditName.trim()) {
      setUpdatingItemError("Item name is required.");
      return;
    }
    const ok = await patchListItem(detailsItem.id, {
      title: formatItemTitle(detailsEditName),
      quantity: detailsEditQuantity,
      unit: detailsEditUnit,
      note: detailsEditNote.trim(),
      category: detailsEditCategory,
      imageUrl: detailsEditImageUrl.trim() ? detailsEditImageUrl.trim() : undefined,
      sourceUrl: detailsEditSourceUrl.trim() ? detailsEditSourceUrl.trim() : undefined
    });
    if (ok) {
      setDetailsEditMode(false);
    }
  }

  function cancelDetailsEdit() {
    if (!detailsItem) {
      setDetailsEditMode(false);
      return;
    }
    setDetailsEditQuantity(detailsItem.quantity);
    setDetailsEditUnit(detailsItem.unit);
    setDetailsEditNote(detailsItem.note ?? "");
    setDetailsEditName(formatItemTitle(detailsItem.title));
    setDetailsEditCategory(detailsItem.category);
    setDetailsEditImageUrl(detailsItem.imageUrl ?? "");
    setDetailsEditSourceUrl("");
    setDetailsImageSearchQuery("");
    setDetailsFindImageError("");
    setDetailsFindImageLoading(false);
    setDetailsEditMode(false);
  }

  return (
    <>
      <AppHeader
        actions={
          <>
            <Button
              type="button"
              icon={<Plus animateOnHover />}
              onClick={() => {
                setAddDialogOpen(true);
                setAddItemError("");
              }}
            >
              Item
            </Button>
            <Button
              color="white"
              appearance="outline"
              type="button"
              icon={<ArrowLeft animateOnHover />}
              iconOnly
              aria-label="Back"
              title="Back"
              onClick={() => navigate("/")}
            />
            {authUser.isAdmin ? (
              <Button
                color="white"
                appearance="outline"
                type="button"
                icon={<SettingsCog animation="default" />}
                iconOnly
                aria-label="Admin"
                title="Admin"
                onClick={() => navigate("/admin/users")}
              />
            ) : null}
          </>
        }
      />

      <section className="mt-6">
        <H1 color="gradient" className="text-3xl md:text-4xl">
          {list ? list.name : "List"}
        </H1>
        <p className="mt-1 text-slate-200/90">Add items quickly and keep the shopping trip organized.</p>
      </section>

      <section className="mt-5">
        {listLoading || itemsLoading ? <p className="text-slate-300">Loading list...</p> : null}
        {listError ? <p className="m-0 text-sm text-rose-300">{listError}</p> : null}
        {!listLoading && !itemsLoading && !listError ? (
          <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
            {orderedVisibleItems.map((item) => (
              <li
                key={item.id}
                className={cx(
                  "flex items-center gap-4 rounded-2xl border border-white/14 bg-slate-900/25 py-2.5 px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_18px_rgba(2,8,23,0.35)] transition-opacity",
                  item.status === "completed" && "opacity-40 hover:opacity-100"
                )}
              >
                <CompletionCircleToggle
                  size="sm"
                  completed={item.status === "completed"}
                  disabled={Boolean(updatingItemId)}
                  onToggle={() =>
                    void patchListItem(item.id, {
                      status: item.status === "completed" ? "active" : "completed"
                    })
                  }
                />
                <ItemCategoryIcon category={item.category} size={36} />
                <div className="block min-w-0 flex-1">
                  <p className="m-0 truncate text-sm font-semibold text-slate-50">
                    {formatItemTitle(item.title)}
                    {item.status === "completed" ? (
                      <span className="ml-2 text-[11px] uppercase tracking-wide text-slate-400">· Končano</span>
                    ) : null}
                  </p>
                  {item.note ? <p className="m-0 mt-0.5 line-clamp-1 text-xs text-slate-200/90">{item.note}</p> : null}
                </div>
                <div className="flex min-w-0 flex-col justify-center">
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex items-center justify-center gap-1">
                      <Button
                        type="button"
                        color="white"
                        appearance="transparent"
                        size="sm"
                        className="h-8 w-8"
                        iconOnly
                        icon={<Minus animateOnHover />}
                        aria-label={`Decrease quantity for ${formatItemTitle(item.title)}`}
                        disabled={Boolean(updatingItemId)}
                        onClick={() =>
                          void patchListItem(item.id, { quantity: Math.max(1, Number((item.quantity - quantityStep).toFixed(2))) })
                        }
                      />
                      <span className="inline-flex min-w-[4.5rem] items-center justify-center whitespace-nowrap text-center text-xs text-slate-100">
                        {item.quantity} {item.unit}
                      </span>
                      <Button
                        type="button"
                        color="white"
                        appearance="transparent"
                        size="sm"
                        className="h-8 w-8"
                        iconOnly
                        icon={<Plus animateOnHover />}
                        aria-label={`Increase quantity for ${formatItemTitle(item.title)}`}
                        disabled={Boolean(updatingItemId)}
                        onClick={() => void patchListItem(item.id, { quantity: Number((item.quantity + quantityStep).toFixed(2)) })}
                      />
                      <span className="mx-3 h-4 w-px bg-white/20" aria-hidden />
                      <Button
                        type="button"
                        color="white"
                        appearance="transparent"
                        size="sm"
                        className="h-8 w-8"
                        iconOnly
                        icon={<Search animateOnHover />}
                        aria-label={`Podrobnosti: ${formatItemTitle(item.title)}`}
                        onClick={() => openItemDetails(item)}
                      />
                    </div>
                  </div>
                </div>
              </li>
            ))}
            {!orderedVisibleItems.length ? (
              <li className="rounded-2xl border border-dashed border-white/18 bg-slate-900/20 p-4 text-sm text-slate-300">
                No items yet. Tap + Item to add your first product.
              </li>
            ) : null}
          </ul>
        ) : null}
        {updatingItemError ? <p className="m-0 mt-3 text-xs text-rose-200">{updatingItemError}</p> : null}
      </section>

      <Dialog
        open={addDialogOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            resetDialogState();
          }
        }}
        size="md"
        title="Add item"
      >
        <div className="overflow-hidden">
          <AnimatePresence initial={false} mode="wait">
            {!showCreateItemStep ? (
              <motion.div
                key="search-step"
                initial={{ x: 26, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -26, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                <Input
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  onKeyDown={handleSearchEnter}
                  placeholder="Search item..."
                  autoFocus
                />
                {searchLoading ? <p className="m-0 text-xs text-slate-300">Searching...</p> : null}
                {searchError ? <p className="m-0 text-xs text-rose-200">{searchError}</p> : null}
                <div className="grid max-h-[300px] gap-2 overflow-y-auto pr-1">
                  {searchResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-2xl border border-white/16 bg-slate-900/30 p-2 text-left text-slate-100 transition hover:border-cyan-300/45"
                      onClick={() => void addExistingItem(item.title)}
                      disabled={addItemLoading}
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center">
                        <ItemCategoryIcon category={item.category} size={22} />
                      </div>
                      <span className="truncate text-sm">{formatItemTitle(item.title)}</span>
                    </button>
                  ))}
                </div>
                {!searchLoading && searchValue.trim() && !searchResults.length ? (
                  <Button
                    type="button"
                    stretch
                    appearance="outline"
                    color="white"
                    onClick={() => openCreateItemStep(searchValue.trim())}
                    disabled={addItemLoading}
                  >
                    ADD NEW ITEM
                  </Button>
                ) : null}
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
                  notePlaceholder="Optional note"
                  noteRows={2}
                  category={newItemCategory}
                  onCategoryChange={(value) => {
                    categoryManualRef.current = true;
                    setNewItemCategory(value);
                  }}
                  imageSearchQuery={imageSearchQuery}
                  onImageSearchQueryChange={setImageSearchQuery}
                  onFindImage={findImage}
                  findImageLoading={findImageLoading}
                  imageUrl={newItemImageUrl}
                  sourceUrl={newItemSourceUrl}
                  findImageError={findImageError}
                />

                {addItemError ? <p className="m-0 text-xs text-rose-200">{addItemError}</p> : null}

                <div className="mt-1 flex flex-wrap gap-2">
                  <Button type="submit" disabled={addItemLoading}>
                    {addItemLoading ? "Adding..." : "Add item"}
                  </Button>
                  <Button
                    type="button"
                    color="white"
                    appearance="outline"
                    onClick={() => {
                      setShowCreateItemStep(false);
                      setFindImageLoading(false);
                      setFindImageError("");
                      setImageSearchQuery("");
                      setNewItemImageUrl("");
                      setNewItemSourceUrl("");
                      setAddItemError("");
                    }}
                    disabled={addItemLoading}
                  >
                    Back to search
                  </Button>
                </div>
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
            setDetailsEditMode(false);
          }
        }}
        size="md"
        title={
          detailsItem && detailsEditMode ? (
            <span className="break-words">Uredi: {formatItemTitle(detailsItem.title)}</span>
          ) : detailsItem ? (
            <span className="flex items-center gap-2.5 break-words text-2xl font-semibold">
              <ItemCategoryIcon category={detailsItem.category} size={36} />
              <span>{formatItemTitle(detailsItem.title)}</span>
            </span>
          ) : (
            <span className="break-words">Podrobnosti</span>
          )
        }
      >
        {detailsItem ? (
          detailsEditMode ? (
            <form className="grid gap-3" onSubmit={saveDetailsEdit}>
              <p className="m-0 text-xs text-slate-400">
                Stanje:{" "}
                <span className="text-slate-200">{detailsItem.status === "completed" ? "Končano" : "Aktivno"}</span>
              </p>
              <SharedItemFormFields
                name={detailsEditName}
                onNameChange={setDetailsEditName}
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
                imageSearchQuery={detailsImageSearchQuery}
                onImageSearchQueryChange={setDetailsImageSearchQuery}
                onFindImage={findDetailsImage}
                findImageLoading={detailsFindImageLoading}
                imageUrl={detailsEditImageUrl}
                sourceUrl={detailsEditSourceUrl}
                findImageError={detailsFindImageError}
                disabled={updatingItemId === detailsItem.id}
                quantityButtonSize="md"
              />
              {updatingItemError ? <p className="m-0 text-xs text-rose-200">{updatingItemError}</p> : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="submit" disabled={updatingItemId === detailsItem.id}>
                  {updatingItemId === detailsItem.id ? "Shranjujem..." : "Shrani"}
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
              </div>
            </form>
          ) : (
            <div className="grid gap-3">
              <p className="m-0 text-xs text-slate-300">
                Kategorija: <span className="text-slate-100">{itemCategoryLabels[detailsItem.category]}</span>
              </p>
              <p className="m-0 text-xs text-slate-300">
                Količina:{" "}
                <span className="text-slate-100">
                  {detailsItem.quantity} {detailsItem.unit}
                </span>
              </p>
              {detailsItem.note?.trim() ? (
                <div className="grid gap-1">
                  <span className="text-xs text-slate-300">Opomba</span>
                  <p className="m-0 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-xs text-slate-200/95 whitespace-pre-wrap">
                    {detailsItem.note}
                  </p>
                </div>
              ) : null}
              {updatingItemError ? <p className="m-0 text-xs text-rose-200">{updatingItemError}</p> : null}
              <div className="aspect-square w-full overflow-hidden rounded-xl border border-white/12 bg-slate-900/50">
                {detailsItem.imageUrl ? (
                  <img
                    src={detailsItem.imageUrl}
                    alt={formatItemTitle(detailsItem.title)}
                    className="block h-full w-full object-cover object-center"
                    loading="lazy"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center px-4 text-center text-sm text-slate-400">
                    Ni fotografije — dodaj jo ob ustvarjanju artikla ali z »Find image«.
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" disabled={updatingItemId === detailsItem.id} onClick={beginDetailsEdit}>
                  Uredi
                </Button>
              </div>
            </div>
          )
        ) : null}
      </Dialog>
    </>
  );
}
