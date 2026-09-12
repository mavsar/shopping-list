import { cx } from 'class-variance-authority';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AppHeader } from '../components/AppHeader';
import { Fab } from '../components/Fab';
import { AmbientBackground } from '../layouts/AppShell';
import { RecipeLabelBadge, type RecipeLabel } from '../components/RecipeLabelBadge';
import { Camera, Edit, Minus, Plus, ReadyToEat, Sad, Search, Trash2, X } from '../components/lordicon/icons';
import { Button } from '../components/ui/button';
import { Dialog } from '../components/ui/dialog';
import { Checkbox } from '../components/ui/fields/checkbox';
import { Input } from '../components/ui/fields/input';
import { Select } from '../components/ui/fields/select';
import { Textarea } from '../components/ui/fields/textarea';
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
  sourceId: string;
  /** Title/description still in the source language; the server sends an update when translated. */
  translationPending?: boolean;
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
  labelIds: number[];
}

interface CheckIngredientResult {
  parsed: { title: string; quantity: number; unit: string; category?: string };
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
    <span className="inline-flex items-center rounded-full bg-paper-deep px-2 py-0.5 text-[10px] font-medium tracking-wide text-ink-muted">
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
      className="group relative flex w-full cursor-pointer gap-3 rounded-2xl border border-line bg-surface p-3 text-left transition-all duration-200 hover:border-basil/50 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-basil/40"
    >
      {result.imageUrl && (
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-line">
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
      <div className={cx('min-w-0 flex-1 space-y-1.5', result.translationPending && 'opacity-45')}>
        <p className="truncate text-sm font-semibold text-ink group-hover:text-ink">
          {result.title}
        </p>
        {result.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-ink-muted">
            {result.description}
          </p>
        )}
        <SourceBadge source={result.source} />
      </div>
      {result.translationPending && (
        <span className="absolute inset-x-0 bottom-2 flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/95 px-2.5 py-1 text-[11px] font-medium text-ink-soft shadow-card">
            <span className="h-2.5 w-2.5 animate-spin rounded-full border border-ink-faint border-t-basil" />
            Prevajam v slovenščino…
          </span>
        </span>
      )}
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
            style={{
              backgroundColor: 'rgba(2,6,23,0.82)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
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
    document.body,
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
      setSelectedId(initialListId ?? lists[0]?.id ?? null);
      setRemember(false);
    }
  }, [open, initialListId, lists]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title="Dodaj v seznam"
      size="sm"
      footer={
        <>
          <Button
            color="gradient"
            appearance="full"
            type="button"
            disabled={!selectedId}
            onClick={() => {
              if (selectedId) onConfirm(selectedId, remember);
            }}
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
          <p className="text-sm text-ink-muted">Nalagam sezname…</p>
        ) : lists.length === 0 ? (
          <p className="text-sm text-ink-muted">Nimaš nakupovalnih seznamov.</p>
        ) : (
          <label className="grid gap-1.5 text-sm text-ink-soft">
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
        <Checkbox checked={remember} onCheckedChange={setRemember}>
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
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
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
      <div className="space-y-3 text-sm text-ink-soft">
        <p>
          Dodajaš <strong className="text-ink">{ingredientName}</strong>, na seznamu pa že
          obstaja podobna sestavina <strong className="text-ink">{existingTitle}</strong>.
        </p>
        {suggestion && <p className="text-xs text-ink-muted">{suggestion}</p>}
        <p className="text-ink-muted">Kaj želiš narediti?</p>
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
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
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
      <p className="text-sm text-ink-soft">
        Sestavina <strong className="text-ink">{ingredientTitle}</strong> je na seznamu že v
        enoti <strong className="text-ink">{existingUnit}</strong>, dodajaš pa v enoti{' '}
        <strong className="text-ink">{newUnit}</strong>. Želiš vseeno dodati?
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
          'animate-spin rounded-full border-2 border-basil/30 border-t-basil',
          size === 'sm' ? 'h-5 w-5' : 'h-8 w-8',
        )}
      />
      <div className="flex flex-col items-center gap-2">
        <div className="h-5 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.p
              key={stepIndex}
              className={cx(size === 'sm' ? 'text-xs text-ink-soft' : 'text-sm text-ink-soft')}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
            >
              {steps[stepIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
        {secondaryMessage && <p className="text-xs text-ink-muted">{secondaryMessage}</p>}
        {steps.length > 1 && (
          <div className="flex items-center gap-1.5 pt-0.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={cx(
                  'rounded-full transition-all duration-500',
                  i === stepIndex ? 'h-1.5 w-3 bg-basil' : 'h-1.5 w-1.5 bg-line-strong',
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
  const displayLabel =
    value === 'new'
      ? `+ Novo: ${newLabel}`
      : existingItem
        ? existingItem.title
        : `+ Novo: ${newLabel}`;

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
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
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
          onChange={(e) => {
            if (open) setQuery(e.target.value);
          }}
          disabled={disabled}
          className="w-full rounded-xl border border-line bg-surface px-3 py-1.5 pr-7 text-xs text-ink-soft outline-none transition focus:border-basil focus:ring-1 focus:ring-basil/20 disabled:opacity-50"
        />
        <svg
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
          viewBox="0 0 20 20"
          fill="none"
        >
          <path
            d="M6 8L10 12L14 8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            style={dropdownStyle}
            className="overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
          >
            <div className="max-h-56 overflow-y-auto">
              <button
                type="button"
                onMouseDown={() => select('new')}
                className={cx(
                  'w-full px-3 py-2 text-left text-xs transition hover:bg-paper-deep',
                  value === 'new' ? 'bg-basil-soft text-basil-deep' : 'text-ink-soft',
                )}
              >
                <span className="font-medium">+ Dodaj novo:</span>{' '}
                <span className="text-ink-muted">
                  {parsedTitle} · {parsedQuantity} {parsedUnit}
                </span>
              </button>
              {listItems.length > 0 && <div className="mx-2 border-t border-line" />}
              {filtered.map((li) => (
                <button
                  key={li.id}
                  type="button"
                  onMouseDown={() => select(String(li.id))}
                  className={cx(
                    'w-full px-3 py-2 text-left text-xs transition hover:bg-paper-deep',
                    String(li.id) === value
                      ? 'bg-basil-soft text-basil-deep'
                      : 'text-ink-soft',
                  )}
                >
                  {li.title}
                </button>
              ))}
              {filtered.length === 0 && query && (
                <p className="px-3 py-2.5 text-xs text-ink-muted">Ni zadetkov za „{query}"</p>
              )}
            </div>
          </div>,
          document.body,
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
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title="Dodaj v seznam"
      size="md"
      footer={
        <>
          <Button
            color="gradient"
            appearance="full"
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Dodajam…' : confirmLabel}
          </Button>
          <Button
            color="white"
            appearance="outline"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Prekliči
          </Button>
        </>
      }
    >
      <ul className="space-y-2.5">
        {items.map((item, i) => {
          const hasUnitConflict =
            item.match?.type === 'unit_conflict' && item.selectedValue !== 'new';
          return (
            <li key={i} className="rounded-xl border border-line bg-surface p-3">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-4">
                {/* Left: ingredient as in recipe */}
                <div className="min-w-0 flex-1">
                  <p className="mb-0.5 text-[10px] font-medium uppercase tracking-widest text-ink-muted">
                    Sestavina
                  </p>
                  <p className="text-sm leading-snug text-ink-soft">{item.scaled}</p>
                </div>
                {/* Right: searchable combobox to pick a list item */}
                <div className="shrink-0 sm:min-w-[220px]">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-widest text-ink-muted">
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
                    <p className="mt-1 text-[10px] text-carrot">
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

interface CoverCandidate {
  imageUrl: string;
  thumbUrl: string;
  source?: string;
}

function CoverPickerDialog({
  open,
  onClose,
  token,
  initialQuery,
  ownImages,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  initialQuery: string;
  /** Pictures already on the recipe page (proxied or local) — offered first. */
  ownImages: string[];
  /** Resolves when the new cover is stored; throws to show an error. */
  onPick: (imageUrl: string) => Promise<void>;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [candidates, setCandidates] = useState<CoverCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError('');
      setCandidates([]);
      setBroken(new Set());
      let received = 0;
      try {
        const res = await fetch(`/api/recipes/cover-candidates?q=${encodeURIComponent(trimmed)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`Napaka ${res.status}`);
        const reader = res.body.getReader();
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
              const msg = JSON.parse(line) as { type: 'candidate'; candidate: CoverCandidate } | { type: 'done' };
              if (msg.type === 'candidate') {
                received++;
                setCandidates((prev) =>
                  prev.some((c) => c.imageUrl === msg.candidate.imageUrl) ? prev : [...prev, msg.candidate],
                );
              }
            } catch {
              /* skip malformed lines */
            }
          }
        }
        if (received === 0) setError('Na spletu ni najdenih slik za to jed. Poskusi z drugimi besedami.');
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Iskanje ni uspelo.');
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setLoading(false);
        }
      }
    },
    [token],
  );

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }
    setQuery(initialQuery);
    setSelecting(null);
    setError('');
    void search(initialQuery);
  }, [open, initialQuery, search]);

  async function handlePick(imageUrl: string) {
    if (selecting) return;
    setSelecting(imageUrl);
    setError('');
    try {
      await onPick(imageUrl);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Slike ni bilo mogoče shraniti.');
    } finally {
      setSelecting(null);
    }
  }

  const ownCandidates: CoverCandidate[] = ownImages.map((u) => ({ imageUrl: u, thumbUrl: u }));
  const webCandidates = candidates.filter((c) => !broken.has(c.imageUrl));

  const renderGrid = (items: CoverCandidate[]) => (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {items.map((candidate) => {
        const isSelecting = selecting === candidate.imageUrl;
        return (
          <button
            key={candidate.imageUrl}
            type="button"
            className={cx(
              'relative aspect-square cursor-pointer overflow-hidden rounded-xl border bg-paper-deep p-0 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-basil/40',
              isSelecting ? 'border-basil' : 'border-line hover:border-basil/60',
              selecting && !isSelecting && 'opacity-50',
            )}
            disabled={Boolean(selecting)}
            onClick={() => void handlePick(candidate.imageUrl)}
            title={candidate.source ? `Uporabi sliko (${candidate.source})` : 'Uporabi to sliko'}
          >
            <img
              src={candidate.thumbUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="block h-full w-full object-cover"
              onError={() => setBroken((prev) => new Set(prev).add(candidate.imageUrl))}
            />
            {candidate.source ? (
              <span className="absolute inset-x-0 bottom-0 truncate bg-ink/55 px-1.5 py-0.5 text-[10px] text-white">
                {candidate.source}
              </span>
            ) : null}
            {isSelecting && (
              <span className="absolute inset-0 flex items-center justify-center bg-surface/70">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink-faint border-t-basil" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !selecting) onClose();
      }}
      title="Zamenjaj naslovno sliko"
      description="Izbrana slika se prenese in shrani k receptu."
      size="lg"
      fullHeight
    >
      <div className="flex h-full flex-col gap-4">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void search(query);
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Išči slike jedi…"
            aria-label="Iskalna fraza slike"
            maxLength={200}
            className="flex-1"
          />
          <Button
            type="submit"
            color="white"
            appearance="outline"
            iconOnly
            icon={<Search animateOnHover />}
            aria-label="Poišči slike"
            disabled={loading || !query.trim()}
          />
        </form>

        {ownCandidates.length > 0 ? (
          <section className="space-y-2">
            <h4 className="m-0 text-xs font-semibold uppercase tracking-widest text-ink-muted">Slike iz recepta</h4>
            {renderGrid(ownCandidates)}
          </section>
        ) : null}

        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <h4 className="m-0 text-xs font-semibold uppercase tracking-widest text-ink-muted">S spleta</h4>
            {loading ? (
              <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                <span className="h-2.5 w-2.5 animate-spin rounded-full border border-ink-faint border-t-basil" />
                iščem…
              </span>
            ) : null}
          </div>
          {error ? <p className="m-0 text-xs text-tomato-deep">{error}</p> : null}
          {webCandidates.length > 0 ? renderGrid(webCandidates) : null}
          {loading && webCandidates.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <AnimatedStepsLoader steps={['Iščem fotografije te jedi…', 'Preverjam receptne strani…']} />
            </div>
          ) : null}
        </section>
      </div>
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
  recipeId,
  labels,
  labelIds: externalLabelIds,
  onLabelsChange,
  onImagesRefetched,
  onContentUpdated,
  onCoverChanged,
}: {
  recipe: ParsedRecipe | null;
  open: boolean;
  onClose: () => void;
  saved: boolean;
  busy?: boolean;
  onAdd?: () => void;
  onRemove?: () => void;
  token: string;
  recipeId?: number;
  labels?: RecipeLabel[];
  labelIds?: number[];
  onLabelsChange?: (recipeId: number, newLabelIds: number[]) => void;
  onImagesRefetched?: (recipeId: number, imageUrl: string | undefined, images: string[]) => void;
  onContentUpdated?: (recipeId: number, ingredients: string[], instructions: string[]) => void;
  /** Unsaved recipes only: the picked cover was downloaded and now lives at this local path. */
  onCoverChanged?: (imageUrl: string) => void;
}) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [localLabelIds, setLocalLabelIds] = useState<number[]>([]);
  const [labelSaving, setLabelSaving] = useState(false);
  const [imageBroken, setImageBroken] = useState(false);
  const [refetchingImages, setRefetchingImages] = useState(false);
  const [refetchError, setRefetchError] = useState('');
  const [editingContent, setEditingContent] = useState(false);
  const [draftIngredients, setDraftIngredients] = useState<string[]>([]);
  const [draftInstructions, setDraftInstructions] = useState<string[]>([]);
  const [savingContent, setSavingContent] = useState(false);
  const [contentError, setContentError] = useState('');

  useEffect(() => setImageBroken(false), [recipe?.imageUrl]);

  async function handlePickCover(imageUrl: string) {
    if (!recipe) return;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    if (saved && recipeId) {
      const res = await fetch(`/api/recipes/saved/${recipeId}/cover`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ imageUrl }),
      });
      if (!res.ok) throw new Error('Slike ni bilo mogoče shraniti.');
      const data = (await res.json()) as { recipe: SavedRecipe };
      onImagesRefetched?.(data.recipe.id, data.recipe.imageUrl, data.recipe.images ?? []);
    } else {
      const res = await fetch('/api/recipes/cover', { method: 'POST', headers, body: JSON.stringify({ imageUrl }) });
      if (!res.ok) throw new Error('Slike ni bilo mogoče prenesti.');
      const data = (await res.json()) as { imageUrl: string };
      onCoverChanged?.(data.imageUrl);
    }
  }

  async function handleRefetchImages() {
    if (!recipeId || refetchingImages) return;
    setRefetchingImages(true);
    setRefetchError('');
    try {
      const res = await fetch(`/api/recipes/saved/${recipeId}/refetch-images`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setRefetchError('Osveževanje slik ni uspelo.');
        return;
      }
      const data = (await res.json()) as { recipe: SavedRecipe };
      onImagesRefetched?.(data.recipe.id, data.recipe.imageUrl, data.recipe.images ?? []);
    } catch {
      setRefetchError('Osveževanje slik ni uspelo.');
    } finally {
      setRefetchingImages(false);
    }
  }

  function handleStartEditContent() {
    if (!recipe) return;
    setDraftIngredients([...recipe.ingredients]);
    setDraftInstructions([...recipe.instructions]);
    setContentError('');
    setEditingContent(true);
  }

  function handleCancelEditContent() {
    setEditingContent(false);
    setContentError('');
  }

  async function handleSaveContent() {
    if (!recipeId || savingContent) return;
    const cleanIngredients = draftIngredients.map((s) => s.trim()).filter(Boolean);
    const cleanInstructions = draftInstructions.map((s) => s.trim()).filter(Boolean);
    setSavingContent(true);
    setContentError('');
    try {
      const res = await fetch(`/api/recipes/saved/${recipeId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients: cleanIngredients, instructions: cleanInstructions }),
      });
      if (!res.ok) {
        setContentError('Shranjevanje ni uspelo.');
        return;
      }
      const data = (await res.json()) as { recipe: SavedRecipe };
      onContentUpdated?.(data.recipe.id, data.recipe.ingredients, data.recipe.instructions);
      setEditingContent(false);
    } catch {
      setContentError('Shranjevanje ni uspelo.');
    } finally {
      setSavingContent(false);
    }
  }

  useEffect(() => {
    setLocalLabelIds(externalLabelIds ?? []);
  }, [externalLabelIds, open]);

  async function handleToggleLabel(labelId: number) {
    if (!recipeId) return;
    const next = localLabelIds.includes(labelId)
      ? localLabelIds.filter((id) => id !== labelId)
      : [...localLabelIds, labelId];
    setLocalLabelIds(next);
    onLabelsChange?.(recipeId, next);
    setLabelSaving(true);
    try {
      await fetch(`/api/recipes/saved/${recipeId}/labels`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelIds: next }),
      });
    } finally {
      setLabelSaving(false);
    }
  }

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
    return raw ? Number(raw) || null : null;
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
      setRefetchError('');
      setEditingContent(false);
      setContentError('');
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
        const res = await fetch('/api/recipes/check-ingredients', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ingredients: [ingredient.raw],
            baseServings: ingredient.baseServings,
            targetServings: ingredient.targetServings,
            listId,
          }),
        });
        if (!res.ok) throw new Error(`Napaka ${res.status}`);
        const { results } = (await res.json()) as { results: CheckIngredientResult[] };
        const data = results[0];
        if (!data) throw new Error('Prazen odgovor');
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
    [token], // eslint-disable-line react-hooks/exhaustive-deps
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
            category: parsed.category,
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
    [token],
  );

