import { cx } from 'class-variance-authority';
import { useEffect, useState } from 'react';
import {
  RECIPE_LABEL_COLORS,
  RecipeLabelBadge,
  type RecipeLabel,
} from '../../components/RecipeLabelBadge';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Input } from '../../components/ui/fields/input';

/** Fields that can be set on many recipes at once. */
export interface BulkRecipeChanges {
  servings?: string;
  source?: string;
  totalTime?: string;
}

// ---------- Label picker shared by the bulk dialog ----------

export function CreateLabelForm({
  token,
  onCreated,
}: {
  token: string;
  onCreated: (label: RecipeLabel) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(RECIPE_LABEL_COLORS[0]!);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/recipes/labels', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, color }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        label?: RecipeLabel;
        error?: string;
      };
      if (!response.ok || !data.label) {
        setError(data.error ?? 'Oznake ni bilo mogoče ustvariti.');
        return;
      }
      onCreated(data.label);
      setName('');
    } catch {
      setError('Oznake ni bilo mogoče ustvariti.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2.5 rounded-2xl border border-line bg-paper/60 p-3">
      <p className="m-0 text-xs font-semibold uppercase tracking-widest text-ink-muted">
        Nova oznaka
      </p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void handleCreate();
        }}
      >
        <Input
          value={name}
          maxLength={50}
          placeholder="npr. Hitro kosilo"
          onChange={(event) => setName(event.target.value)}
          className="flex-1"
          aria-label="Ime nove oznake"
        />
        <Button
          type="submit"
          size="md"
          color="gradient"
          appearance="full"
          disabled={!name.trim() || saving}
        >
          {saving ? 'Ustvarjam…' : 'Ustvari'}
        </Button>
      </form>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Barva oznake">
        {RECIPE_LABEL_COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            role="radio"
            aria-checked={swatch === color}
            aria-label={`Barva ${swatch}`}
            onClick={() => setColor(swatch)}
            className={cx(
              'h-7 w-7 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-basil/40',
              swatch === color
                ? 'ring-2 ring-ink/70 ring-offset-2 ring-offset-surface'
                : 'hover:scale-110',
            )}
            style={{ backgroundColor: swatch }}
          />
        ))}
      </div>
      {error && <p className="m-0 text-xs text-tomato-deep">{error}</p>}
    </div>
  );
}

export function BulkLabelDialog({
  open,
  onClose,
  token,
  labels,
  selected,
  onLabelCreated,
  onToggle,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  labels: RecipeLabel[];
  /** Label ids of every selected recipe. */
  selected: Array<{ labelIds: number[] }>;
  onLabelCreated: (label: RecipeLabel) => void;
  /** add = true puts the label on every selected recipe, false takes it off all of them. */
  onToggle: (labelId: number, add: boolean) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
      title="Oznake za izbrane recepte"
      description={`Izbranih: ${selected.length}. Klik na oznako jo doda vsem izbranim; ponoven klik jo odstrani.`}
      size="sm"
      footer={
        <Button
          type="button"
          color="gradient"
          appearance="full"
          size="md"
          stretch
          onClick={onClose}
        >
          Končano
        </Button>
      }
    >
      <div className="space-y-4">
        {labels.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {labels.map((label) => {
              const count = selected.filter((recipe) => recipe.labelIds.includes(label.id)).length;
              const all = selected.length > 0 && count === selected.length;
              return (
                <RecipeLabelBadge
                  key={label.id}
                  name={count > 0 && !all ? `${label.name} (${count})` : label.name}
                  color={label.color}
                  dot
                  active={all}
                  onClick={() => onToggle(label.id, !all)}
                />
              );
            })}
          </div>
        ) : (
          <p className="m-0 text-sm text-ink-muted">Še nimaš oznak. Ustvari prvo spodaj.</p>
        )}
        <CreateLabelForm
          token={token}
          onCreated={(label) => {
            onLabelCreated(label);
            onToggle(label.id, true);
          }}
        />
      </div>
    </Dialog>
  );
}

export function BulkEditDialog({
  open,
  onClose,
  count,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  count: number;
  onApply: (changes: BulkRecipeChanges) => void;
}) {
  const [servings, setServings] = useState('');
  const [source, setSource] = useState('');
  const [totalTime, setTotalTime] = useState('');

  useEffect(() => {
    if (!open) return;
    setServings('');
    setSource('');
    setTotalTime('');
  }, [open]);

  const changes: BulkRecipeChanges = {};
  if (servings.trim()) changes.servings = servings.trim();
  if (source.trim()) changes.source = source.trim();
  if (totalTime.trim()) changes.totalTime = totalTime.trim();
  const hasChanges = Object.keys(changes).length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
      title="Uredi izbrane recepte"
      description={`Izpolnjena polja se nastavijo vsem izbranim (${count}). Prazna polja ostanejo nespremenjena.`}
      size="sm"
      footer={
        <>
          <Button type="button" color="white" appearance="outline" size="md" onClick={onClose}>
            Prekliči
          </Button>
          <Button
            type="button"
            color="gradient"
            appearance="full"
            size="md"
            className="flex-1"
            disabled={!hasChanges}
            onClick={() => {
              onApply(changes);
              onClose();
            }}
          >
            Uporabi
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-ink-muted">Porcije</span>
          <Input
            value={servings}
            placeholder="npr. 2 osebi"
            onChange={(event) => setServings(event.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-ink-muted">Čas priprave (skupaj)</span>
          <Input
            value={totalTime}
            placeholder="npr. 30 min"
            onChange={(event) => setTotalTime(event.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-ink-muted">Vir</span>
          <Input
            value={source}
            placeholder="npr. Babičina kuharica"
            onChange={(event) => setSource(event.target.value)}
          />
        </label>
      </div>
    </Dialog>
  );
}
