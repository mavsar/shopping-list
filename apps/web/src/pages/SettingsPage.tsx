import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";

import { Edit, Plus, Trash2 } from "../components/lordicon/icons";
import { AppHeader } from "../components/AppHeader";
import { Button, Card, Checkbox, Dialog, Input, Label, Loader, Select } from "../components/ui";
import type { AuthUser, ManagedUser } from "../types/auth";
import type { ShoppingList } from "../types/lists";

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

  return (
    <>
      <AppHeader title="Nastavitve" authUser={authUser} onLogout={onLogout} />

      <div className="mt-6 space-y-10">

        {/* ---- Default shopping list section ---- */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38 }}
        >
          <h2 className="text-sm font-medium tracking-[0.12em] text-slate-300 uppercase">
            Privzeti nakupovalni seznam
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Sestavine iz receptov se dodajajo na ta seznam brez vprašanja. Nastavitev se shrani lokalno na tej napravi.
          </p>
          <div className="mt-4 space-y-3">
            {listsLoading ? (
              <Loader label="Nalagam sezname..." />
            ) : lists.length === 0 ? (
              <p className="text-sm text-slate-400">Nimaš nakupovalnih seznamov.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Select
                  value={defaultListId ? String(defaultListId) : ''}
                  onChange={(e) => handleDefaultListChange(Number(e.target.value) || null)}
                  className="max-w-xs"
                >
                  <option value="">— Vedno vprašaj —</option>
                  {lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </Select>
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
              <p className="text-xs text-cyan-400">
                Privzeto: <strong>{defaultListName}</strong>
              </p>
            )}
          </div>
        </motion.section>

        {/* ---- Admin: user management ---- */}
        {authUser.isAdmin && (
          <motion.article
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.38 }}
            className="relative min-h-[12rem]"
          >
            <h2 className="text-sm font-medium tracking-[0.12em] text-slate-300 uppercase">Uporabniki</h2>
            {usersLoading ? <Loader placement="overlay" label="Nalagam uporabnike..." /> : null}
            {usersError ? <p className="m-0 text-sm text-rose-300">{usersError}</p> : null}
            {!usersLoading && !usersError ? (
              <motion.ul layout className="mt-4 grid list-none gap-2 p-0">
                {users.map((user) => (
                  <motion.li
                    layout
                    initial={{ opacity: 0, y: 8, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.25 }}
                    key={user.id}
                    className="list-none"
                  >
                    <Card interactive>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="m-0 text-base font-semibold text-slate-50">{user.username}</p>
                          <p className="m-0 text-sm text-slate-300">
                            {user.name}
                            {user.email ? ` - ${user.email}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label tone={user.isAdmin ? "info" : "neutral"} withDot>
                            {user.isAdmin ? "skrbnik" : "uporabnik"}
                          </Label>
                          <Button
                            color="white"
                            appearance="outline"
                            type="button"
                            icon={<Edit animateOnHover />}
                            iconOnly
                            aria-label={`Uredi ${user.username}`}
                            title={`Uredi ${user.username}`}
                            onClick={() => beginEditUser(user)}
                            disabled={deleteUserLoadingId === user.id}
                          />
                          <Button
                            color="danger"
                            appearance="outline"
                            type="button"
                            icon={<Trash2 animateOnHover />}
                            iconOnly
                            aria-label={`Izbriši ${user.username}`}
                            title={`Izbriši ${user.username}`}
                            onClick={() => beginDeleteUserConfirmation(user.id)}
                            disabled={deleteUserLoadingId === user.id}
                          />
                        </div>
                      </div>
                    </Card>
                  </motion.li>
                ))}
              </motion.ul>
            ) : null}
            {/* suppress unused warning */}
            {lastSyncedAt && null}
          </motion.article>
        )}
      </div>

      {/* FAB: add user (admin only) */}
      {authUser.isAdmin && (
        <div className="fixed right-8 bottom-8 z-40">
          <Button
            type="button"
            icon={<Plus animateOnHover />}
            iconOnly
            size="lg"
            aria-label="Dodaj novega uporabnika"
            title="Dodaj novega uporabnika"
            className="shadow-[0_12px_35px_rgba(99,102,241,0.4)]"
            onClick={() => { setCreateUserError(""); setCreateUserDialogOpen(true); }}
          />
        </div>
      )}

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
          <label className="grid gap-1 text-sm text-slate-200">
            Uporabniško ime
            <Input value={editingUsername} onChange={(event) => setEditingUsername(event.target.value)} minLength={3} required />
          </label>
          <label className="grid gap-1 text-sm text-slate-200">
            Polno ime
            <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} required />
          </label>
          <label className="grid gap-1 text-sm text-slate-200">
            E-pošta (neobvezno)
            <Input type="email" value={editingEmail} onChange={(event) => setEditingEmail(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm text-slate-200">
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
          {updateUserError ? <p className="m-0 text-sm text-rose-300">{updateUserError}</p> : null}
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
          <label className="grid gap-1 text-sm text-slate-200">
            Uporabniško ime
            <Input value={newUsername} onChange={(event) => setNewUsername(event.target.value)} minLength={3} required />
          </label>
          <label className="grid gap-1 text-sm text-slate-200">
            Polno ime
            <Input value={newName} onChange={(event) => setNewName(event.target.value)} required />
          </label>
          <label className="grid gap-1 text-sm text-slate-200">
            Geslo
            <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required />
          </label>
          <label className="grid gap-1 text-sm text-slate-200">
            E-pošta (neobvezno)
            <Input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
          </label>
          <Checkbox checked={newIsAdmin} onChange={(event) => setNewIsAdmin(event.target.checked)}>
            Dodeli skrbniške pravice
          </Checkbox>
          {createUserError ? <p className="m-0 text-sm text-rose-300">{createUserError}</p> : null}
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
            <label className="grid gap-1 text-sm text-slate-200">
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
            {deleteUserError ? <p className="m-0 text-xs text-rose-200">{deleteUserError}</p> : null}
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