  const doBulkCheck = useCallback(
    async (listId: number, ingredients: string[]) => {
      setAddPhase('bulk-checking');
      setAddError('');
      try {
        // All ingredients are parsed and matched in a single request (one Gemini call).
        const [checkRes, itemsRes] = await Promise.all([
          fetch('/api/recipes/check-ingredients', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ingredients,
              baseServings,
              targetServings: servingSize,
              listId,
            }),
          }),
          fetch(`/api/lists/${listId}/items?status=active`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        if (!checkRes.ok) throw new Error(`Napaka ${checkRes.status}`);
        const { results: checkResults } = (await checkRes.json()) as {
          results: Array<CheckIngredientResult & { raw: string }>;
        };

        if (itemsRes.ok) {
          const itemsData = (await itemsRes.json()) as { items: ShoppingListItem[] };
          setListItems(itemsData.items);
        }

        const items: BulkAddItem[] = checkResults.map((data) => ({
          raw: data.raw,
          scaled: scaleIngredientText(data.raw, scale),
          parsed: data.parsed,
          match: data.match,
          selectedValue:
            data.match && data.match.type === 'similar' ? String(data.match.listItemId) : 'new',
        }));
        setBulkItems(items);
        setAddPhase('bulk-review');
      } catch (e) {
        setAddError(e instanceof Error ? e.message : 'Napaka pri preverjanju');
        setAddPhase('error');
      }
    },
    [token, baseServings, servingSize, scale], // eslint-disable-line react-hooks/exhaustive-deps
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
    setBulkItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, selectedValue: value } : item)),
    );
  }

  async function handleBulkReviewConfirm() {
    if (!selectedListId) return;
    setAddPhase('bulk-adding');
    try {
      // Add items a few at a time instead of strictly one after another.
      const queue = [...bulkItems];
      let firstFailure: Error | null = null;
      const addOne = async (item: BulkAddItem) => {
        const isNew = item.selectedValue === 'new';
        const chosenListItem = isNew
          ? null
          : listItems.find((li) => String(li.id) === item.selectedValue);
        const title = chosenListItem ? chosenListItem.title : item.parsed.title;
        const res = await fetch(`/api/lists/${selectedListId}/items`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            quantity: item.parsed.quantity,
            unit: item.parsed.unit,
            category: chosenListItem ? undefined : item.parsed.category,
          }),
        });
        if (!res.ok) throw new Error(`Napaka ${res.status}`);
        setAddedItems((prev) => new Set(prev).add(item.raw));
      };
      await Promise.all(
        Array.from({ length: Math.min(4, queue.length) }, async () => {
          while (queue.length > 0) {
            const item = queue.shift()!;
            try {
              await addOne(item);
            } catch (e) {
              firstFailure ??= e instanceof Error ? e : new Error('Napaka pri dodajanju');
            }
          }
        }),
      );
      if (firstFailure) throw firstFailure;
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

  const isAddBusy =
    addPhase === 'checking' ||
    addPhase === 'adding' ||
    addPhase === 'bulk-checking' ||
    addPhase === 'bulk-adding';

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
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
        title={recipe.title}
        size="lg"
        footer={footer}
      >
        <div className="space-y-5">
          <div className="group relative">
            {recipe.imageUrl && !imageBroken ? (
              <div className="overflow-hidden rounded-2xl border border-line">
                <img
                  src={recipe.imageUrl}
                  alt={recipe.title}
                  className="h-56 w-full object-cover"
                  onError={() => setImageBroken(true)}
                />
              </div>
            ) : (
              <div className="flex h-56 w-full items-center justify-center rounded-2xl border border-line bg-surface text-sm text-ink-muted">
                Ni slike
              </div>
            )}
            {/* Always visible on touch screens; hover-revealed where hover exists. */}
            <Button
              type="button"
              color="white"
              appearance="full"
              size="md"
              icon={<Camera animateOnHover />}
              iconOnly
              aria-label="Zamenjaj sliko"
              title="Zamenjaj sliko"
              className="absolute bottom-3 right-3 rounded-full shadow-float transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
              onClick={() => setCoverPickerOpen(true)}
            />
          </div>

          {recipe.description && (
            <p className="text-sm leading-relaxed text-ink-soft">{recipe.description}</p>
          )}

          {saved && labels && labels.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <h4 className="text-sm font-semibold uppercase tracking-widest text-ink-muted">
                  Oznake
                </h4>
                {labelSaving && (
                  <span className="h-3 w-3 animate-spin rounded-full border border-ink-faint border-t-basil" />
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                {labels.map((label) => (
                  <RecipeLabelBadge
                    key={label.id}
                    name={label.name}
                    color={label.color}
                    dot
                    active={localLabelIds.includes(label.id)}
                    onClick={() => void handleToggleLabel(label.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {hasMeta && (
            <div className="flex flex-wrap gap-3">
              {recipe.prepTime && (
                <div className="flex flex-col items-center rounded-xl border border-line bg-surface px-4 py-2 text-center">
                  <span className="text-[10px] uppercase tracking-widest text-ink-muted">
                    Priprava
                  </span>
                  <span className="text-sm font-semibold text-ink-soft">{recipe.prepTime}</span>
                </div>
              )}
              {recipe.cookTime && (
                <div className="flex flex-col items-center rounded-xl border border-line bg-surface px-4 py-2 text-center">
                  <span className="text-[10px] uppercase tracking-widest text-ink-muted">
                    Kuhanje
                  </span>
                  <span className="text-sm font-semibold text-ink-soft">{recipe.cookTime}</span>
                </div>
              )}
              {recipe.totalTime && (
                <div className="flex flex-col items-center rounded-xl border border-line bg-surface px-4 py-2 text-center">
                  <span className="text-[10px] uppercase tracking-widest text-ink-muted">
                    Skupaj
                  </span>
                  <span className="text-sm font-semibold text-ink-soft">{recipe.totalTime}</span>
                </div>
              )}
              {recipe.servings && (
                <div className="flex flex-col items-center rounded-xl border border-line bg-surface px-3 py-2 text-center">
                  <span className="text-[10px] uppercase tracking-widest text-ink-muted">
                    Porcije
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label="Zmanjšaj porcije"
                      disabled={servingSize <= 1}
                      onClick={() => setServingSize((s) => Math.max(1, s - 1))}
                      className="flex h-5 w-5 items-center justify-center rounded-full border border-line bg-paper-deep text-ink-soft transition hover:border-basil/50 hover:bg-basil-soft hover:text-basil-deep disabled:cursor-default disabled:opacity-30"
                    >
                      <Minus size={10} />
                    </button>
                    <span className="min-w-[1.5rem] text-center text-sm font-semibold text-ink-soft">
                      {servingSize}
                    </span>
                    <button
                      type="button"
                      aria-label="Poveča porcije"
                      onClick={() => setServingSize((s) => s + 1)}
                      className="flex h-5 w-5 items-center justify-center rounded-full border border-line bg-paper-deep text-ink-soft transition hover:border-basil/50 hover:bg-basil-soft hover:text-basil-deep"
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
              <span className="text-xs uppercase tracking-widest text-ink-muted">Porcije</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Zmanjšaj porcije"
                  disabled={servingSize <= 1}
                  onClick={() => setServingSize((s) => Math.max(1, s - 1))}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-line bg-paper-deep text-ink-soft transition hover:border-basil/50 hover:bg-basil-soft hover:text-basil-deep disabled:cursor-default disabled:opacity-30"
                >
                  <Minus size={12} />
                </button>
                <span className="min-w-[1.5rem] text-center text-sm font-semibold text-ink-soft">
                  {servingSize}
                </span>
                <button
                  type="button"
                  aria-label="Povečaj porcije"
                  onClick={() => setServingSize((s) => s + 1)}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-line bg-paper-deep text-ink-soft transition hover:border-basil/50 hover:bg-basil-soft hover:text-basil-deep"
                >
                  <Plus size={12} />
                </button>
              </div>
              {scale !== 1 && (
                <span className="text-xs text-basil">
                  ×{scale % 1 === 0 ? scale : scale.toFixed(1)}
                </span>
              )}
            </div>
          )}

          {saved && recipeId && !editingContent && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleStartEditContent}
                className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink hover:underline"
              >
                <Edit size={12} />
                Uredi sestavine in postopek
              </button>
            </div>
          )}

          {editingContent ? (
            <section className="space-y-5">
              <div>
                <h4 className="mb-2.5 text-sm font-semibold uppercase tracking-widest text-ink-muted">
                  Sestavine
                </h4>
                <div className="space-y-2">
                  {draftIngredients.map((ing, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={ing}
                        onChange={(e) =>
                          setDraftIngredients((prev) =>
                            prev.map((v, idx) => (idx === i ? e.target.value : v)),
                          )
                        }
                        placeholder="npr. 500 g mletega mesa"
                        className="flex-1"
                      />
                      <button
                        type="button"
                        aria-label="Odstrani sestavino"
                        onClick={() => setDraftIngredients((prev) => prev.filter((_, idx) => idx !== i))}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-paper-deep text-ink-muted transition hover:border-tomato/50 hover:bg-tomato-soft hover:text-tomato-deep"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setDraftIngredients((prev) => [...prev, ''])}
                  className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-basil-deep hover:underline"
                >
                  <Plus size={10} />
                  Dodaj sestavino
                </button>
              </div>

              <div>
                <h4 className="mb-2.5 text-sm font-semibold uppercase tracking-widest text-ink-muted">
                  Postopek
                </h4>
                <div className="space-y-2">
                  {draftInstructions.map((step, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-2.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-basil-soft text-[10px] font-bold text-basil-deep">
                        {i + 1}
                      </span>
                      <Textarea
                        value={step}
                        onChange={(e) =>
                          setDraftInstructions((prev) =>
                            prev.map((v, idx) => (idx === i ? e.target.value : v)),
                          )
                        }
                        rows={2}
                        placeholder="Opiši korak…"
                        className="flex-1"
                      />
                      <button
                        type="button"
                        aria-label="Odstrani korak"
                        onClick={() => setDraftInstructions((prev) => prev.filter((_, idx) => idx !== i))}
                        className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-paper-deep text-ink-muted transition hover:border-tomato/50 hover:bg-tomato-soft hover:text-tomato-deep"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setDraftInstructions((prev) => [...prev, ''])}
                  className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-basil-deep hover:underline"
                >
                  <Plus size={10} />
                  Dodaj korak
                </button>
              </div>

              {contentError && <p className="text-xs text-tomato-deep">{contentError}</p>}

              <div className="flex gap-2">
                <Button
                  color="gradient"
                  appearance="full"
                  size="md"
                  type="button"
                  stretch
                  disabled={savingContent}
                  onClick={() => void handleSaveContent()}
                >
                  {savingContent ? 'Shranjujem…' : 'Shrani spremembe'}
                </Button>
                <Button
                  color="white"
                  appearance="outline"
                  size="md"
                  type="button"
                  disabled={savingContent}
                  onClick={handleCancelEditContent}
                >
                  Prekliči
                </Button>
              </div>
            </section>
          ) : (
            <>
              {recipe.ingredients.length > 0 && (
                <section>
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold uppercase tracking-widest text-ink-muted">
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
                          className="text-[11px] text-ink-muted underline-offset-2 hover:text-ink hover:underline"
                        >
                          {recipe.ingredients
                            .filter((ing) => !addedItems.has(ing))
                            .every((ing) => checkedIngredients.has(ing))
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
                          className="flex items-center gap-1 rounded-lg border border-basil/30 bg-basil-soft px-2.5 py-1 text-xs font-medium text-basil-deep transition hover:bg-basil-soft"
                        >
                          <Plus size={10} />
                          Dodaj ({checkedIngredients.size})
                        </button>
                      )}
                      {isAddBusy && (
                        <span className="flex items-center gap-1.5 text-xs text-basil-deep">
                          <span className="h-3 w-3 animate-spin rounded-full border border-basil/40 border-t-basil" />
                          {addPhase === 'checking' || addPhase === 'bulk-checking'
                            ? 'Preverjam…'
                            : 'Dodajam…'}
                        </span>
                      )}
                      {addPhase === 'error' && (
                        <span className="text-xs text-tomato-deep">{addError}</span>
                      )}
                    </div>
                  </div>
                  <ul className="space-y-1">
                    {recipe.ingredients.map((ing, i) => {
                      const displayText = scale !== 1 ? scaleIngredientText(ing, scale) : ing;
                      const isAdded = addedItems.has(ing);
                      const isCurrent =
                        (pendingIngredient?.raw === ing && isAddBusy) ||
                        (addPhase === 'bulk-checking' && checkedIngredients.has(ing));
                      const isChecked = checkedIngredients.has(ing);
                      return (
                        <li
                          key={i}
                          className={cx(
                            'flex items-center gap-2.5 rounded-xl px-2 py-1 transition',
                            isAdded ? 'opacity-50' : 'hover:bg-ink/4',
                          )}
                        >
                          {isAdded ? (
                            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-basil" />
                          ) : (
                            <Checkbox
                              checked={isChecked}
                              disabled={isAddBusy}
                              onCheckedChange={(checked) => {
                                setCheckedIngredients((prev) => {
                                  const next = new Set(prev);
                                  if (checked) next.add(ing);
                                  else next.delete(ing);
                                  return next;
                                });
                              }}
                            />
                          )}
                          <span className="flex-1 text-sm text-ink-soft">{displayText}</span>
                          <button
                            type="button"
                            aria-label={isAdded ? 'Dodano' : `Dodaj "${ing}" v seznam`}
                            disabled={isAddBusy || isAdded}
                            onClick={() => void handleIngredientAdd(ing)}
                            className={cx(
                              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition',
                              isAdded
                                ? 'border-basil/40 bg-basil-soft text-basil-deep cursor-default'
                                : isCurrent
                                  ? 'border-basil/40 bg-basil-soft text-basil-deep'
                                  : 'border-line bg-paper-deep text-ink-muted hover:border-basil/50 hover:bg-basil-soft hover:text-basil-deep disabled:cursor-default disabled:opacity-30',
                            )}
                          >
                            {isAdded ? (
                              <svg
                                viewBox="0 0 14 14"
                                className="h-3 w-3"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M3 7.2L5.6 9.6L11 4.3" />
                              </svg>
                            ) : isCurrent ? (
                              <span className="h-2.5 w-2.5 animate-spin rounded-full border border-basil/40 border-t-basil" />
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
                  <h4 className="mb-2.5 text-sm font-semibold uppercase tracking-widest text-ink-muted">
                    Postopek
                  </h4>
                  <ol className="space-y-3">
                    {recipe.instructions.map((step, i) => (
                      <li key={i} className="flex gap-3 text-sm text-ink-soft">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-basil-soft text-[10px] font-bold text-basil-deep">
                          {i + 1}
                        </span>
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {recipe.ingredients.length === 0 && recipe.instructions.length === 0 && (
                <div className="rounded-xl border border-line bg-surface p-4 text-center text-sm text-ink-muted">
                  Podrobnosti recepta niso na voljo. Odpri originalno stran za celoten recept.
                </div>
              )}
            </>
          )}

          {galleryImages.length > 0 && (
            <section>
              <h4 className="mb-2.5 text-sm font-semibold uppercase tracking-widest text-ink-muted">
                Galerija
              </h4>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {galleryImages.map((img, i) => (
                  <button
                    key={`${img}-${i}`}
                    type="button"
                    onClick={() => setExpandedImage(img)}
                    className="group aspect-square overflow-hidden rounded-xl border border-line bg-surface transition-all duration-200 hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-basil/40"
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

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <a
              href={recipe.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-basil-deep underline-offset-2 hover:underline"
            >
              Odpri na {recipe.source}
              <svg
                viewBox="0 0 24 24"
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
            {saved && recipeId && (
              <button
                type="button"
                onClick={() => void handleRefetchImages()}
                disabled={refetchingImages}
                className="inline-flex items-center gap-1.5 text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline disabled:cursor-default disabled:opacity-60"
              >
                {refetchingImages && (
                  <span
                    className="h-3 w-3 animate-spin rounded-full border border-ink-faint border-t-transparent"
                    aria-hidden
                  />
                )}
                {refetchingImages ? 'Osvežujem slike…' : 'Osveži slike'}
              </button>
            )}
          </div>
          {refetchError && <p className="text-xs text-red-400">{refetchError}</p>}
        </div>
        <ImageLightbox src={expandedImage} onClose={() => setExpandedImage(null)} />
      </Dialog>

      <CoverPickerDialog
        open={coverPickerOpen}
        onClose={() => setCoverPickerOpen(false)}
        token={token}
        initialQuery={recipe.title}
        ownImages={(recipe.images ?? []).filter((u) => u !== recipe.imageUrl)}
        onPick={handlePickCover}
      />

      {/* Add-to-list flow modals */}
      <ChooseListDialog
        open={addPhase === 'choosing-list'}
        lists={lists}
        listsLoading={listsLoading}
        initialListId={defaultListId}
        onConfirm={(listId, remember) => void handleListConfirmed(listId, remember)}
        onClose={() => {
          setAddPhase('idle');
          setPendingIngredient(null);
        }}
      />
      <SimilarItemDialog
        open={addPhase === 'similar'}
        ingredientTitle={checkResult?.parsed.title ?? ''}
        existingTitle={checkResult?.match?.listItemTitle ?? ''}
        suggestion={checkResult?.match?.suggestion}
        onUseExisting={() => void handleSimilarUseExisting()}
        onAddNew={() => void handleSimilarAddNew()}
        onClose={() => {
          setAddPhase('idle');
          setPendingIngredient(null);
          setCheckResult(null);
        }}
      />
      <UnitConflictDialog
        open={addPhase === 'unit-conflict'}
        ingredientTitle={checkResult?.parsed.title ?? ''}
        newUnit={checkResult?.parsed.unit ?? ''}
        existingUnit={checkResult?.match?.listItemUnit ?? ''}
        onConfirm={() => void handleUnitConflictConfirm()}
        onClose={() => {
          setAddPhase('idle');
          setPendingIngredient(null);
          setCheckResult(null);
        }}
      />
      <BulkAddReviewDialog
        open={addPhase === 'bulk-review'}
        items={bulkItems}
        listItems={listItems}
        busy={addPhase === 'bulk-adding'}
        onItemSelect={handleBulkChoiceChange}
        onConfirm={() => void handleBulkReviewConfirm()}
        onClose={() => {
          setAddPhase('idle');
          setBulkItems([]);
          setCheckedIngredients(new Set());
          setListItems([]);
        }}
      />
    </>
  );
}

// ---------- Recipe source picker ----------

interface RecipeSource {
  id: string;
  label: string;
  domain: string;
  group: 'slovenian' | 'world';
  language: string;
}

const RECIPE_SOURCES_STORAGE_KEY = 'recipe-search-sources';
const SOURCE_GROUPS: RecipeSource['group'][] = ['slovenian', 'world'];
const SOURCE_GROUP_LABELS: Record<RecipeSource['group'], string> = {
  slovenian: 'Slovenske strani',
  world: 'Svetovne strani',
};
const LONG_PRESS_MS = 500;

let recipeSourcesCache: Promise<RecipeSource[]> | null = null;

/** Catalog of searchable sites; fetched once per page load. */
function loadRecipeSources(token: string): Promise<RecipeSource[]> {
  if (!recipeSourcesCache) {
    recipeSourcesCache = fetch('/api/recipes/sources', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Napaka ${response.status}`);
        const data = (await response.json()) as { sources: RecipeSource[] };
        return data.sources;
      })
      .catch((err: unknown) => {
        recipeSourcesCache = null;
        throw err;
      });
  }
  return recipeSourcesCache;
}

function readStoredSourceIds(): string[] | null {
  try {
    const raw = localStorage.getItem(RECIPE_SOURCES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : null;
  } catch {
    return null;
  }
}

function writeStoredSourceIds(ids: string[]) {
  try {
    localStorage.setItem(RECIPE_SOURCES_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable (private mode / quota) — selection just won't persist */
  }
}

function describeSourceSelection(sources: RecipeSource[], selectedIds: Set<string>): string {
  if (sources.length === 0) return 'Nalagam strani…';
  if (selectedIds.size === 0) return 'Nobena stran ni izbrana';
  if (selectedIds.size === 1) {
    const only = sources.find((s) => selectedIds.has(s.id));
    return `Samo ${only?.label ?? '1 stran'}`;
  }
  if (selectedIds.size === sources.length) return `Vse strani (${sources.length})`;
  for (const group of SOURCE_GROUPS) {
    const ids = sources.filter((s) => s.group === group).map((s) => s.id);
    if (ids.length === selectedIds.size && ids.every((id) => selectedIds.has(id))) {
      return `${SOURCE_GROUP_LABELS[group]} (${ids.length})`;
    }
  }
  return `${selectedIds.size} strani`;
}

function pluralizeResults(count: number): string {
  const mod100 = count % 100;
  if (mod100 === 1) return 'rezultat';
  if (mod100 === 2) return 'rezultata';
  if (mod100 === 3 || mod100 === 4) return 'rezultati';
  return 'rezultatov';
}

function SourceChip({
  source,
  selected,
  onToggle,
  onOnly,
}: {
  source: RecipeSource;
  selected: boolean;
  onToggle: () => void;
  /** Select just this site (double click / long press). */
  onOnly: () => void;
}) {
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);

  const clearPressTimer = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  useEffect(() => clearPressTimer, []);

  return (
    <button
      type="button"
      aria-pressed={selected}
      title={`${source.domain} — dvojni klik ali dolg pritisk: išči samo tukaj`}
      className={cx(
        'select-none rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-basil/40',
        selected
          ? 'border-basil bg-basil-soft text-basil-deep'
          : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink',
      )}
      style={{ WebkitTouchCallout: 'none' }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        longPressed.current = false;
        clearPressTimer();
        pressTimer.current = window.setTimeout(() => {
          longPressed.current = true;
          onOnly();
        }, LONG_PRESS_MS);
      }}
      onPointerUp={clearPressTimer}
      onPointerLeave={clearPressTimer}
      onPointerCancel={clearPressTimer}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        // The click that follows a completed long press must not undo the "only" selection.
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        onToggle();
      }}
      onDoubleClick={onOnly}
    >
      {source.label}
    </button>
  );
}

function RecipeSourcePicker({
  sources,
  selectedIds,
  onChange,
}: {
  sources: RecipeSource[];
  selectedIds: Set<string>;
  onChange: (ids: Set<string>) => void;
}) {
  const groups = SOURCE_GROUPS.map((group) => ({
    group,
    items: sources.filter((s) => s.group === group),
  }));
  const allIds = sources.map((s) => s.id);
  const isExactly = (ids: string[]) =>
    ids.length === selectedIds.size && ids.every((id) => selectedIds.has(id));
  const presetClassName = (active: boolean) =>
    cx(
      'rounded-lg px-2 py-1 text-[11px] font-medium transition-colors',
      active ? 'bg-paper-deep text-ink' : 'text-ink-muted hover:bg-paper-deep hover:text-ink',
    );
  const groupActionClassName = 'text-[11px] text-ink-muted transition-colors hover:text-ink';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[11px] uppercase tracking-wide text-ink-muted">Hitro</span>
        <button
          type="button"
          className={presetClassName(isExactly(allIds))}
          onClick={() => onChange(new Set(allIds))}
        >
          Vse
        </button>
        {groups.map(({ group, items }) => (
          <button
            key={group}
            type="button"
            className={presetClassName(isExactly(items.map((s) => s.id)))}
            onClick={() => onChange(new Set(items.map((s) => s.id)))}
          >
            {SOURCE_GROUP_LABELS[group]}
          </button>
        ))}
        <button
          type="button"
          className={presetClassName(selectedIds.size === 0)}
          onClick={() => onChange(new Set())}
        >
          Nič
        </button>
      </div>

      {groups.map(({ group, items }) => {
        const groupIds = items.map((s) => s.id);
        const selectedCount = groupIds.filter((id) => selectedIds.has(id)).length;
        return (
          <div key={group} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-ink-soft">
                {SOURCE_GROUP_LABELS[group]}{' '}
                <span className="font-normal text-ink-muted">
                  {selectedCount}/{groupIds.length}
                </span>
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={groupActionClassName}
                  onClick={() => onChange(new Set([...Array.from(selectedIds), ...groupIds]))}
                >
                  vse
                </button>
                <button
                  type="button"
                  className={groupActionClassName}
                  onClick={() => {
                    const next = new Set(selectedIds);
                    for (const id of groupIds) next.delete(id);
                    onChange(next);
                  }}
                >
                  nič
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {items.map((source) => (
                <SourceChip
                  key={source.id}
                  source={source}
                  selected={selectedIds.has(source.id)}
                  onToggle={() => {
                    const next = new Set(selectedIds);
                    if (next.has(source.id)) next.delete(source.id);
                    else next.add(source.id);
                    onChange(next);
                  }}
                  onOnly={() => onChange(new Set([source.id]))}
                />
              ))}
            </div>
          </div>
        );
      })}

      <p className="text-[11px] text-ink-muted">
        Dvojni klik ali dolg pritisk na stran = išči samo na tej strani.
      </p>
    </div>
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
  onSavedImagesChanged,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  savedByUrl: Map<string, SavedRecipe>;
  onAddRecipe: (recipe: ParsedRecipe) => Promise<void>;
  onRemoveRecipe: (id: number) => Promise<void>;
  onSavedImagesChanged: (recipeId: number, imageUrl: string | undefined, images: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RecipeSearchResult[]>([]);
  /** Request in flight and nothing shown yet. */
  const [searching, setSearching] = useState(false);
  /** Request in flight; more results (or translations) may still arrive. */
  const [streaming, setStreaming] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [sources, setSources] = useState<RecipeSource[]>([]);
  const [sourcesError, setSourcesError] = useState(false);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(() => new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<ParsedRecipe | null>(null);
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [fetchingRecipe, setFetchingRecipe] = useState(false);
  const [recipeBusy, setRecipeBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

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

  const cancelSearch = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => cancelSearch, [cancelSearch]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSearched(false);
      setError('');
      setPickerOpen(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    } else {
      cancelSearch();
      setSearching(false);
      setStreaming(false);
    }
  }, [open, cancelSearch]);

  // Load the site catalog once; restore the last selection (or select everything).
  useEffect(() => {
    if (!open || sources.length > 0) return;
    let cancelled = false;
    loadRecipeSources(token)
      .then((list) => {
        if (cancelled) return;
        setSources(list);
        setSourcesError(false);
        const known = new Set(list.map((s) => s.id));
        const stored = readStoredSourceIds()?.filter((id) => known.has(id));
        setSelectedSourceIds(new Set(stored && stored.length > 0 ? stored : Array.from(known)));
      })
      .catch(() => {
        if (!cancelled) setSourcesError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, sources.length]);

  const handleSourcesChange = useCallback((next: Set<string>) => {
    setSelectedSourceIds(next);
    writeStoredSourceIds(Array.from(next));
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (pickerOpen) setPickerOpen(false);
      else onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, pickerOpen, onClose]);

  // The site picker floats over the results; a click anywhere else dismisses it.
  useEffect(() => {
    if (!open || !pickerOpen) return;
    function handlePointerDown(e: PointerEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open, pickerOpen]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const handleSearch = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const q = query.trim();
      // Without a loaded catalog the server searches every site, so allow an empty selection then.
      if (!q || (selectedSourceIds.size === 0 && !sourcesError)) return;

      cancelSearch();
      const controller = new AbortController();
      abortRef.current = controller;

      setSearching(true);
      setStreaming(true);
      setError('');
      setResults([]);
      setSearched(false);
      setPickerOpen(false);
      try {
        const params = new URLSearchParams({ q });
        if (selectedSourceIds.size > 0) params.set('sites', Array.from(selectedSourceIds).join(','));
        const response = await fetch(`/api/recipes/search?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
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
                | { type: 'update'; results: RecipeSearchResult[] }
                | { type: 'done' };
              if (msg.type === 'result') {
                setResults((prev) => [...prev, msg.result]);
                setSearching(false);
              } else if (msg.type === 'update') {
                const byUrl = new Map(msg.results.map((r) => [r.url, r]));
                setResults((prev) => prev.map((r) => byUrl.get(r.url) ?? r));
              }
            } catch {
              /* skip malformed lines */
            }
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Iskanje ni uspelo.');
      } finally {
        // A newer search (or closing the overlay) already owns the state — leave it alone.
        if (abortRef.current === controller) {
          abortRef.current = null;
          setSearching(false);
          setStreaming(false);
          setSearched(true);
        }
      }
    },
    [query, token, selectedSourceIds, sourcesError, cancelSearch],
  );

  const handleOpenRecipe = useCallback(
    async (url: string) => {
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
    },
    [token],
  );

  const selectionSummary = sourcesError
    ? 'Seznama strani ni bilo mogoče naložiti'
    : describeSourceSelection(sources, selectedSourceIds);
  const canSearch =
    Boolean(query.trim()) && (selectedSourceIds.size > 0 || sourcesError) && !searching;

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
          {/* backdrop — the search is a full-screen mode, so it gets solid paper */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-paper"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <AmbientBackground />
          </motion.div>

          {/* close button */}
          <Button
            color="white"
            appearance="transparent"
            icon={<X />}
            iconOnly
            size="sm"
            type="button"
            aria-label="Zapri iskanje"
            className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-20"
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
            <div className="shrink-0 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+3.5rem)] md:px-8">
              <form onSubmit={handleSearch} className="mx-auto max-w-2xl">
                <div className="relative flex items-center gap-2">
                  <Input
                    ref={inputRef}
                    type="search"
                    placeholder="Išči recept… (npr. lazanja)"
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
                    size="lg"
                    icon={<Search />}
                    disabled={!canSearch}
                  >
                    Išči
                  </Button>
                </div>
              </form>

              {/* where-to-search toggle + floating picker */}
              <div ref={pickerRef} className="relative mx-auto mt-2 max-w-2xl">
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-ink"
                  aria-expanded={pickerOpen}
                  onClick={() => setPickerOpen((v) => !v)}
                >
                  <span className="text-ink-muted">Iščem na:</span>
                  <span className="font-medium text-ink-soft">{selectionSummary}</span>
                  <svg
                    viewBox="0 0 16 16"
                    className={cx(
                      'h-3.5 w-3.5 transition-transform duration-200',
                      pickerOpen && 'rotate-180',
                    )}
                    aria-hidden
                  >
                    <path
                      d="M4 6l4 4 4-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                <AnimatePresence>
                  {pickerOpen && sources.length > 0 && (
                    <motion.div
                      key="source-picker"
                      className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[min(60vh,32rem)] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-3 shadow-2xl shadow-ink/20 backdrop-blur-md"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.16, ease: 'easeOut' }}
                    >
                      <RecipeSourcePicker
                        sources={sources}
                        selectedIds={selectedSourceIds}
                        onChange={handleSourcesChange}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
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
                  <div className="rounded-2xl border border-tomato/30 bg-tomato-soft p-4 text-sm text-tomato-deep">
                    {error}
                  </div>
                )}

                {!searching && searched && results.length === 0 && !error && (
                  <div className="py-16 text-center text-sm text-ink-muted">
                    Ni rezultatov za &ldquo;{query}&rdquo;
                  </div>
                )}

                {results.length > 0 && (
                  <>
                    <div className="flex items-center justify-between pb-1">
                      <p className="text-xs text-ink-muted">
                        {results.length} {pluralizeResults(results.length)}
                      </p>
                      {streaming && (
                        <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                          <span className="h-2.5 w-2.5 animate-spin rounded-full border border-ink-faint border-t-basil" />
                          Iščem in prevajam…
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
                    {streaming && (
                      <div className="flex items-center justify-center gap-2 py-4 text-xs text-ink-muted">
                        <span className="h-3 w-3 animate-spin rounded-full border border-ink-faint border-t-basil" />
                        Nalagam še rezultate…
                      </div>
                    )}
                  </>
                )}

                {!searching && !searched && (
                  <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <ReadyToEat size={96} animate />
                    <p className="text-sm text-ink-muted">
                      {selectedSourceIds.size === 0
                        ? 'Izberi vsaj eno stran za iskanje'
                        : 'Vnesi ime jedi ali sestavine'}
                    </p>
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
        recipeId={savedEntry?.id}
        onImagesRefetched={(recipeId, imageUrl, images) => {
          onSavedImagesChanged(recipeId, imageUrl, images);
          setSelectedRecipe((prev) => (prev ? { ...prev, imageUrl, images } : prev));
        }}
        onCoverChanged={(imageUrl) =>
          setSelectedRecipe((prev) => (prev ? { ...prev, imageUrl } : prev))
        }
      />
      {/* Loading overlay for recipe fetch */}
      {fetchingRecipe &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: 'rgba(251,247,240,0.7)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
              }}
            />
            <div className="relative z-10 rounded-2xl border border-line bg-surface px-8 py-6 shadow-2xl">
              <AnimatedStepsLoader
                steps={[
                  'Odpiram stran recepta…',
                  'Berem sestavine in postopek…',
                  'Pripravljam prikaz recepta…',
                ]}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function SavedRecipeCard({
  recipe,
  labels,
  onClick,
}: {
  recipe: SavedRecipe;
  labels: RecipeLabel[];
  onClick: () => void;
}) {
  const recipeLabels = recipe.labelIds
    .map((id) => labels.find((l) => l.id === id))
    .filter((l): l is RecipeLabel => Boolean(l));
  const [imgBroken, setImgBroken] = useState(false);
  useEffect(() => setImgBroken(false), [recipe.imageUrl]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface text-left transition-all duration-200 hover:border-basil/50 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-basil/40"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-paper-deep">
        {recipe.imageUrl && !imgBroken ? (
          <img
            src={recipe.imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgBroken(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-ink-faint">
            Ni slike
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5 p-3">
        <p className="line-clamp-2 text-sm font-semibold text-ink group-hover:text-ink">
          {recipe.title}
        </p>
        <SourceBadge source={recipe.source} />
        {recipeLabels.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {recipeLabels.map((label) => (
              <RecipeLabelBadge key={label.id} name={label.name} color={label.color} size="sm" />
            ))}
          </div>
        )}
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
  const [labels, setLabels] = useState<RecipeLabel[]>([]);
  const [filterLabelId, setFilterLabelId] = useState<number | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/recipes/labels', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const data = (await response.json()) as { labels: RecipeLabel[] };
        if (!cancelled) setLabels(data.labels);
      } catch {
        /* ignore */
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
      setSavedRecipes((prev) => [
        data.recipe,
        ...prev.filter((r) => r.id !== data.recipe.id && r.url !== data.recipe.url),
      ]);
    },
    [token],
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
    [token],
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

  const handleLabelsChange = useCallback((recipeId: number, newLabelIds: number[]) => {
    setSavedRecipes((prev) =>
      prev.map((r) => (r.id === recipeId ? { ...r, labelIds: newLabelIds } : r)),
    );
    setSelectedSaved((prev) =>
      prev && prev.id === recipeId ? { ...prev, labelIds: newLabelIds } : prev,
    );
  }, []);

  const handleImagesRefetched = useCallback(
    (recipeId: number, imageUrl: string | undefined, images: string[]) => {
      setSavedRecipes((prev) =>
        prev.map((r) => (r.id === recipeId ? { ...r, imageUrl, images } : r)),
      );
      setSelectedSaved((prev) =>
        prev && prev.id === recipeId ? { ...prev, imageUrl, images } : prev,
      );
    },
    [],
  );

  const handleContentUpdated = useCallback(
    (recipeId: number, ingredients: string[], instructions: string[]) => {
      setSavedRecipes((prev) =>
        prev.map((r) => (r.id === recipeId ? { ...r, ingredients, instructions } : r)),
      );
      setSelectedSaved((prev) =>
        prev && prev.id === recipeId ? { ...prev, ingredients, instructions } : prev,
      );
    },
    [],
  );

  const filteredRecipes = useMemo(() => {
    if (!filterLabelId) return savedRecipes;
    return savedRecipes.filter((r) => r.labelIds.includes(filterLabelId));
  }, [savedRecipes, filterLabelId]);

  return (
    <>
      <AppHeader title="Recepti" authUser={authUser} onLogout={onLogout} />

      {loadingSaved ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <AnimatedStepsLoader steps={['Nalagam vaše shranjene recepte…']} />
        </div>
      ) : savedRecipes.length > 0 ? (
        <section className="flex flex-col gap-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 text-base font-semibold tracking-tight text-ink">
              Moji recepti <span className="font-normal text-ink-muted">{savedRecipes.length}</span>
            </h2>
          </div>
          {labels.length > 0 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
              {labels.map((label) => (
                <RecipeLabelBadge
                  key={label.id}
                  name={label.name}
                  color={label.color}
                  dot
                  active={filterLabelId === label.id}
                  onClick={() => setFilterLabelId(filterLabelId === label.id ? null : label.id)}
                  className="shrink-0"
                />
              ))}
            </div>
          )}
          {filterLabelId && filteredRecipes.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Sad size={72} animate colors="primary:#8b7c6d,secondary:#8b7c6d" />
              <p className="m-0 text-sm text-ink-muted">Ni receptov z izbrano oznako.</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {filteredRecipes.map((recipe) => (
              <SavedRecipeCard
                key={recipe.id}
                recipe={recipe}
                labels={labels}
                onClick={() => {
                  setSelectedSaved(recipe);
                  setSavedModalOpen(true);
                }}
              />
            ))}
          </div>
        </section>
      ) : (
        <section className="mt-4 flex flex-col items-center gap-4 rounded-3xl border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center">
          <ReadyToEat size={88} animate colors="primary:#2e7a4c,secondary:#ef8a2c" />
          <div className="space-y-2">
            <h2 className="m-0 text-lg font-semibold tracking-tight text-ink">Tvoja kuharska knjiga je prazna</h2>
            <p className="m-0 max-w-xs text-sm text-ink-muted">
              Poišči recepte na slovenskih in svetovnih straneh, shrani najboljše in sestavine pošlji na
              nakupovalni seznam.
            </p>
          </div>
          <Button size="md" icon={<Search />} onClick={() => setSearchOpen(true)}>
            Poišči recept
          </Button>
        </section>
      )}

      <Fab icon={<Search animateOnHover />} label="Išči recepte" extended onClick={() => setSearchOpen(true)} />

      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        token={token}
        savedByUrl={savedByUrl}
        onAddRecipe={addRecipe}
        onRemoveRecipe={removeRecipe}
        onSavedImagesChanged={handleImagesRefetched}
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
        recipeId={selectedSaved?.id}
        labels={labels}
        labelIds={selectedSaved?.labelIds}
        onLabelsChange={handleLabelsChange}
        onImagesRefetched={handleImagesRefetched}
        onContentUpdated={handleContentUpdated}
      />
    </>
  );
}
