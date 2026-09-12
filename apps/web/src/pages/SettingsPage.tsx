import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";

import { Edit, LogOut, Plus, Trash2 } from "../components/lordicon/icons";
import { AppHeader } from "../components/AppHeader";
import { RecipeLabelBadge, type RecipeLabel } from "../components/RecipeLabelBadge";
import { Button, Card, Checkbox, Dialog, Input, Label, Loader, Select } from "../components/ui";
import type { AuthUser, ManagedUser } from "../types/auth";
import type { ShoppingList } from "../types/lists";

const LABEL_COLORS = [
  '#d9482b',
  '#ef8a2c',
  '#c9a227',
  '#3b8f5e',
  '#2f9aa8',
  '#3f7fb8',
  '#5b6abf',
  '#8e4a8b',
  '#d65a8e',
  '#7a4f2a',
  '#6f8f3a',
  '#8b7c6d',
];

const DEFAULT_LIST_ID_KEY = 'shopping-list-default-list-id';

type SettingsPageProps = {
  token: string;
  authUser: AuthUser;
  onLogout: () => Promise<void>;
};

type DialogFormFooterActionsProps = {
  formId: string;
  submitLabel: string;
  loadingSubmitLabel: string;
  loading: boolean;
  onCancel: () => void;
  cancelLabel?: string;
};

function DialogFormFooterActions({
  formId,
  submitLabel,
  loadingSubmitLabel,
  loading,
  onCancel,
  cancelLabel = "Prekliči"
}: DialogFormFooterActionsProps) {
  return (
    <>
      <Button type="submit" form={formId} disabled={loading}>
        {loading ? loadingSubmitLabel : submitLabel}
      </Button>
      <Button color="white" appearance="outline" type="button" onClick={onCancel} disabled={loading}>
        {cancelLabel}
      </Button>
    </>
  );
}

