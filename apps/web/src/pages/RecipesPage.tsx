import { cx } from 'class-variance-authority';
import { AnimatePresence, motion } from 'motion/react';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppHeader } from '../components/AppHeader';
import { Minus, Plus, ReadyToEat, Search, Trash2, X } from '../components/lordicon/icons';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/fields/checkbox';
import { Dialog } from '../components/ui/dialog';
import { Input } from '../components/ui/fields/input';
import { Select } from '../components/ui/fields/select';
import type { AuthUser } from '../types/auth';
import type { ShoppingList } from '../types/lists';

const DEFAULT_LIST_ID_KEY = 'shopping-list-default-list-id';

type RecipesPageProps = {
  token: string;
  authUser: AuthUser;
  onLogout: () => Promise<void>;
};

interface RecipeSearchResult {
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
  source: string;
}

interface ParsedRecipe {
  title: string;
  description?: string;
  imageUrl?: string;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  servings?: string;
  ingredients: string[];
  instructions: string[];
  images?: string[];
  url: string;
  source: string;
}

interface SavedRecipe extends ParsedRecipe {
  id: number;
  createdAt: string;
}

interface CheckIngredientResult {
  parsed: { title: string; quantity: number; unit: string };
  match: null | {
    type: 'exact' | 'similar' | 'unit_conflict';
    listItemId: number;
    listItemTitle: string;
    listItemQuantity: number;
    listItemUnit: string;
    suggestion?: string;
  };
}

// ---------- Helpers ----------

function parseBaseServings(servings: string | undefined): number {
  if (!servings) return 4;
  const m = /(\d+(?:[.,]\d+)?)/.exec(servings);
  if (!m) return 4;
  const n = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 4;
}

function scaleIngredientText(ingredient: string, scale: number): string {
  if (scale === 1) return ingredient;
  const m = /^(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)(\s*)/.exec(ingredient.trim());
  if (!m) return ingredient;
  const rawNum = m[1].replace(/\s+/g, '');
  let qty: number;
  if (rawNum.includes('/')) {
    const parts = rawNum.split('/');
    qty = parseFloat(parts[0]) / parseFloat(parts[1]);
  } else {
    qty = parseFloat(rawNum.replace(',', '.'));
  }
  if (!Number.isFinite(qty)) return ingredient;
  const scaled = qty * scale;
  const formatted =
    scaled % 1 === 0
      ? String(Math.round(scaled))
      : (Math.round(scaled * 10) / 10).toString().replace('.', ',');
  return ingredient.replace(m[0], `${formatted}${m[2]}`);
}

// ---------- Components ----------

function SourceBadge({ source }: { source: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium tracking-wide text-slate-400">
      {source}
    </span>
  );
}

