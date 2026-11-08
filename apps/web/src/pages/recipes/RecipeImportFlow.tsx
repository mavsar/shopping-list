import { cx } from 'class-variance-authority';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RecipeLabelBadge, type RecipeLabel } from '../../components/RecipeLabelBadge';
import {
  Camera,
  ChevronDown,
  Edit,
  Plus,
  ReadyToEat,
  Sad,
  Trash2,
  X,
} from '../../components/lordicon/icons';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/fields/checkbox';
import { Input } from '../../components/ui/fields/input';
import { Textarea } from '../../components/ui/fields/textarea';
import {
  composeDescriptions,
  filesToPages,
  mergeDuplicateRecipes,
  sourceFromFileName,
  streamRecipeImport,
  type ImportedRecipe,
} from './recipe-import';
import { BulkEditDialog, BulkLabelDialog } from './RecipeBulkDialogs';
import type { SavedRecipe } from './types';

export type ImportKind = 'file' | 'camera';

/** An imported recipe while the user reviews it; arrays are edited as one line per entry. */
interface RecipeDraft {
  key: string;
  title: string;
  description: string;
  servings: string;
  prepTime: string;
  cookTime: string;
  totalTime: string;
  ingredients: string[];
  instructions: string[];
  imageUrl?: string;
  images: string[];
  source: string;
  labelIds: number[];
  page: number;
  /** Raw pieces of the description until reading finishes (see composeDescriptions). */
  tips: string[];
  nutrition?: string;
}

type Phase =
  | { name: 'staging' }
  | { name: 'preparing'; done: number; total: number }
  | { name: 'reading'; processed: number; total: number }
  | { name: 'review' }
  | { name: 'saving' }
  | { name: 'empty' }
  | { name: 'error'; message: string };

let draftCounter = 0;

function toDraft(recipe: ImportedRecipe): RecipeDraft {
  draftCounter += 1;
  return {
    key: `draft-${draftCounter}`,
    title: recipe.title,
    description: recipe.description ?? '',
    servings: recipe.servings ?? '',
    prepTime: recipe.prepTime ?? '',
    cookTime: recipe.cookTime ?? '',
    totalTime: recipe.totalTime ?? '',
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    imageUrl: recipe.imageUrl,
    images: recipe.images,
    source: '',
    labelIds: [],
    page: recipe.page,
    tips: recipe.tips ?? [],
    nutrition: recipe.nutrition,
  };
}

function pluralizeRecipes(count: number): string {
  const mod100 = count % 100;
  if (mod100 === 1) return 'recept';
  if (mod100 === 2) return 'recepta';
  if (mod100 === 3 || mod100 === 4) return 'recepte';
  return 'receptov';
}

function pluralizeRecipesNominative(count: number): string {
  const mod100 = count % 100;
  if (mod100 === 1) return 'recept';
  if (mod100 === 2) return 'recepta';
  if (mod100 === 3 || mod100 === 4) return 'recepti';
  return 'receptov';
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-paper-deep">
      <motion.div
        className="h-full rounded-full bg-basil"
        initial={false}
        animate={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 24 }}
      />
    </div>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        'inline-block h-3 w-3 animate-spin rounded-full border border-ink-faint border-t-basil',
        className,
      )}
    />
  );
}

// ---------- One recipe in the review list ----------

function LinesField({
  label,
  hint,
  value,
  onChange,
  rows,
}: {
  label: string;
  hint: string;
  value: string[];
  onChange: (next: string[]) => void;
  rows: number;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-baseline justify-between gap-2 text-xs font-medium text-ink-muted">
        {label}
        <span className="font-normal text-ink-faint">{hint}</span>
      </span>
      <Textarea
        value={value.join('\n')}
        rows={rows}
        onChange={(event) => onChange(event.target.value.split('\n'))}
      />
    </label>
  );
}