export function SettingsPage({ token, authUser, onLogout }: SettingsPageProps) {
  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  // ---- Recipe labels ----
  const [recipeLabels, setRecipeLabels] = useState<RecipeLabel[]>([]);
  const [labelsLoading, setLabelsLoading] = useState(true);
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<RecipeLabel | null>(null);
  const [labelName, setLabelName] = useState("");
  const [labelColor, setLabelColor] = useState(LABEL_COLORS[0]);
  const [labelSaving, setLabelSaving] = useState(false);
  const [labelError, setLabelError] = useState("");
  const [deleteLabelId, setDeleteLabelId] = useState<number | null>(null);
  const [deleteLabelLoading, setDeleteLabelLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/recipes/labels', { headers: authHeaders });
        if (!res.ok) return;
        const data = (await res.json()) as { labels: RecipeLabel[] };
        if (!cancelled) setRecipeLabels(data.labels);
      } finally {
        if (!cancelled) setLabelsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authHeaders]);

  function openCreateLabelDialog() {
    setEditingLabel(null);
    setLabelName("");
    setLabelColor(LABEL_COLORS[0]);
    setLabelError("");
    setLabelDialogOpen(true);
  }

  function openEditLabelDialog(label: RecipeLabel) {
    setEditingLabel(label);
    setLabelName(label.name);
    setLabelColor(label.color);
    setLabelError("");
    setLabelDialogOpen(true);
  }

  async function handleSaveLabel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLabelSaving(true);
    setLabelError("");
    try {
      const url = editingLabel ? `/api/recipes/labels/${editingLabel.id}` : '/api/recipes/labels';
      const method = editingLabel ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: labelName.trim(), color: labelColor }),
      });
      const payload = (await res.json()) as { label?: RecipeLabel; error?: string };
      if (!res.ok || !payload.label) {
        throw new Error(payload.error ?? `Napaka ${res.status}`);
      }
      if (editingLabel) {
        setRecipeLabels((prev) => prev.map((l) => l.id === payload.label!.id ? payload.label! : l));
      } else {
        setRecipeLabels((prev) => [...prev, payload.label!].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setLabelDialogOpen(false);
    } catch (err) {
      setLabelError(err instanceof Error ? err.message : "Napaka");
    } finally {
      setLabelSaving(false);
    }
  }

  async function handleDeleteLabel(labelId: number) {
    setDeleteLabelLoading(true);
    try {
      const res = await fetch(`/api/recipes/labels/${labelId}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      if (!res.ok && res.status !== 204) throw new Error(`Napaka ${res.status}`);
      setRecipeLabels((prev) => prev.filter((l) => l.id !== labelId));
      setDeleteLabelId(null);
    } finally {
      setDeleteLabelLoading(false);
    }
  }

  // ---- Default shopping list preference ----
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [defaultListId, setDefaultListId] = useState<number | null>(() => {
    const raw = localStorage.getItem(DEFAULT_LIST_ID_KEY);
    return raw ? (Number(raw) || null) : null;
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/lists', { headers: authHeaders });
        if (!res.ok) return;
        const data = (await res.json()) as { lists: ShoppingList[] };
        if (!cancelled) setLists(data.lists);
      } finally {
        if (!cancelled) setListsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authHeaders]);

  function handleDefaultListChange(listId: number | null) {
    setDefaultListId(listId);
    if (listId) {
      localStorage.setItem(DEFAULT_LIST_ID_KEY, String(listId));
    } else {
      localStorage.removeItem(DEFAULT_LIST_ID_KEY);
    }
  }

  const defaultListName = useMemo(
    () => lists.find((l) => l.id === defaultListId)?.name ?? null,
    [lists, defaultListId]
  );

  // ---- Admin: User management ----
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [usersError, setUsersError] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [createUserLoading, setCreateUserLoading] = useState(false);
  const [createUserError, setCreateUserError] = useState("");
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editingUsername, setEditingUsername] = useState("");
  const [editingName, setEditingName] = useState("");
  const [editingEmail, setEditingEmail] = useState("");
  const [editingPassword, setEditingPassword] = useState("");
  const [editingIsAdmin, setEditingIsAdmin] = useState(false);
  const [updateUserLoading, setUpdateUserLoading] = useState(false);
  const [updateUserError, setUpdateUserError] = useState("");
  const [deleteUserLoadingId, setDeleteUserLoadingId] = useState<number | null>(null);
  const [deleteConfirmUserId, setDeleteConfirmUserId] = useState<number | null>(null);
  const [deleteTransferToUserId, setDeleteTransferToUserId] = useState<number | null>(null);
  const [deleteUserError, setDeleteUserError] = useState("");

  const deleteConfirmUser = useMemo(
    () => users.find((user) => user.id === deleteConfirmUserId) ?? null,
    [users, deleteConfirmUserId]
  );

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError("");
    try {
      const response = await fetch("/api/users", { headers: authHeaders });
      if (!response.ok) {
        throw new Error(`Pridobivanje uporabnikov ni uspelo (status ${response.status}).`);
      }
      const payload = (await response.json()) as { users: ManagedUser[] };
      setUsers(payload.users);
      setLastSyncedAt(new Date());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Neznana napaka";
      setUsersError(message);
    } finally {
      setUsersLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (authUser.isAdmin) {
      void loadUsers();
    }
  }, [authUser.isAdmin, loadUsers]);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateUserError("");
    setCreateUserLoading(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          name: newName.trim(),
          email: newEmail.trim() || undefined,
          isAdmin: newIsAdmin
        })
      });
      const payload = (await response.json()) as { user?: ManagedUser; error?: string };
      if (!response.ok || !payload.user) {
        throw new Error(payload.error ?? `Ustvarjanje uporabnika ni uspelo (status ${response.status}).`);
      }
      setUsers((currentUsers) => [payload.user as ManagedUser, ...currentUsers]);
      setNewUsername(""); setNewPassword(""); setNewName(""); setNewEmail(""); setNewIsAdmin(false);
      setCreateUserDialogOpen(false);
    } catch (error) {
      setCreateUserError(error instanceof Error ? error.message : "Neznana napaka");
    } finally {
      setCreateUserLoading(false);
    }
  }

  function beginEditUser(user: ManagedUser) {
    setDeleteConfirmUserId(null);
    setDeleteUserError("");
    setEditingUserId(user.id);
    setEditingUsername(user.username);
    setEditingName(user.name);
    setEditingEmail(user.email ?? "");
    setEditingPassword("");
    setEditingIsAdmin(Boolean(user.isAdmin));
    setUpdateUserError("");
  }

  function cancelEditUser() {
    setEditingUserId(null);
    setEditingUsername(""); setEditingName(""); setEditingEmail(""); setEditingPassword("");
    setEditingIsAdmin(false);
    setUpdateUserError("");
  }

  function beginDeleteUserConfirmation(userId: number) {
    const firstTransferCandidate =
      users.find((user) => user.id !== userId && user.id !== authUser.id)?.id ??
      users.find((user) => user.id !== userId)?.id ??
      null;
    setDeleteConfirmUserId(userId);
    setDeleteTransferToUserId(firstTransferCandidate);
    setDeleteUserError("");
  }

  function cancelDeleteUserConfirmation() {
    setDeleteConfirmUserId(null);
    setDeleteTransferToUserId(null);
    setDeleteUserError("");
  }

  async function handleUpdateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUserId) return;
    setUpdateUserLoading(true);
    setUpdateUserError("");
    try {
      const response = await fetch(`/api/users/${editingUserId}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          username: editingUsername.trim(),
          name: editingName.trim(),
          email: editingEmail.trim() || null,
          password: editingPassword ? editingPassword : undefined,
          isAdmin: editingIsAdmin
        })
      });
      const payload = (await response.json()) as { user?: ManagedUser; error?: string };
      if (!response.ok || !payload.user) {
        throw new Error(payload.error ?? `Posodobitev uporabnika ni uspela (status ${response.status}).`);
      }
      setUsers((currentUsers) => currentUsers.map((user) => (user.id === payload.user?.id ? payload.user : user)));
      cancelEditUser();
    } catch (error) {
      setUpdateUserError(error instanceof Error ? error.message : "Neznana napaka");
    } finally {
      setUpdateUserLoading(false);
    }
  }

  async function handleDeleteUser(user: ManagedUser) {
    const userId = user.id;
    setDeleteUserLoadingId(userId);
    setDeleteUserError("");
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ transferToUserId: deleteTransferToUserId ?? undefined })
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? `Brisanje uporabnika ni uspelo (status ${response.status}).`);
      }
      setUsers((currentUsers) => currentUsers.filter((user) => user.id !== userId));
      if (editingUserId === userId) cancelEditUser();
      cancelDeleteUserConfirmation();
    } catch (error) {
      setDeleteUserError(error instanceof Error ? error.message : "Neznana napaka");
    } finally {
      setDeleteUserLoadingId(null);
    }
  }

  const initials = (authUser.name || authUser.username)
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <AppHeader title="Nastavitve" authUser={authUser} onLogout={onLogout} />

      <div className="mt-4 space-y-4">
        {/* ---- Profile ---- */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34 }}
        >
          <Card>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-basil text-base font-semibold text-white">
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-base font-semibold text-ink">{authUser.name || authUser.username}</p>
                <p className="m-0 truncate text-xs text-ink-muted">
                  @{authUser.username}
                  {authUser.email ? ` · ${authUser.email}` : ''}
                </p>
              </div>
              <Label tone={authUser.isAdmin ? "info" : "neutral"} withDot>
                {authUser.isAdmin ? "skrbnik" : "uporabnik"}
              </Label>
            </div>
            <div className="mt-4 border-t border-line pt-3">
              <Button
                color="danger"
                appearance="outline"
                size="sm"
                type="button"
                icon={<LogOut animateOnHover />}
                onClick={() => void onLogout()}
              >
                Odjava
              </Button>
            </div>
          </Card>
        </motion.section>

        {/* ---- Default shopping list ---- */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04, duration: 0.34 }}
        >
          <Card>
            <h2 className="m-0 text-sm font-semibold text-ink">Privzeti nakupovalni seznam</h2>
            <p className="m-0 mt-1 text-xs text-ink-muted">
              Sestavine iz receptov gredo na ta seznam brez vprašanja. Shrani se samo na tej napravi.
            </p>
            <div className="mt-3 space-y-2">
              {listsLoading ? (
                <Loader label="Nalagam sezname…" />
              ) : lists.length === 0 ? (
                <p className="m-0 text-sm text-ink-muted">Nimaš nakupovalnih seznamov.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1 basis-56">
                    <Select
                      value={defaultListId ? String(defaultListId) : ''}
                      onChange={(e) => handleDefaultListChange(Number(e.target.value) || null)}
                    >
                      <option value="">— Vedno vprašaj —</option>
                      {lists.map((list) => (
                        <option key={list.id} value={list.id}>
                          {list.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {defaultListId && (
                    <Button
                      color="white"
                      appearance="outline"
                      size="sm"
                      type="button"
                      onClick={() => handleDefaultListChange(null)}
                    >
                      Ponastavi
                    </Button>
                  )}
                </div>
              )}
              {defaultListId && defaultListName && (
                <p className="m-0 text-xs text-basil-deep">
                  Privzeto: <strong>{defaultListName}</strong>
                </p>
              )}
            </div>
          </Card>
        </motion.section>

        {/* ---- Recipe labels ---- */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.34 }}
        >
          <Card>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="m-0 text-sm font-semibold text-ink">Oznake receptov</h2>
                <p className="m-0 mt-1 text-xs text-ink-muted">Za razvrščanje in filtriranje shranjenih receptov.</p>
              </div>
              <Button
                type="button"
                icon={<Plus animateOnHover />}
                iconOnly
                size="sm"
                color="gradient"
                appearance="outline"
                aria-label="Dodaj oznako"
                title="Dodaj oznako"
                onClick={openCreateLabelDialog}
              />
            </div>
            {labelsLoading ? (
              <div className="mt-3">
                <Loader label="Nalagam oznake…" />
              </div>
            ) : recipeLabels.length === 0 ? (
              <p className="m-0 mt-3 text-sm text-ink-muted">Še nimaš oznak. Dodaj jih s plusom.</p>
            ) : (
              <ul className="m-0 mt-3 grid list-none gap-1.5 p-0">
                {recipeLabels.map((label) => (
                  <li
                    key={label.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-line bg-paper px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
                      <p className="m-0 truncate text-sm font-medium text-ink">{label.name}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        color="white"
                        appearance="transparent"
                        type="button"
                        icon={<Edit animateOnHover />}
                        iconOnly
                        size="sm"
                        aria-label={`Uredi ${label.name}`}
                        title={`Uredi ${label.name}`}
                        onClick={() => openEditLabelDialog(label)}
                      />
                      <Button
                        color="danger"
                        appearance="transparent"
                        type="button"
                        icon={<Trash2 animateOnHover />}
                        iconOnly
                        size="sm"
                        aria-label={`Izbriši ${label.name}`}
                        title={`Izbriši ${label.name}`}
                        onClick={() => setDeleteLabelId(label.id)}
                        disabled={deleteLabelLoading && deleteLabelId === label.id}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </motion.section>

        {/* ---- Admin: user management ---- */}
        {authUser.isAdmin && (
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.34 }}
          >
            <Card className="relative min-h-[6rem]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="m-0 text-sm font-semibold text-ink">Uporabniki</h2>
                  <p className="m-0 mt-1 text-xs text-ink-muted">Kdo lahko uporablja aplikacijo.</p>
                </div>
                <Button
                  type="button"
                  icon={<Plus animateOnHover />}
                  iconOnly
                  size="sm"
                  color="gradient"
                  appearance="outline"
                  aria-label="Dodaj uporabnika"
                  title="Dodaj uporabnika"
                  onClick={() => { setCreateUserError(""); setCreateUserDialogOpen(true); }}
                />
              </div>
              {usersLoading ? <Loader placement="overlay" label="Nalagam uporabnike…" /> : null}
              {usersError ? <p className="m-0 mt-3 text-sm text-tomato-deep">{usersError}</p> : null}
              {!usersLoading && !usersError ? (
                <ul className="m-0 mt-3 grid list-none gap-1.5 p-0">
                  {users.map((user) => (
                    <li
                      key={user.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-line bg-paper px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="m-0 flex items-center gap-2 text-sm font-medium text-ink">
                          <span className="truncate">{user.name || user.username}</span>
                          <Label tone={user.isAdmin ? "info" : "neutral"}>
                            {user.isAdmin ? "skrbnik" : "uporabnik"}
                          </Label>
                        </p>
                        <p className="m-0 truncate text-xs text-ink-muted">
                          @{user.username}
                          {user.email ? ` · ${user.email}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          color="white"
                          appearance="transparent"
                          type="button"
                          icon={<Edit animateOnHover />}
                          iconOnly
                          size="sm"
                          aria-label={`Uredi ${user.username}`}
                          title={`Uredi ${user.username}`}
                          onClick={() => beginEditUser(user)}
                          disabled={deleteUserLoadingId === user.id}
                        />
                        <Button
                          color="danger"
                          appearance="transparent"
                          type="button"
                          icon={<Trash2 animateOnHover />}
                          iconOnly
                          size="sm"
                          aria-label={`Izbriši ${user.username}`}
                          title={`Izbriši ${user.username}`}
                          onClick={() => beginDeleteUserConfirmation(user.id)}
                          disabled={deleteUserLoadingId === user.id}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
              {/* suppress unused warning */}
              {lastSyncedAt && null}
            </Card>
          </motion.section>
        )}
      </div>

      {/* Create / Edit label dialog */}
      <Dialog
        open={labelDialogOpen}
        onOpenChange={(isOpen) => { if (!isOpen) setLabelDialogOpen(false); }}
        size="sm"
        title={editingLabel ? "Uredi oznako" : "Nova oznaka"}
        footer={
          <DialogFormFooterActions
            formId="label-form"
            submitLabel={editingLabel ? "Shrani" : "Ustvari oznako"}
            loadingSubmitLabel={editingLabel ? "Shranjujem..." : "Ustvarjam..."}
            loading={labelSaving}
            onCancel={() => setLabelDialogOpen(false)}
          />
        }
      >
        <form id="label-form" className="grid gap-4" onSubmit={handleSaveLabel}>
          <label className="grid gap-1 text-sm font-medium text-ink-soft">
            Ime oznake
            <Input
              value={labelName}
              onChange={(e) => setLabelName(e.target.value)}
              placeholder="npr. Hitri recepti"
              maxLength={50}
              required
            />
          </label>
          <div className="grid gap-2">
            <p className="text-sm font-medium text-ink-soft">Barva</p>
            <div className="flex flex-wrap gap-2">
              {LABEL_COLORS.map((color) => {
                const selected = labelColor === color;
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setLabelColor(color)}
                    className="relative h-7 w-7 rounded-full transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
                    style={{ backgroundColor: color, opacity: selected ? 1 : 0.45 }}
                    aria-label={color}
                    title={color}
                  >
                    {selected && (
                      <svg
                        viewBox="0 0 14 14"
                        className="absolute inset-0 m-auto h-3.5 w-3.5"
                        fill="none"
                        stroke="white"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M2.5 7L5.5 10L11.5 4" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-muted">Predogled:</span>
              <RecipeLabelBadge name={labelName || "Oznaka"} color={labelColor} dot />
            </div>
          </div>
          {labelError ? <p className="m-0 text-sm text-tomato-deep">{labelError}</p> : null}
        </form>
      </Dialog>

      {/* Delete label confirmation */}
      <Dialog
        open={deleteLabelId !== null}
        onOpenChange={(isOpen) => { if (!isOpen) setDeleteLabelId(null); }}
        size="sm"
        title="Izbriši oznako"
        description={
          deleteLabelId !== null
            ? <>Trajno boš izbrisal/a oznako <strong>{recipeLabels.find((l) => l.id === deleteLabelId)?.name}</strong>. Oznaka bo odstranjena z vseh receptov.</>
            : undefined
        }
        footer={
          <>
            <Button
              color="danger"
              appearance="outline"
              type="button"
              onClick={() => deleteLabelId !== null && void handleDeleteLabel(deleteLabelId)}
              disabled={deleteLabelLoading}
            >
              {deleteLabelLoading ? "Brišem..." : "Potrdi brisanje"}
            </Button>
            <Button color="white" appearance="outline" type="button" onClick={() => setDeleteLabelId(null)}>
              Prekliči
            </Button>
          </>
        }
      />

      {/* Edit user dialog */}
      <Dialog
        open={Boolean(editingUserId)}
        onOpenChange={(isOpen) => { if (!isOpen) cancelEditUser(); }}
        size="sm"
        title="Uredi uporabnika"
        footer={
          <DialogFormFooterActions
            formId="edit-user-form"
            submitLabel="Shrani"
            loadingSubmitLabel="Shranjujem..."
            loading={updateUserLoading}
            onCancel={cancelEditUser}
          />
        }
      >
        <form id="edit-user-form" className="grid gap-3" onSubmit={handleUpdateUser}>
          <label className="grid gap-1 text-sm font-medium text-ink-soft">
            Uporabniško ime
            <Input value={editingUsername} onChange={(event) => setEditingUsername(event.target.value)} minLength={3} required />
          </label>
          <label className="grid gap-1 text-sm font-medium text-ink-soft">
            Polno ime
            <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} required />
          </label>
          <label className="grid gap-1 text-sm font-medium text-ink-soft">
            E-pošta (neobvezno)
            <Input type="email" value={editingEmail} onChange={(event) => setEditingEmail(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-medium text-ink-soft">
            Novo geslo (neobvezno)
            <Input
              type="password"
              value={editingPassword}
              onChange={(event) => setEditingPassword(event.target.value)}
              minLength={8}
              placeholder="Pusti prazno za ohranitev trenutnega gesla"
            />
          </label>
          <Checkbox checked={editingIsAdmin} onChange={(event) => setEditingIsAdmin(event.target.checked)}>
            Skrbniški uporabnik
          </Checkbox>
          {updateUserError ? <p className="m-0 text-sm text-tomato-deep">{updateUserError}</p> : null}
        </form>
      </Dialog>

      {/* Create user dialog */}
      <Dialog
        open={createUserDialogOpen}
        onOpenChange={(isOpen) => { if (!isOpen) { setCreateUserDialogOpen(false); setCreateUserError(""); } }}
        size="sm"
        title="Dodaj novega uporabnika"
        footer={
          <DialogFormFooterActions
            formId="create-user-form"
            submitLabel="Ustvari uporabnika"
            loadingSubmitLabel="Ustvarjam..."
            loading={createUserLoading}
            onCancel={() => setCreateUserDialogOpen(false)}
          />
        }
      >
        <form id="create-user-form" className="grid gap-3" onSubmit={handleCreateUser}>
          <label className="grid gap-1 text-sm font-medium text-ink-soft">
            Uporabniško ime
            <Input value={newUsername} onChange={(event) => setNewUsername(event.target.value)} minLength={3} required />
          </label>
          <label className="grid gap-1 text-sm font-medium text-ink-soft">
            Polno ime
            <Input value={newName} onChange={(event) => setNewName(event.target.value)} required />
          </label>
          <label className="grid gap-1 text-sm font-medium text-ink-soft">
            Geslo
            <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required />
          </label>
          <label className="grid gap-1 text-sm font-medium text-ink-soft">
            E-pošta (neobvezno)
            <Input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
          </label>
          <Checkbox checked={newIsAdmin} onChange={(event) => setNewIsAdmin(event.target.checked)}>
            Dodeli skrbniške pravice
          </Checkbox>
          {createUserError ? <p className="m-0 text-sm text-tomato-deep">{createUserError}</p> : null}
        </form>
      </Dialog>

      {/* Delete user dialog */}
      <Dialog
        open={Boolean(deleteConfirmUser)}
        onOpenChange={(isOpen) => { if (!isOpen) cancelDeleteUserConfirmation(); }}
        size="sm"
        title="Potrdi brisanje uporabnika"
        description={
          deleteConfirmUser ? (
            <>Trajno boš izbrisal/a <strong>{deleteConfirmUser.username}</strong>.</>
          ) : undefined
        }
        footer={
          deleteConfirmUser ? (
            <>
              <Button
                color="danger"
                appearance="outline"
                type="button"
                onClick={() => void handleDeleteUser(deleteConfirmUser)}
                disabled={deleteUserLoadingId === deleteConfirmUser.id}
              >
                {deleteUserLoadingId === deleteConfirmUser.id ? "Brišem..." : "Potrdi brisanje"}
              </Button>
              <Button color="white" appearance="outline" type="button" onClick={cancelDeleteUserConfirmation}>
                Prekliči
              </Button>
            </>
          ) : null
        }
      >
        {deleteConfirmUser ? (
          <div className="grid gap-2">
            <label className="grid gap-1 text-sm font-medium text-ink-soft">
              Prenesi lastništvo seznamov na
              <Select
                value={deleteTransferToUserId ? String(deleteTransferToUserId) : ""}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setDeleteTransferToUserId(Number.isInteger(value) && value > 0 ? value : null);
                }}
              >
                <option value="" disabled>Izberi uporabnika</option>
                {users
                  .filter((user) => user.id !== deleteConfirmUser.id)
                  .map((user) => (
                    <option key={user.id} value={user.id}>{user.username}</option>
                  ))}
              </Select>
            </label>
            {deleteUserError ? <p className="m-0 text-xs text-tomato-deep">{deleteUserError}</p> : null}
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
