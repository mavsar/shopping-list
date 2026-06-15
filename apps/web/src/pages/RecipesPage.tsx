import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppHeader } from '../components/AppHeader';
import { Plus, Search, Trash2, X } from '../components/lordicon/icons';
import { Button } from '../components/ui/button';
import { Dialog } from '../components/ui/dialog';
import { Input } from '../components/ui/fields/input';
import type { AuthUser } from '../types/auth';

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

function RecipeDetailModal({
  recipe,
  open,
  onClose,
  saved,
  busy = false,
  onAdd,
  onRemove,
}: {
  recipe: ParsedRecipe | null;
  open: boolean;
  onClose: () => void;
  saved: boolean;
  busy?: boolean;
  onAdd?: () => void;
  onRemove?: () => void;
}) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setExpandedImage(null);
  }, [open]);

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
              <div className="flex flex-col items-center rounded-xl border border-white/10 bg-white/4 px-4 py-2 text-center">
                <span className="text-[10px] uppercase tracking-widest text-slate-500">Porcije</span>
                <span className="text-sm font-semibold text-slate-200">{recipe.servings}</span>
              </div>
            )}
          </div>
        )}

        {recipe.ingredients.length > 0 && (
          <section>
            <h4 className="mb-2.5 text-sm font-semibold uppercase tracking-widest text-slate-400">
              Sestavine
            </h4>
            <ul className="space-y-1.5">
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-slate-300">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400/70" />
                  {ing}
                </li>
              ))}
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
  );
}

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
    setError('');
    setResults([]);
    try {
      const response = await fetch(`/api/recipes/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Napaka ${response.status}`);
      }
      const data = (await response.json()) as { results: RecipeSearchResult[] };
      setResults(data.results);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Iskanje ni uspelo.');
      setSearched(true);
    } finally {
      setSearching(false);
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
                {searching && (
                  <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <span className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
                    <p className="text-sm text-slate-400">Iščem recepte…</p>
                    <p className="text-xs text-slate-500">To lahko traja 10–15 sekund</p>
                  </div>
                )}

                {fetchingRecipe && !recipeModalOpen && (
                  <div className="flex items-center justify-center py-4">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
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

                {!searching && results.length > 0 && (
                  <>
                    <p className="pb-1 text-xs text-slate-500">
                      {results.length} {results.length === 1 ? 'rezultat' : 'rezultati'}
                    </p>
                    {results.map((result, i) => (
                      <RecipeResultCard
                        key={i}
                        result={result}
                        onClick={() => void handleOpenRecipe(result.url)}
                      />
                    ))}
                  </>
                )}

                {!searching && !searched && (
                  <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                      <Search size={32} animate />
                    </div>
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
      />
      {/* Loading overlay for recipe fetch */}
      {fetchingRecipe && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(2,6,23,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          />
          <div className="relative z-10 flex flex-col items-center gap-3">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
            <p className="text-sm text-slate-300">Nalagam recept…</p>
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
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
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
      />
    </>
  );
}