function RecipeResultCard({
  result,
  onClick,
}: {
  result: RecipeSearchResult;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full cursor-pointer gap-4 rounded-2xl border border-white/10 bg-white/4 p-4 text-left transition-all duration-200 hover:border-white/20 hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/45"
    >
      {result.imageUrl && (
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10">
          <img
            src={result.imageUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="truncate text-sm font-semibold text-slate-100 group-hover:text-white">
          {result.title}
        </p>
        {result.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-slate-400">
            {result.description}
          </p>
        )}
        <SourceBadge source={result.source} />
      </div>
    </button>
  );
}

function ImageLightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!src) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [src, onClose]);

  return createPortal(
    <AnimatePresence>
      {src && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          onClick={onClose}
        >
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(2,6,23,0.82)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          />
          <Button
            color="white"
            appearance="transparent"
            icon={<X />}
            iconOnly
            size="sm"
            type="button"
            aria-label="Zapri sliko"
            className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-10"
            onClick={onClose}
          />
          <motion.img
            src={src}
            alt=""
            className="relative z-[1] max-h-[88vh] max-w-full rounded-2xl object-contain shadow-2xl"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

// ---------- Add-to-list flow modals ----------

function ChooseListDialog({
  open,
  lists,
  listsLoading,
  initialListId,
  onConfirm,
  onClose,
}: {
  open: boolean;
  lists: ShoppingList[];
  listsLoading: boolean;
  initialListId: number | null;
  onConfirm: (listId: number, remember: boolean) => void;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(initialListId);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedId(initialListId ?? (lists[0]?.id ?? null));
      setRemember(false);
    }
  }, [open, initialListId, lists]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      title="Dodaj v seznam"
      size="sm"
      footer={
        <>
          <Button
            color="gradient"
            appearance="full"
            type="button"
            disabled={!selectedId}
            onClick={() => { if (selectedId) onConfirm(selectedId, remember); }}
          >
            Dodaj
          </Button>
          <Button color="white" appearance="outline" type="button" onClick={onClose}>
            Prekliči
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {listsLoading ? (
          <p className="text-sm text-slate-400">Nalagam sezname…</p>
        ) : lists.length === 0 ? (
          <p className="text-sm text-slate-400">Nimaš nakupovalnih seznamov.</p>
        ) : (
          <label className="grid gap-1.5 text-sm text-slate-200">
            Nakupovalni seznam
            <Select
              value={selectedId ? String(selectedId) : ''}
              onChange={(e) => setSelectedId(Number(e.target.value) || null)}
            >
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </Select>
          </label>
        )}
        <Checkbox
          checked={remember}
          onCheckedChange={setRemember}
        >
          Ne vprašaj me več (shrani privzeto)
        </Checkbox>
      </div>
    </Dialog>
  );
}

function SimilarItemDialog({
  open,
  ingredientTitle: ingredientName,
  existingTitle,
  suggestion,
  onUseExisting,
  onAddNew,
  onClose,
}: {
  open: boolean;
  ingredientTitle: string;
  existingTitle: string;
  suggestion?: string;
  onUseExisting: () => void;
  onAddNew: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      title="Podobna sestavina že obstaja"
      size="sm"
      footer={
        <>
          <Button color="gradient" appearance="full" type="button" onClick={onUseExisting}>
            Uporabi obstoječo
          </Button>
          <Button color="white" appearance="outline" type="button" onClick={onAddNew}>
            Dodaj kot novo
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-300">
        <p>
          Dodajaš <strong className="text-slate-100">{ingredientName}</strong>, na seznamu pa že obstaja podobna
          sestavina <strong className="text-slate-100">{existingTitle}</strong>.
        </p>
        {suggestion && <p className="text-xs text-slate-400">{suggestion}</p>}
        <p className="text-slate-400">Kaj želiš narediti?</p>
      </div>
    </Dialog>
  );
}

function UnitConflictDialog({
  open,
  ingredientTitle,
  newUnit,
  existingUnit,
  onConfirm,
  onClose,
}: {
  open: boolean;
  ingredientTitle: string;
  newUnit: string;
  existingUnit: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      title="Drugačna enota"
      size="sm"
      footer={
        <>
          <Button color="gradient" appearance="full" type="button" onClick={onConfirm}>
            Dodaj vseeno
          </Button>
          <Button color="white" appearance="outline" type="button" onClick={onClose}>
            Prekliči
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-300">
        Sestavina <strong className="text-slate-100">{ingredientTitle}</strong> je na seznamu že v enoti{' '}
        <strong className="text-slate-100">{existingUnit}</strong>, dodajaš pa v enoti{' '}
        <strong className="text-slate-100">{newUnit}</strong>. Želiš vseeno dodati?
      </p>
    </Dialog>
  );
}

// ---------- Animated loader (search) ----------

function AnimatedStepsLoader({
  steps,
  secondaryMessage,
  size = 'md',
}: {
  steps: string[];
  secondaryMessage?: string;
  size?: 'sm' | 'md';
}) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (steps.length <= 1) return;
    const id = setInterval(() => {
      setStepIndex((i) => (i + 1) % steps.length);
    }, 2800);
    return () => clearInterval(id);
  }, [steps.length]);

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <span
        className={cx(
          'animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400',
          size === 'sm' ? 'h-5 w-5' : 'h-8 w-8',
        )}
      />
      <div className="flex flex-col items-center gap-2">
        <div className="h-5 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.p
              key={stepIndex}
              className={cx(size === 'sm' ? 'text-xs text-slate-300' : 'text-sm text-slate-300')}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
            >
              {steps[stepIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
        {secondaryMessage && (
          <p className="text-xs text-slate-500">{secondaryMessage}</p>
        )}
        {steps.length > 1 && (
          <div className="flex items-center gap-1.5 pt-0.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={cx(
                  'rounded-full transition-all duration-500',
                  i === stepIndex
                    ? 'h-1.5 w-3 bg-cyan-400'
                    : 'h-1.5 w-1.5 bg-slate-600',
                )}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Recipe detail modal ----------

type AddPhase =
  | 'idle'
  | 'choosing-list'
  | 'checking'
  | 'similar'
  | 'unit-conflict'
  | 'adding'
  | 'done'
  | 'error'
  | 'bulk-checking'
  | 'bulk-review'
  | 'bulk-adding';

interface PendingIngredient {
  raw: string;
  scaled: string;
  servingScale: number;
  baseServings: number;
  targetServings: number;
}

interface BulkAddItem {
  raw: string;
  scaled: string;
  parsed: CheckIngredientResult['parsed'];
  match: CheckIngredientResult['match'];
  // 'new' = add as new item; String(listItemId) = link to an existing list item
  selectedValue: string;
}

interface ShoppingListItem {
  id: number;
  title: string;
}

// ---------- Inline searchable combobox for picking a list item ----------

function InlineItemCombobox({
  listItems,
  parsedTitle,
  parsedQuantity,
  parsedUnit,
  value,
  onChange,
  disabled,
}: {
  listItems: ShoppingListItem[];
  parsedTitle: string;
  parsedQuantity: number;
  parsedUnit: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});

  const newLabel = `${parsedTitle} · ${parsedQuantity} ${parsedUnit}`;
  const existingItem = listItems.find((li) => String(li.id) === value);
  const displayLabel = value === 'new'
    ? `+ Novo: ${newLabel}`
    : (existingItem ? existingItem.title : `+ Novo: ${newLabel}`);

  const filtered = query.trim()
    ? listItems.filter((li) => li.title.toLowerCase().includes(query.toLowerCase()))
    : listItems;

  function openDropdown() {
    if (disabled) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 240),
        zIndex: 9999,
      });
    }
    setQuery('');
    setOpen(true);
  }

  function closeDropdown() {
    setOpen(false);
    setQuery('');
  }

  function select(val: string) {
    onChange(val);
    closeDropdown();
  }

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        closeDropdown();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <>
      <div className="relative" ref={containerRef}>
        <input
          type="text"
          readOnly={!open}
          value={open ? query : displayLabel}
          placeholder={open ? 'Išči po seznamu…' : ''}
          onFocus={openDropdown}
          onChange={(e) => { if (open) setQuery(e.target.value); }}
          disabled={disabled}
          className="w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-1.5 pr-7 text-xs text-slate-200 outline-none transition focus:border-cyan-300/60 focus:ring-1 focus:ring-cyan-300/25 disabled:opacity-50"
        />
        <svg aria-hidden className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" viewBox="0 0 20 20" fill="none">
          <path d="M6 8L10 12L14 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {open && createPortal(
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="overflow-hidden rounded-xl border border-white/15 bg-slate-900 shadow-2xl"
        >
          <div className="max-h-56 overflow-y-auto">
            <button
              type="button"
              onMouseDown={() => select('new')}
              className={cx(
                'w-full px-3 py-2 text-left text-xs transition hover:bg-white/8',
                value === 'new' ? 'bg-cyan-500/10 text-cyan-300' : 'text-slate-300',
              )}
            >
              <span className="font-medium">+ Dodaj novo:</span>{' '}
              <span className="text-slate-400">{parsedTitle} · {parsedQuantity} {parsedUnit}</span>
            </button>
            {listItems.length > 0 && <div className="mx-2 border-t border-white/8" />}
            {filtered.map((li) => (
              <button
                key={li.id}
                type="button"
                onMouseDown={() => select(String(li.id))}
                className={cx(
                  'w-full px-3 py-2 text-left text-xs transition hover:bg-white/8',
                  String(li.id) === value ? 'bg-emerald-500/10 text-emerald-300' : 'text-slate-300',
                )}
              >
                {li.title}
              </button>
            ))}
            {filtered.length === 0 && query && (
              <p className="px-3 py-2.5 text-xs text-slate-500">Ni zadetkov za „{query}"</p>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ---------- Bulk-add review dialog ----------

function BulkAddReviewDialog({
  open,
  items,
  listItems,
  busy,
  onItemSelect,
  onConfirm,
  onClose,
}: {
  open: boolean;
  items: BulkAddItem[];
  listItems: ShoppingListItem[];
  busy: boolean;
  onItemSelect: (index: number, value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const confirmLabel = items.length === 1 ? 'Dodaj sestavino' : `Dodaj ${items.length} sestavin`;
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      title="Dodaj v seznam"
      size="md"
      footer={
        <>
          <Button color="gradient" appearance="full" type="button" disabled={busy} onClick={onConfirm}>
            {busy ? 'Dodajam…' : confirmLabel}
          </Button>
          <Button color="white" appearance="outline" type="button" disabled={busy} onClick={onClose}>
            Prekliči
          </Button>
        </>
      }
    >
      <ul className="space-y-2.5">
        {items.map((item, i) => {
          const hasUnitConflict = item.match?.type === 'unit_conflict' && item.selectedValue !== 'new';
          return (
            <li key={i} className="rounded-xl border border-white/10 bg-white/4 p-3">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-4">
                {/* Left: ingredient as in recipe */}
                <div className="min-w-0 flex-1">
                  <p className="mb-0.5 text-[10px] font-medium uppercase tracking-widest text-slate-500">
                    Sestavina
                  </p>
                  <p className="text-sm leading-snug text-slate-200">{item.scaled}</p>
                </div>
                {/* Right: searchable combobox to pick a list item */}
                <div className="shrink-0 sm:min-w-[220px]">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-widest text-slate-500">
                    Doda v seznam
                  </p>
                  <InlineItemCombobox
                    listItems={listItems}
                    parsedTitle={item.parsed.title}
                    parsedQuantity={item.parsed.quantity}
                    parsedUnit={item.parsed.unit}
                    value={item.selectedValue}
                    onChange={(val) => onItemSelect(i, val)}
                    disabled={busy}
                  />
                  {hasUnitConflict && (
                    <p className="mt-1 text-[10px] text-amber-400/80">
                      Enota: {item.parsed.unit} (seznam: {item.match!.listItemUnit})
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

function RecipeDetailModal({
  recipe,
  open,
  onClose,
  saved,
  busy = false,
  onAdd,
  onRemove,
  token,
}: {
  recipe: ParsedRecipe | null;
  open: boolean;
  onClose: () => void;
  saved: boolean;
  busy?: boolean;
  onAdd?: () => void;
  onRemove?: () => void;
  token: string;
}) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  // Serving size
  const baseServings = useMemo(() => parseBaseServings(recipe?.servings), [recipe?.servings]);
  const [servingSize, setServingSize] = useState(baseServings);
  useEffect(() => {
    setServingSize(parseBaseServings(recipe?.servings));
  }, [recipe?.servings, open]);

  const scale = servingSize / baseServings;

  // Add-to-list state
  const [addPhase, setAddPhase] = useState<AddPhase>('idle');
  const [addError, setAddError] = useState('');
  const [pendingIngredient, setPendingIngredient] = useState<PendingIngredient | null>(null);
  const [checkResult, setCheckResult] = useState<CheckIngredientResult | null>(null);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set());
  const [pendingBulkIngredients, setPendingBulkIngredients] = useState<string[]>([]);
  const [bulkItems, setBulkItems] = useState<BulkAddItem[]>([]);
  const [listItems, setListItems] = useState<ShoppingListItem[]>([]);

  // Lists for picker
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [listsLoading, setListsLoading] = useState(false);
  const defaultListId = useMemo((): number | null => {
    const raw = localStorage.getItem(DEFAULT_LIST_ID_KEY);
    return raw ? (Number(raw) || null) : null;
  }, []);

  useEffect(() => {
    if (!open) {
      setAddPhase('idle');
      setAddError('');
      setPendingIngredient(null);
      setCheckResult(null);
      setSelectedListId(null);
      setAddedItems(new Set());
      setExpandedImage(null);
      setCheckedIngredients(new Set());
      setPendingBulkIngredients([]);
      setBulkItems([]);
      setListItems([]);
    }
  }, [open]);

  const fetchLists = useCallback(async () => {
    setListsLoading(true);
    try {
      const res = await fetch('/api/lists', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = (await res.json()) as { lists: ShoppingList[] };
      setLists(data.lists);
    } finally {
      setListsLoading(false);
    }
  }, [token]);

  // Check-and-add logic
  const doCheckIngredient = useCallback(
    async (listId: number, ingredient: PendingIngredient) => {
      setAddPhase('checking');
      setAddError('');
      try {
        const res = await fetch('/api/recipes/check-ingredient', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ingredient: ingredient.raw,
            baseServings: ingredient.baseServings,
            targetServings: ingredient.targetServings,
            listId,
          }),
        });
        if (!res.ok) throw new Error(`Napaka ${res.status}`);
        const data = (await res.json()) as CheckIngredientResult;
        setCheckResult(data);

        if (!data.match) {
          await doAddItem(listId, data.parsed, ingredient.raw);
        } else if (data.match.type === 'exact') {
          await doAddItem(listId, data.parsed, ingredient.raw);
        } else if (data.match.type === 'similar') {
          setAddPhase('similar');
        } else {
          setAddPhase('unit-conflict');
        }
      } catch (e) {
        setAddError(e instanceof Error ? e.message : 'Napaka pri preverjanju');
        setAddPhase('error');
      }
    },
    [token] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const doAddItem = useCallback(
    async (listId: number, parsed: CheckIngredientResult['parsed'], rawIngredient: string) => {
      setAddPhase('adding');
      try {
        const res = await fetch(`/api/lists/${listId}/items`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: parsed.title,
            quantity: parsed.quantity,
            unit: parsed.unit,
          }),
        });
        if (!res.ok) throw new Error(`Napaka ${res.status}`);
        setAddedItems((prev) => new Set(prev).add(rawIngredient));
        setAddPhase('idle');
        setCheckResult(null);
        setPendingIngredient(null);
        setSelectedListId(null);
      } catch (e) {
        setAddError(e instanceof Error ? e.message : 'Napaka pri dodajanju');
        setAddPhase('error');
      }
    },
    [token]
  );

  const doBulkCheck = useCallback(
    async (listId: number, ingredients: string[]) => {
      setAddPhase('bulk-checking');
      setAddError('');
      try {
        const [checkResults, itemsRes] = await Promise.all([
          Promise.all(
            ingredients.map(async (raw) => {
              const res = await fetch('/api/recipes/check-ingredient', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ingredient: raw,
                  baseServings,
                  targetServings: servingSize,
                  listId,
                }),
              });
              if (!res.ok) throw new Error(`Napaka ${res.status}`);
              const data = (await res.json()) as CheckIngredientResult;
              return { raw, data };
            })
          ),
          fetch(`/api/lists/${listId}/items?status=active`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (itemsRes.ok) {
          const itemsData = (await itemsRes.json()) as { items: ShoppingListItem[] };
          setListItems(itemsData.items);
        }

        const items: BulkAddItem[] = checkResults.map(({ raw, data }) => ({
          raw,
          scaled: scaleIngredientText(raw, scale),
          parsed: data.parsed,
          match: data.match,
          selectedValue: (data.match && data.match.type === 'similar')
            ? String(data.match.listItemId)
            : 'new',
        }));
        setBulkItems(items);
        setAddPhase('bulk-review');
      } catch (e) {
        setAddError(e instanceof Error ? e.message : 'Napaka pri preverjanju');
        setAddPhase('error');
      }
    },
    [token, baseServings, servingSize, scale] // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function handleBulkAdd(ingredients: string[]) {
    if (defaultListId) {
      setSelectedListId(defaultListId);
      await doBulkCheck(defaultListId, ingredients);
    } else {
      setPendingBulkIngredients(ingredients);
      await fetchLists();
      setAddPhase('choosing-list');
    }
  }

  function handleBulkChoiceChange(index: number, value: string) {
    setBulkItems((prev) => prev.map((item, i) => i === index ? { ...item, selectedValue: value } : item));
  }

  async function handleBulkReviewConfirm() {
    if (!selectedListId) return;
    setAddPhase('bulk-adding');
    try {
      for (const item of bulkItems) {
        const isNew = item.selectedValue === 'new';
        const chosenListItem = isNew ? null : listItems.find((li) => String(li.id) === item.selectedValue);
        const title = chosenListItem ? chosenListItem.title : item.parsed.title;
        await fetch(`/api/lists/${selectedListId}/items`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, quantity: item.parsed.quantity, unit: item.parsed.unit }),
        });
        setAddedItems((prev) => new Set(prev).add(item.raw));
      }
      setAddPhase('idle');
      setBulkItems([]);
      setCheckedIngredients(new Set());
      setListItems([]);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Napaka pri dodajanju');
      setAddPhase('error');
    }
  }

  function handleIngredientAdd(rawIngredient: string) {
    void handleBulkAdd([rawIngredient]);
  }

  async function handleListConfirmed(listId: number, remember: boolean) {
    if (remember) {
      localStorage.setItem(DEFAULT_LIST_ID_KEY, String(listId));
    }
    setSelectedListId(listId);
    if (pendingBulkIngredients.length > 0) {
      const ingredients = pendingBulkIngredients;
      setPendingBulkIngredients([]);
      await doBulkCheck(listId, ingredients);
    } else if (pendingIngredient) {
      setAddPhase('checking');
      await doCheckIngredient(listId, pendingIngredient);
    }
  }

  async function handleSimilarUseExisting() {
    if (!checkResult?.match || !selectedListId) return;
    await doAddItem(selectedListId, checkResult.parsed, pendingIngredient?.raw ?? '');
  }

  async function handleSimilarAddNew() {
    if (!checkResult || !selectedListId) return;
    await doAddItem(selectedListId, checkResult.parsed, pendingIngredient?.raw ?? '');
  }

  async function handleUnitConflictConfirm() {
    if (!checkResult || !selectedListId) return;
    await doAddItem(selectedListId, checkResult.parsed, pendingIngredient?.raw ?? '');
  }

  const isAddBusy = addPhase === 'checking' || addPhase === 'adding' || addPhase === 'bulk-checking' || addPhase === 'bulk-adding';

  if (!recipe) return null;

  const hasMeta = recipe.prepTime || recipe.cookTime || recipe.totalTime || recipe.servings;
  const galleryImages = (recipe.images ?? []).filter(Boolean);

  const footer = saved ? (
    <Button
      color="danger"
      appearance="outline"
      size="md"
      type="button"
      icon={<Trash2 />}
      stretch
      disabled={busy}
      onClick={() => onRemove?.()}
    >
      {busy ? 'Odstranjujem…' : 'Odstrani recept'}
    </Button>
  ) : (
    <Button
      color="gradient"
      appearance="full"
      size="md"
      type="button"
      icon={<Plus />}
      stretch
      disabled={busy}
      onClick={() => onAdd?.()}
    >
      {busy ? 'Dodajam…' : 'Dodaj recept'}
    </Button>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }} title={recipe.title} size="lg" footer={footer}>
        <div className="space-y-5">
          {recipe.imageUrl && (
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <img
                src={recipe.imageUrl}
                alt={recipe.title}
                className="h-56 w-full object-cover"
              />
            </div>
          )}

          {recipe.description && (
            <p className="text-sm leading-relaxed text-slate-300">{recipe.description}</p>
          )}

          {hasMeta && (
            <div className="flex flex-wrap gap-3">
              {recipe.prepTime && (
                <div className="flex flex-col items-center rounded-xl border border-white/10 bg-white/4 px-4 py-2 text-center">
                  <span className="text-[10px] uppercase tracking-widest text-slate-500">Priprava</span>
                  <span className="text-sm font-semibold text-slate-200">{recipe.prepTime}</span>
                </div>
              )}
              {recipe.cookTime && (
                <div className="flex flex-col items-center rounded-xl border border-white/10 bg-white/4 px-4 py-2 text-center">
                  <span className="text-[10px] uppercase tracking-widest text-slate-500">Kuhanje</span>
                  <span className="text-sm font-semibold text-slate-200">{recipe.cookTime}</span>
                </div>
              )}
              {recipe.totalTime && (
                <div className="flex flex-col items-center rounded-xl border border-white/10 bg-white/4 px-4 py-2 text-center">
                  <span className="text-[10px] uppercase tracking-widest text-slate-500">Skupaj</span>
                  <span className="text-sm font-semibold text-slate-200">{recipe.totalTime}</span>
                </div>
              )}
              {recipe.servings && (
                <div className="flex flex-col items-center rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-center">
                  <span className="text-[10px] uppercase tracking-widest text-slate-500">Porcije</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label="Zmanjšaj porcije"
                      disabled={servingSize <= 1}
                      onClick={() => setServingSize((s) => Math.max(1, s - 1))}
                      className="flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-300 disabled:cursor-default disabled:opacity-30"
                    >
                      <Minus size={10} />
                    </button>
                    <span className="min-w-[1.5rem] text-center text-sm font-semibold text-slate-200">
                      {servingSize}
                    </span>
                    <button
                      type="button"
                      aria-label="Poveča porcije"
                      onClick={() => setServingSize((s) => s + 1)}
                      className="flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-300"
                    >
                      <Plus size={10} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Serving size control when recipe has no servings meta */}
          {!recipe.servings && (
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase tracking-widest text-slate-500">Porcije</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Zmanjšaj porcije"
                  disabled={servingSize <= 1}
                  onClick={() => setServingSize((s) => Math.max(1, s - 1))}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-300 disabled:cursor-default disabled:opacity-30"
                >
                  <Minus size={12} />
                </button>
                <span className="min-w-[1.5rem] text-center text-sm font-semibold text-slate-200">
                  {servingSize}
                </span>
                <button
                  type="button"
                  aria-label="Povečaj porcije"
                  onClick={() => setServingSize((s) => s + 1)}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-300"
                >
                  <Plus size={12} />
                </button>
              </div>
              {scale !== 1 && (
                <span className="text-xs text-cyan-400/70">×{scale % 1 === 0 ? scale : scale.toFixed(1)}</span>
              )}
            </div>
          )}

          {recipe.ingredients.length > 0 && (
            <section>
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
                    Sestavine
                  </h4>
                  {!isAddBusy && recipe.ingredients.some((ing) => !addedItems.has(ing)) && (
                    <button
                      type="button"
                      onClick={() => {
                        const available = recipe.ingredients.filter((ing) => !addedItems.has(ing));
                        const allChecked = available.every((ing) => checkedIngredients.has(ing));
                        setCheckedIngredients(allChecked ? new Set() : new Set(available));
                      }}
                      className="text-[11px] text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
                    >
                      {recipe.ingredients.filter((ing) => !addedItems.has(ing)).every((ing) => checkedIngredients.has(ing))
                        ? 'Odznači vse'
                        : 'Označi vse'}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {checkedIngredients.size > 0 && !isAddBusy && (
                    <button
                      type="button"
                      onClick={() => void handleBulkAdd(Array.from(checkedIngredients))}
                      className="flex items-center gap-1 rounded-lg border border-cyan-400/30 bg-cyan-500/15 px-2.5 py-1 text-xs font-medium text-cyan-300 transition hover:bg-cyan-500/25"
                    >
                      <Plus size={10} />
                      Dodaj ({checkedIngredients.size})
                    </button>
                  )}
                  {isAddBusy && (
                    <span className="flex items-center gap-1.5 text-xs text-cyan-400">
                      <span className="h-3 w-3 animate-spin rounded-full border border-cyan-400/40 border-t-cyan-400" />
                      {addPhase === 'checking' || addPhase === 'bulk-checking' ? 'Preverjam…' : 'Dodajam…'}
                    </span>
                  )}
                  {addPhase === 'error' && (
                    <span className="text-xs text-rose-400">{addError}</span>
                  )}
                </div>
              </div>
              <ul className="space-y-1">
                {recipe.ingredients.map((ing, i) => {
                  const displayText = scale !== 1 ? scaleIngredientText(ing, scale) : ing;
                  const isAdded = addedItems.has(ing);
                  const isCurrent = (pendingIngredient?.raw === ing && isAddBusy) ||
                    (addPhase === 'bulk-checking' && checkedIngredients.has(ing));
                  const isChecked = checkedIngredients.has(ing);
                  return (
                    <li
                      key={i}
                      className={cx(
                        'flex items-center gap-2.5 rounded-xl px-2 py-1 transition',
                        isAdded ? 'opacity-50' : 'hover:bg-white/4',
                      )}
                    >
                      {isAdded ? (
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/60" />
                      ) : (
                        <Checkbox
                          checked={isChecked}
                          disabled={isAddBusy}
                          onCheckedChange={(checked) => {
                            setCheckedIngredients((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(ing); else next.delete(ing);
                              return next;
                            });
                          }}
                        />
                      )}
                      <span className="flex-1 text-sm text-slate-300">{displayText}</span>
                      <button
                        type="button"
                        aria-label={isAdded ? 'Dodano' : `Dodaj "${ing}" v seznam`}
                        disabled={isAddBusy || isAdded}
                        onClick={() => void handleIngredientAdd(ing)}
                        className={cx(
                          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition',
                          isAdded
                            ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-400 cursor-default'
                            : isCurrent
                            ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-300'
                            : 'border-white/10 bg-white/5 text-slate-400 hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-300 disabled:cursor-default disabled:opacity-30',
                        )}
                      >
                        {isAdded ? (
                          <svg viewBox="0 0 14 14" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 7.2L5.6 9.6L11 4.3" />
                          </svg>
                        ) : isCurrent ? (
                          <span className="h-2.5 w-2.5 animate-spin rounded-full border border-cyan-400/40 border-t-cyan-300" />
                        ) : (
                          <Plus size={10} />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {recipe.instructions.length > 0 && (
            <section>
              <h4 className="mb-2.5 text-sm font-semibold uppercase tracking-widest text-slate-400">
                Postopek
              </h4>
              <ol className="space-y-3">
                {recipe.instructions.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm text-slate-300">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-300">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {recipe.ingredients.length === 0 && recipe.instructions.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-white/4 p-4 text-center text-sm text-slate-400">
              Podrobnosti recepta niso na voljo. Odpri originalno stran za celoten recept.
            </div>
          )}

          {galleryImages.length > 0 && (
            <section>
              <h4 className="mb-2.5 text-sm font-semibold uppercase tracking-widest text-slate-400">
                Galerija
              </h4>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {galleryImages.map((img, i) => (
                  <button
                    key={`${img}-${i}`}
                    type="button"
                    onClick={() => setExpandedImage(img)}
                    className="group aspect-square overflow-hidden rounded-xl border border-white/10 bg-white/4 transition-all duration-200 hover:border-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/45"
                    aria-label="Povečaj sliko"
                  >
                    <img
                      src={img}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      onError={(e) => {
                        const button = (e.currentTarget as HTMLImageElement).closest('button');
                        if (button) button.style.display = 'none';
                      }}
                    />
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="pt-1">
            <a
              href={recipe.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-cyan-400 underline-offset-2 hover:underline"
            >
              Odpri na {recipe.source}
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
        </div>
        <ImageLightbox src={expandedImage} onClose={() => setExpandedImage(null)} />
      </Dialog>

      {/* Add-to-list flow modals */}
      <ChooseListDialog
        open={addPhase === 'choosing-list'}
        lists={lists}
        listsLoading={listsLoading}
        initialListId={defaultListId}
        onConfirm={(listId, remember) => void handleListConfirmed(listId, remember)}
        onClose={() => { setAddPhase('idle'); setPendingIngredient(null); }}
      />
      <SimilarItemDialog
        open={addPhase === 'similar'}
        ingredientTitle={checkResult?.parsed.title ?? ''}
        existingTitle={checkResult?.match?.listItemTitle ?? ''}
        suggestion={checkResult?.match?.suggestion}
        onUseExisting={() => void handleSimilarUseExisting()}
        onAddNew={() => void handleSimilarAddNew()}
        onClose={() => { setAddPhase('idle'); setPendingIngredient(null); setCheckResult(null); }}
      />
      <UnitConflictDialog
        open={addPhase === 'unit-conflict'}
        ingredientTitle={checkResult?.parsed.title ?? ''}
        newUnit={checkResult?.parsed.unit ?? ''}
        existingUnit={checkResult?.match?.listItemUnit ?? ''}
        onConfirm={() => void handleUnitConflictConfirm()}
        onClose={() => { setAddPhase('idle'); setPendingIngredient(null); setCheckResult(null); }}
      />
      <BulkAddReviewDialog
        open={addPhase === 'bulk-review'}
        items={bulkItems}
        listItems={listItems}
        busy={addPhase === 'bulk-adding'}
        onItemSelect={handleBulkChoiceChange}
        onConfirm={() => void handleBulkReviewConfirm()}
        onClose={() => { setAddPhase('idle'); setBulkItems([]); setCheckedIngredients(new Set()); setListItems([]); }}
      />
    </>
  );
}

// ---------- Search overlay ----------

function SearchOverlay({
  open,
  onClose,
  token,
  savedByUrl,
  onAddRecipe,
  onRemoveRecipe,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  savedByUrl: Map<string, SavedRecipe>;
  onAddRecipe: (recipe: ParsedRecipe) => Promise<void>;
  onRemoveRecipe: (id: number) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RecipeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<ParsedRecipe | null>(null);
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [fetchingRecipe, setFetchingRecipe] = useState(false);
  const [recipeBusy, setRecipeBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const savedEntry = selectedRecipe ? savedByUrl.get(selectedRecipe.url) : undefined;

  const handleAdd = useCallback(async () => {
    if (!selectedRecipe) return;
    setRecipeBusy(true);
    try {
      await onAddRecipe(selectedRecipe);
    } finally {
      setRecipeBusy(false);
    }
  }, [selectedRecipe, onAddRecipe]);

  const handleRemove = useCallback(async () => {
    if (!savedEntry) return;
    setRecipeBusy(true);
    try {
      await onRemoveRecipe(savedEntry.id);
    } finally {
      setRecipeBusy(false);
    }
  }, [savedEntry, onRemoveRecipe]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSearched(false);
      setError('');
      setTranslating(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleSearch = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setTranslating(false);
    setError('');
    setResults([]);
    setSearched(false);
    try {
      const response = await fetch(`/api/recipes/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Napaka ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line) as
              | { type: 'result'; result: RecipeSearchResult }
              | { type: 'translated'; results: RecipeSearchResult[] }
              | { type: 'done' };
            if (msg.type === 'result') {
              setResults((prev) => [...prev, msg.result]);
              setSearched(true);
              setSearching(false);
              setTranslating(true);
            } else if (msg.type === 'translated') {
              setResults(msg.results);
              setTranslating(false);
            } else if (msg.type === 'done') {
              setTranslating(false);
            }
          } catch { /* skip malformed lines */ }
        }
      }
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Iskanje ni uspelo.');
      setSearched(true);
    } finally {
      setSearching(false);
      setTranslating(false);
    }
  }, [query, token]);

  const handleOpenRecipe = useCallback(async (url: string) => {
    setFetchingRecipe(true);
    setRecipeModalOpen(true);
    setSelectedRecipe(null);
    try {
      const response = await fetch(`/api/recipes/fetch?url=${encodeURIComponent(url)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Napaka ${response.status}`);
      const data = (await response.json()) as { recipe: ParsedRecipe };
      setSelectedRecipe(data.recipe);
    } catch {
      setRecipeModalOpen(false);
    } finally {
      setFetchingRecipe(false);
    }
  }, [token]);

  const overlay = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="search-overlay"
          className="fixed inset-0 z-50 flex flex-col overflow-hidden overscroll-contain"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {/* backdrop */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={{ opacity: 1, backdropFilter: 'blur(8px)' }}
            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            style={{ backgroundColor: 'rgba(2, 6, 23, 0.55)', WebkitBackdropFilter: 'blur(8px)' }}
          />

          {/* close button */}
          <Button
            color="white"
            appearance="transparent"
            icon={<X />}
            iconOnly
            size="sm"
            type="button"
            aria-label="Zapri iskanje"
            className="absolute right-3 top-3 z-20"
            onClick={onClose}
          />

          {/* content */}
          <motion.div
            className="relative z-10 flex h-full flex-col"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 270, damping: 24 }}
          >
            {/* search bar area */}
            <div className="shrink-0 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+3.5rem)] md:px-8">
              <form onSubmit={handleSearch} className="mx-auto max-w-2xl">
                <div className="relative flex items-center gap-2">
                  <Input
                    ref={inputRef}
                    type="search"
                    placeholder="Iskanje receptov… (npr. pica, špageti)"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    uiSize="lg"
                    className="flex-1"
                    aria-label="Iskanje receptov"
                  />
                  <Button
                    type="submit"
                    color="gradient"
                    appearance="full"
                    size="md"
                    icon={<Search />}
                    disabled={searching || !query.trim()}
                  >
                    Išči
                  </Button>
                </div>
              </form>
            </div>

            {/* results area */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8 md:px-8">
              <div className="mx-auto max-w-2xl space-y-3">
                {searching && results.length === 0 && (
                  <div className="flex flex-col items-center gap-3 py-16">
                    <AnimatedStepsLoader
                      steps={[
                        'Iščem recepte po spletu…',
                        'Preiskujem receptne strani…',
                        'Zbiram najboljše rezultate…',
                      ]}
                      secondaryMessage="Rezultati se bodo prikazali sproti"
                    />
                  </div>
                )}

                {!searching && error && (
                  <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4 text-sm text-rose-300">
                    {error}
                  </div>
                )}

                {!searching && searched && results.length === 0 && !error && (
                  <div className="py-16 text-center text-sm text-slate-400">
                    Ni rezultatov za &ldquo;{query}&rdquo;
                  </div>
                )}

                {results.length > 0 && (
                  <>
                    <div className="flex items-center justify-between pb-1">
                      <p className="text-xs text-slate-500">
                        {results.length} {results.length === 1 ? 'rezultat' : 'rezultati'}
                      </p>
                      {translating && (
                        <span className="flex items-center gap-1.5 text-xs text-slate-500">
                          <span className="h-2.5 w-2.5 animate-spin rounded-full border border-slate-500/40 border-t-slate-400" />
                          Prevajam naslove…
                        </span>
                      )}
                    </div>
                    {results.map((result) => (
                      <RecipeResultCard
                        key={result.url}
                        result={result}
                        onClick={() => void handleOpenRecipe(result.url)}
                      />
                    ))}
                  </>
                )}

                {!searching && !searched && (
                  <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <ReadyToEat size={96} animate />
                    <p className="text-sm text-slate-400">Vnesi ime jedi ali sestavine</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {createPortal(overlay, document.body)}
      <RecipeDetailModal
        recipe={selectedRecipe}
        open={recipeModalOpen && !fetchingRecipe}
        onClose={() => {
          setRecipeModalOpen(false);
          setSelectedRecipe(null);
        }}
        saved={Boolean(savedEntry)}
        busy={recipeBusy}
        onAdd={handleAdd}
        onRemove={handleRemove}
        token={token}
      />
      {/* Loading overlay for recipe fetch */}
      {fetchingRecipe && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(2,6,23,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          />
          <div className="relative z-10 rounded-2xl border border-white/10 bg-slate-900/80 px-8 py-6 shadow-2xl">
            <AnimatedStepsLoader
              steps={[
                'Odpiram stran recepta…',
                'Berem sestavine in postopek…',
                'Pripravljam prikaz recepta…',
              ]}
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function SavedRecipeCard({ recipe, onClick }: { recipe: SavedRecipe; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/4 text-left transition-all duration-200 hover:border-white/20 hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/45"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-white/5">
        {recipe.imageUrl ? (
          <img
            src={recipe.imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-600">
            <Search size={28} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5 p-3">
        <p className="line-clamp-2 text-sm font-semibold text-slate-100 group-hover:text-white">
          {recipe.title}
        </p>
        <SourceBadge source={recipe.source} />
      </div>
    </button>
  );
}

export function RecipesPage({ token, authUser, onLogout }: RecipesPageProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [savedRecipes, setSavedRecipes] = useState<SavedRecipe[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [selectedSaved, setSelectedSaved] = useState<SavedRecipe | null>(null);
  const [savedModalOpen, setSavedModalOpen] = useState(false);
  const [savedBusy, setSavedBusy] = useState(false);

  const savedByUrl = useMemo(() => {
    const map = new Map<string, SavedRecipe>();
    for (const recipe of savedRecipes) map.set(recipe.url, recipe);
    return map;
  }, [savedRecipes]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/recipes/saved', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`Napaka ${response.status}`);
        const data = (await response.json()) as { recipes: SavedRecipe[] };
        if (!cancelled) setSavedRecipes(data.recipes);
      } catch {
        if (!cancelled) setSavedRecipes([]);
      } finally {
        if (!cancelled) setLoadingSaved(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const addRecipe = useCallback(
    async (recipe: ParsedRecipe) => {
      const response = await fetch('/api/recipes/saved', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: recipe.url,
          source: recipe.source,
          title: recipe.title,
          description: recipe.description,
          imageUrl: recipe.imageUrl,
          prepTime: recipe.prepTime,
          cookTime: recipe.cookTime,
          totalTime: recipe.totalTime,
          servings: recipe.servings,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
          images: recipe.images ?? [],
        }),
      });
      if (!response.ok) return;
      const data = (await response.json()) as { recipe: SavedRecipe };
      setSavedRecipes((prev) => [data.recipe, ...prev.filter((r) => r.id !== data.recipe.id && r.url !== data.recipe.url)]);
    },
    [token]
  );

  const removeRecipe = useCallback(
    async (id: number) => {
      const response = await fetch(`/api/recipes/saved/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok && response.status !== 204) return;
      setSavedRecipes((prev) => prev.filter((r) => r.id !== id));
    },
    [token]
  );

  const handleRemoveSaved = useCallback(async () => {
    if (!selectedSaved) return;
    setSavedBusy(true);
    try {
      await removeRecipe(selectedSaved.id);
      setSavedModalOpen(false);
      setSelectedSaved(null);
    } finally {
      setSavedBusy(false);
    }
  }, [selectedSaved, removeRecipe]);

  const headerActions = (
    <Button
      color="white"
      appearance="transparent"
      size="md"
      type="button"
      icon={<Search />}
      iconOnly
      aria-label="Iskanje receptov"
      onClick={() => setSearchOpen(true)}
    />
  );

  return (
    <>
      <AppHeader title="Recepti" authUser={authUser} onLogout={onLogout} actions={headerActions} />

      {loadingSaved ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <AnimatedStepsLoader steps={['Nalagam vaše shranjene recepte…']} />
        </div>
      ) : savedRecipes.length > 0 ? (
        <section className="space-y-4 py-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-slate-100">Moji recepti</h2>
            <Button
              color="white"
              appearance="outline"
              size="sm"
              icon={<Search />}
              onClick={() => setSearchOpen(true)}
            >
              Dodaj
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {savedRecipes.map((recipe) => (
              <SavedRecipeCard
                key={recipe.id}
                recipe={recipe}
                onClick={() => {
                  setSelectedSaved(recipe);
                  setSavedModalOpen(true);
                }}
              />
            ))}
          </div>
        </section>
      ) : (
        <section className="flex min-h-[60vh] flex-col items-center justify-center gap-6 py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/5">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-10 w-10 text-slate-400"
              aria-hidden
            >
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2Z" />
              <path d="M12 8v8M8 12h8" />
            </svg>
          </div>
          <div className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight text-slate-100">Iščite recepte</h2>
            <p className="max-w-xs text-sm text-slate-400">
              Kliknite ikono za iskanje v zgornjem desnem kotu in poiščite priljubljene slovenske recepte.
            </p>
          </div>
          <Button
            color="white"
            appearance="outline"
            size="md"
            icon={<Search />}
            onClick={() => setSearchOpen(true)}
          >
            Iskanje receptov
          </Button>
        </section>
      )}

      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        token={token}
        savedByUrl={savedByUrl}
        onAddRecipe={addRecipe}
        onRemoveRecipe={removeRecipe}
      />

      <RecipeDetailModal
        recipe={selectedSaved}
        open={savedModalOpen}
        onClose={() => {
          setSavedModalOpen(false);
          setSelectedSaved(null);
        }}
        saved
        busy={savedBusy}
        onRemove={handleRemoveSaved}
        token={token}
      />
    </>
  );
}