function DraftCard({
  draft,
  labels,
  selected,
  expanded,
  onSelectedChange,
  onExpandedChange,
  onChange,
  onRemove,
  onToggleLabel,
}: {
  draft: RecipeDraft;
  labels: RecipeLabel[];
  selected: boolean;
  expanded: boolean;
  onSelectedChange: (selected: boolean) => void;
  onExpandedChange: (expanded: boolean) => void;
  onChange: (patch: Partial<RecipeDraft>) => void;
  onRemove: () => void;
  onToggleLabel: (labelId: number) => void;
}) {
  const [coverBroken, setCoverBroken] = useState(false);
  useEffect(() => setCoverBroken(false), [draft.imageUrl]);

  const ingredientCount = draft.ingredients.filter(
    (line) => line.trim() && !line.trim().endsWith(':'),
  ).length;
  const stepCount = draft.instructions.filter((line) => line.trim()).length;
  const meta = [
    draft.servings,
    `${ingredientCount} ${ingredientCount === 1 ? 'sestavina' : ingredientCount === 2 ? 'sestavini' : ingredientCount <= 4 ? 'sestavine' : 'sestavin'}`,
    `${stepCount} ${stepCount === 1 ? 'korak' : stepCount === 2 ? 'koraka' : stepCount <= 4 ? 'koraki' : 'korakov'}`,
    draft.totalTime,
  ].filter(Boolean);
  const draftLabels = draft.labelIds
    .map((id) => labels.find((label) => label.id === id))
    .filter((label): label is RecipeLabel => Boolean(label));

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -24, transition: { duration: 0.16 } }}
      className={cx(
        'list-none overflow-hidden rounded-2xl border bg-surface transition-colors',
        selected ? 'border-basil/60 shadow-card' : 'border-line',
      )}
    >
      <div className="flex items-start gap-3 p-3">
        <div className="pt-1">
          <Checkbox
            checked={selected}
            onCheckedChange={onSelectedChange}
            aria-label={`Izberi recept ${draft.title || 'brez imena'}`}
          />
        </div>
        <button
          type="button"
          onClick={() => onExpandedChange(!expanded)}
          className="flex min-w-0 flex-1 cursor-pointer gap-3 text-left focus-visible:outline-none"
          aria-expanded={expanded}
        >
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-line bg-paper-deep">
            {draft.imageUrl && !coverBroken ? (
              <img
                src={draft.imageUrl}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setCoverBroken(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[10px] text-ink-faint">
                Ni slike
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p
              className={cx(
                'm-0 line-clamp-2 text-sm font-semibold',
                draft.title.trim() ? 'text-ink' : 'text-tomato-deep',
              )}
            >
              {draft.title.trim() || 'Recept brez imena'}
            </p>
            <p className="m-0 truncate text-xs text-ink-muted">{meta.join(' · ')}</p>
            {draftLabels.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {draftLabels.map((label) => (
                  <RecipeLabelBadge
                    key={label.id}
                    name={label.name}
                    color={label.color}
                    size="sm"
                  />
                ))}
              </div>
            )}
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            color="white"
            appearance="transparent"
            size="sm"
            iconOnly
            icon={expanded ? <ChevronDown /> : <Edit />}
            aria-label={expanded ? 'Skrij urejanje' : 'Uredi recept'}
            className={cx(expanded && 'rotate-180')}
            onClick={() => onExpandedChange(!expanded)}
          />
          <Button
            type="button"
            color="danger"
            appearance="transparent"
            size="sm"
            iconOnly
            icon={<Trash2 />}
            aria-label="Odstrani recept iz uvoza"
            onClick={onRemove}
          />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="editor"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-line px-3 pb-4 pt-3">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-ink-muted">Ime recepta</span>
                <Input
                  value={draft.title}
                  invalid={!draft.title.trim()}
                  onChange={(event) => onChange({ title: event.target.value })}
                />
              </label>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-ink-muted">Porcije</span>
                  <Input
                    value={draft.servings}
                    placeholder="npr. 4 osebe"
                    onChange={(event) => onChange({ servings: event.target.value })}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-ink-muted">Priprava</span>
                  <Input
                    value={draft.prepTime}
                    placeholder="15 min"
                    onChange={(event) => onChange({ prepTime: event.target.value })}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-ink-muted">Kuhanje</span>
                  <Input
                    value={draft.cookTime}
                    placeholder="20 min"
                    onChange={(event) => onChange({ cookTime: event.target.value })}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-ink-muted">Skupaj</span>
                  <Input
                    value={draft.totalTime}
                    placeholder="35 min"
                    onChange={(event) => onChange({ totalTime: event.target.value })}
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-ink-muted">
                  Opis, namigi, hranilna vrednost
                </span>
                <Textarea
                  value={draft.description}
                  rows={3}
                  onChange={(event) => onChange({ description: event.target.value })}
                />
              </label>

              <LinesField
                label="Sestavine"
                hint="ena v vrstici · skupina z dvopičjem, npr. Omaka:"
                rows={Math.min(12, Math.max(4, draft.ingredients.length + 1))}
                value={draft.ingredients}
                onChange={(ingredients) => onChange({ ingredients })}
              />
              <LinesField
                label="Postopek"
                hint="en korak v vrstici · skupina z dvopičjem"
                rows={Math.min(12, Math.max(4, draft.instructions.length + 2))}
                value={draft.instructions}
                onChange={(instructions) => onChange({ instructions })}
              />

              <label className="block space-y-1">
                <span className="text-xs font-medium text-ink-muted">Vir</span>
                <Input
                  value={draft.source}
                  onChange={(event) => onChange({ source: event.target.value })}
                />
              </label>

              {labels.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-ink-muted">Oznake</span>
                  <div className="flex flex-wrap gap-1">
                    {labels.map((label) => (
                      <RecipeLabelBadge
                        key={label.id}
                        name={label.name}
                        color={label.color}
                        dot
                        active={draft.labelIds.includes(label.id)}
                        onClick={() => onToggleLabel(label.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {draft.images.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-ink-muted">
                    Slike — klik izbere naslovno
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {draft.images.map((image) => {
                      const isCover = image === draft.imageUrl;
                      return (
                        <div key={image} className="relative">
                          <button
                            type="button"
                            onClick={() => onChange({ imageUrl: image })}
                            aria-label={isCover ? 'Naslovna slika' : 'Nastavi kot naslovno sliko'}
                            className={cx(
                              'block h-20 w-20 overflow-hidden rounded-xl border-2 transition focus-visible:outline-none',
                              isCover
                                ? 'border-basil'
                                : 'border-transparent hover:border-line-strong',
                            )}
                          >
                            <img src={image} alt="" className="h-full w-full object-cover" />
                          </button>
                          <button
                            type="button"
                            aria-label="Odstrani sliko"
                            onClick={() => {
                              const images = draft.images.filter((entry) => entry !== image);
                              onChange({ images, imageUrl: isCover ? images[0] : draft.imageUrl });
                            }}
                            className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-ink-muted shadow-card transition hover:bg-tomato-soft hover:text-tomato-deep"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

// ---------- The flow ----------

export function RecipeImportFlow({
  token,
  kind,
  initialFiles,
  labels,
  onLabelCreated,
  onSaved,
  onDirtyChange,
  onRestart,
}: {
  token: string;
  kind: ImportKind;
  initialFiles: File[];
  labels: RecipeLabel[];
  onLabelCreated: (label: RecipeLabel) => void;
  onSaved: (recipes: SavedRecipe[]) => void;
  /** True while there is reading in progress or reviewed recipes that would be lost. */
  onDirtyChange: (dirty: boolean) => void;
  /** Back to choosing how to add recipes. */
  onRestart: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(() =>
    kind === 'camera' ? { name: 'staging' } : { name: 'preparing', done: 0, total: 0 },
  );
  const [photos, setPhotos] = useState<File[]>(() => (kind === 'camera' ? initialFiles : []));
  const [drafts, setDrafts] = useState<RecipeDraft[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saveError, setSaveError] = useState('');
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const photoPreviews = useMemo(() => photos.map((file) => URL.createObjectURL(file)), [photos]);
  useEffect(() => () => photoPreviews.forEach((url) => URL.revokeObjectURL(url)), [photoPreviews]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const dirty =
    phase.name === 'preparing' ||
    phase.name === 'reading' ||
    phase.name === 'saving' ||
    (phase.name === 'review' && drafts.length > 0) ||
    (phase.name === 'staging' && photos.length > 0);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const run = useCallback(
    async (files: File[]) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setDrafts([]);
      setSelectedKeys(new Set());
      setExpandedKeys(new Set());
      setWarnings([]);
      setPhase({ name: 'preparing', done: 0, total: 0 });

      try {
        const { pages, truncated } = await filesToPages(
          files,
          (done, total) => {
            if (!controller.signal.aborted) setPhase({ name: 'preparing', done, total });
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (truncated)
          setWarnings((prev) => [...prev, `Prebranih bo le prvih ${pages.length} strani.`]);
        setPhase({ name: 'reading', processed: 0, total: pages.length });

        let documentTitle: string | undefined;
        let fatal = '';
        let found = 0;
        await streamRecipeImport(token, pages, controller.signal, (message) => {
          if (message.type === 'progress') {
            setPhase({
              name: 'reading',
              processed: message.processedPages,
              total: message.totalPages,
            });
          } else if (message.type === 'recipes') {
            setPhase((prev) =>
              prev.name === 'reading'
                ? { ...prev, processed: Math.max(prev.processed, message.processedPages) }
                : prev,
            );
            found += message.recipes.length;
            if (message.recipes.length > 0) {
              setDrafts((prev) =>
                [...prev, ...message.recipes.map(toDraft)].sort((a, b) => a.page - b.page),
              );
            }
          } else if (message.type === 'warning') {
            setWarnings((prev) => [...prev, message.warning]);
          } else if (message.type === 'error') {
            fatal = message.error;
          } else if (message.type === 'done') {
            documentTitle = message.documentTitle;
          }
        });
        if (controller.signal.aborted) return;
        if (fatal) {
          setPhase({ name: 'error', message: fatal });
          return;
        }

        const source =
          documentTitle?.trim() ||
          (kind === 'camera'
            ? 'Fotografija'
            : sourceFromFileName(files[0]?.name ?? '') || 'Uvožena datoteka');
        setDrafts((all) => {
          const prev = mergeDuplicateRecipes(all);
          const descriptions = composeDescriptions(prev);
          return prev.map((draft, index) => ({
            ...draft,
            description: descriptions[index] ?? draft.description,
            source: draft.source || source,
          }));
        });
        setPhase(found > 0 ? { name: 'review' } : { name: 'empty' });
      } catch (error) {
        if (controller.signal.aborted) return;
        setPhase({
          name: 'error',
          message: error instanceof Error ? error.message : 'Branje ni uspelo.',
        });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [kind, token],
  );

  // A picked file is read right away; photos wait until the user has taken them all.
  // The effect owns its run: cleanup cancels it, and a remount (StrictMode in dev) starts
  // a fresh one instead of leaving the cancelled run's progress screen behind.
  useEffect(() => {
    if (kind !== 'file' || initialFiles.length === 0) return;
    void run(initialFiles);
    return () => abortRef.current?.abort();
  }, [kind, initialFiles, run]);

  const selectedDrafts = useMemo(
    () => drafts.filter((draft) => selectedKeys.has(draft.key)),
    [drafts, selectedKeys],
  );
  const allSelected = drafts.length > 0 && selectedDrafts.length === drafts.length;
  const invalidCount = drafts.filter((draft) => !draft.title.trim()).length;

  function updateDraft(key: string, patch: Partial<RecipeDraft>) {
    setDrafts((prev) => prev.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
  }

  function removeDrafts(keys: Set<string>) {
    setDrafts((prev) => prev.filter((draft) => !keys.has(draft.key)));
    setSelectedKeys((prev) => new Set([...prev].filter((key) => !keys.has(key))));
    setExpandedKeys((prev) => new Set([...prev].filter((key) => !keys.has(key))));
  }

  function toggleLabelOnSelected(labelId: number, add: boolean) {
    setDrafts((prev) =>
      prev.map((draft) => {
        if (!selectedKeys.has(draft.key)) return draft;
        const has = draft.labelIds.includes(labelId);
        if (add && !has) return { ...draft, labelIds: [...draft.labelIds, labelId] };
        if (!add && has)
          return { ...draft, labelIds: draft.labelIds.filter((id) => id !== labelId) };
        return draft;
      }),
    );
  }

  async function handleSave() {
    if (drafts.length === 0 || invalidCount > 0) return;
    setSaveError('');
    setPhase({ name: 'saving' });
    const clean = (value: string) => value.trim() || undefined;
    try {
      const response = await fetch('/api/recipes/saved/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipes: drafts.map((draft) => ({
            title: draft.title.trim(),
            source: clean(draft.source),
            description: clean(draft.description),
            servings: clean(draft.servings),
            prepTime: clean(draft.prepTime),
            cookTime: clean(draft.cookTime),
            totalTime: clean(draft.totalTime),
            ingredients: draft.ingredients.map((line) => line.trim()).filter(Boolean),
            instructions: draft.instructions.map((line) => line.trim()).filter(Boolean),
            imageUrl: draft.imageUrl,
            images: draft.images,
            labelIds: draft.labelIds,
          })),
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Napaka ${response.status}`);
      }
      const data = (await response.json()) as { recipes: SavedRecipe[] };
      onDirtyChange(false);
      onSaved(data.recipes);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? `Shranjevanje ni uspelo: ${error.message}`
          : 'Shranjevanje ni uspelo.',
      );
      setPhase({ name: 'review' });
    }
  }

  const cameraInput = (
    <input
      ref={cameraInputRef}
      type="file"
      accept="image/*"
      capture="environment"
      className="hidden"
      onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = '';
        if (files.length > 0) setPhotos((prev) => [...prev, ...files]);
      }}
    />
  );

  // ----- staging (camera) -----
  if (phase.name === 'staging') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {cameraInput}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 md:px-8">
          <div className="mx-auto max-w-2xl space-y-4">
            <div>
              <h2 className="m-0 text-lg font-semibold tracking-tight text-ink">
                Fotografije receptov
              </h2>
              <p className="m-0 mt-1 text-sm text-ink-muted">
                Ena fotografija lahko vsebuje več receptov. Če se recept nadaljuje na naslednji
                strani, fotografiraj še to.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {photoPreviews.map((url, index) => (
                <div
                  key={url}
                  className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-line bg-paper-deep"
                >
                  <img
                    src={url}
                    alt={`Fotografija ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-ink/70 px-2 py-0.5 text-[10px] font-semibold text-white">
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    aria-label="Odstrani fotografijo"
                    onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== index))}
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-surface/90 text-ink-muted shadow-card transition hover:bg-tomato-soft hover:text-tomato-deep"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-surface/60 text-xs font-medium text-ink-muted transition hover:border-basil/60 hover:text-basil-deep"
              >
                <Camera size={28} />
                {photos.length === 0 ? 'Fotografiraj' : 'Še ena'}
              </button>
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t border-line bg-paper/90 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur md:px-8">
          <div className="mx-auto flex max-w-2xl gap-2">
            <Button type="button" color="white" appearance="outline" size="md" onClick={onRestart}>
              Nazaj
            </Button>
            <Button
              type="button"
              color="gradient"
              appearance="full"
              size="md"
              className="flex-1"
              disabled={photos.length === 0}
              onClick={() => void run(photos)}
            >
              Preberi recepte{photos.length > 0 ? ` (${photos.length})` : ''}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ----- preparing / reading -----
  if (phase.name === 'preparing' || phase.name === 'reading') {
    const isPreparing = phase.name === 'preparing';
    const progress = isPreparing
      ? phase.total > 0
        ? phase.done / phase.total
        : 0
      : phase.total > 0
        ? phase.processed / phase.total
        : 0;
    return (
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8 md:px-8">
        <div className="mx-auto flex max-w-md flex-col items-center gap-5 py-12 text-center">
          <ReadyToEat size={88} animate />
          <div className="space-y-1">
            <p className="m-0 text-base font-semibold text-ink">
              {isPreparing ? 'Pripravljam strani…' : 'Berem recepte…'}
            </p>
            <p className="m-0 text-sm text-ink-muted">
              {isPreparing
                ? phase.total > 0
                  ? `Stran ${phase.done} od ${phase.total}`
                  : 'Odpiram datoteko'
                : `Prebranih ${phase.processed} od ${phase.total} strani · najdenih ${drafts.length} ${pluralizeRecipesNominative(drafts.length)}`}
            </p>
          </div>
          <ProgressBar value={isPreparing ? progress * 0.15 : 0.15 + progress * 0.85} />
          {!isPreparing && (
            <p className="m-0 text-xs text-ink-faint">
              Sestavine, postopek, porcije in slike se berejo hkrati. Daljše datoteke trajajo minuto
              ali dve.
            </p>
          )}
          {drafts.length > 0 && (
            <ul className="m-0 w-full space-y-1.5 p-0 text-left">
              <AnimatePresence initial={false}>
                {drafts.map((draft) => (
                  <motion.li
                    key={draft.key}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex list-none items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2"
                  >
                    {draft.imageUrl ? (
                      <img
                        src={draft.imageUrl}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="h-8 w-8 shrink-0 rounded-lg bg-paper-deep" />
                    )}
                    <span className="truncate text-sm text-ink-soft">{draft.title}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    );
  }

  // ----- empty / error -----
  if (phase.name === 'empty' || phase.name === 'error') {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 md:px-8">
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
          <Sad size={80} animate colors="primary:#8b7c6d,secondary:#8b7c6d" />
          <p className="m-0 text-base font-semibold text-ink">
            {phase.name === 'empty' ? 'Ni najdenih receptov' : 'Branje ni uspelo'}
          </p>
          <p className="m-0 text-sm text-ink-muted">
            {phase.name === 'empty'
              ? 'V datoteki ni bilo mogoče najti receptov. Poskusi z ostrejšo fotografijo ali drugo datoteko.'
              : phase.message}
          </p>
          <div className="flex gap-2">
            <Button type="button" color="white" appearance="outline" size="md" onClick={onRestart}>
              Izberi drugo
            </Button>
            {phase.name === 'error' && (
              <Button
                type="button"
                color="gradient"
                appearance="full"
                size="md"
                onClick={() => void run(kind === 'camera' ? photos : initialFiles)}
              >
                Poskusi znova
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ----- review / saving -----
  const saving = phase.name === 'saving';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 md:px-8">
        <div className="mx-auto max-w-2xl space-y-3">
          <div>
            <h2 className="m-0 text-lg font-semibold tracking-tight text-ink">
              Prebrano: {drafts.length} {pluralizeRecipesNominative(drafts.length)}
            </h2>
            <p className="m-0 mt-1 text-sm text-ink-muted">
              Preglej in po potrebi popravi recepte. Izberi več receptov za skupne oznake, urejanje
              ali odstranjevanje.
            </p>
          </div>

          {warnings.map((warning) => (
            <div
              key={warning}
              className="rounded-2xl border border-carrot/30 bg-carrot-soft px-3 py-2 text-xs text-ink-soft"
            >
              {warning}
            </div>
          ))}

          {/* selection toolbar */}
          <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface/95 px-3 py-2 shadow-card backdrop-blur">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(checked) =>
                setSelectedKeys(checked ? new Set(drafts.map((draft) => draft.key)) : new Set())
              }
            >
              {selectedDrafts.length > 0 ? `Izbranih ${selectedDrafts.length}` : 'Izberi vse'}
            </Checkbox>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                color="white"
                appearance="outline"
                size="xs"
                disabled={selectedDrafts.length === 0 || saving}
                onClick={() => setLabelDialogOpen(true)}
              >
                Oznake
              </Button>
              <Button
                type="button"
                color="white"
                appearance="outline"
                size="xs"
                disabled={selectedDrafts.length === 0 || saving}
                onClick={() => setBulkEditOpen(true)}
              >
                Uredi
              </Button>
              <Button
                type="button"
                color="danger"
                appearance="outline"
                size="xs"
                disabled={selectedDrafts.length === 0 || saving}
                onClick={() => removeDrafts(new Set(selectedKeys))}
              >
                Odstrani
              </Button>
            </div>
          </div>

          {drafts.length === 0 ? (
            <div className="py-12 text-center text-sm text-ink-muted">
              Odstranil si vse recepte iz uvoza.
            </div>
          ) : (
            <ul className="m-0 space-y-2 p-0">
              <AnimatePresence initial={false}>
                {drafts.map((draft) => (
                  <DraftCard
                    key={draft.key}
                    draft={draft}
                    labels={labels}
                    selected={selectedKeys.has(draft.key)}
                    expanded={expandedKeys.has(draft.key)}
                    onSelectedChange={(checked) =>
                      setSelectedKeys((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(draft.key);
                        else next.delete(draft.key);
                        return next;
                      })
                    }
                    onExpandedChange={(open) =>
                      setExpandedKeys((prev) => {
                        const next = new Set(prev);
                        if (open) next.add(draft.key);
                        else next.delete(draft.key);
                        return next;
                      })
                    }
                    onChange={(patch) => updateDraft(draft.key, patch)}
                    onRemove={() => removeDrafts(new Set([draft.key]))}
                    onToggleLabel={(labelId) =>
                      updateDraft(draft.key, {
                        labelIds: draft.labelIds.includes(labelId)
                          ? draft.labelIds.filter((id) => id !== labelId)
                          : [...draft.labelIds, labelId],
                      })
                    }
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-line bg-paper/90 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur md:px-8">
        <div className="mx-auto max-w-2xl space-y-2">
          {saveError && <p className="m-0 text-xs text-tomato-deep">{saveError}</p>}
          {invalidCount > 0 && (
            <p className="m-0 text-xs text-tomato-deep">
              {invalidCount === 1
                ? 'En recept nima imena.'
                : `${invalidCount} receptov nima imena.`}{' '}
              Dodaj ime ali ga odstrani.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              color="white"
              appearance="outline"
              size="md"
              disabled={saving}
              onClick={onRestart}
            >
              Prekliči
            </Button>
            <Button
              type="button"
              color="gradient"
              appearance="full"
              size="md"
              className="flex-1"
              icon={saving ? <Spinner className="border-white/40 border-t-white" /> : <Plus />}
              disabled={drafts.length === 0 || invalidCount > 0 || saving}
              onClick={() => void handleSave()}
            >
              {saving ? 'Shranjujem…' : `Dodaj ${drafts.length} ${pluralizeRecipes(drafts.length)}`}
            </Button>
          </div>
        </div>
      </div>

      <BulkLabelDialog
        open={labelDialogOpen}
        onClose={() => setLabelDialogOpen(false)}
        token={token}
        labels={labels}
        selected={selectedDrafts}
        onLabelCreated={onLabelCreated}
        onToggle={toggleLabelOnSelected}
      />
      <BulkEditDialog
        open={bulkEditOpen}
        onClose={() => setBulkEditOpen(false)}
        count={selectedDrafts.length}
        onApply={(changes) =>
          setDrafts((prev) =>
            prev.map((draft) => (selectedKeys.has(draft.key) ? { ...draft, ...changes } : draft)),
          )
        }
      />
    </div>
  );
}
