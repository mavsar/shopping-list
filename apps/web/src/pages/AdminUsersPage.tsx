import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";

import { Edit, LogOut, Plus, Trash2 } from "../components/lordicon/icons";
import { AppHeader } from "../components/AppHeader";
import { Button, Card, Checkbox, Dialog, Input, Label, Loader, Select } from "../components/ui";
import type { AuthUser, ManagedUser } from "../types/auth";

type AdminUsersPageProps = {
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
  cancelLabel = "Cancel"
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

export function AdminUsersPage({ token, authUser, onLogout }: AdminUsersPageProps) {
  const navigate = useNavigate();
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

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`
    }),
    [token]
  );
  const deleteConfirmUser = useMemo(
    () => users.find((user) => user.id === deleteConfirmUserId) ?? null,
    [users, deleteConfirmUserId]
  );

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError("");
    try {
      const response = await fetch("/api/users", {
        headers: authHeaders
      });
      if (!response.ok) {
        throw new Error(`Users API failed with status ${response.status}`);
      }

      const payload = (await response.json()) as { users: ManagedUser[] };
      setUsers(payload.users);
      setLastSyncedAt(new Date());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setUsersError(message);
    } finally {
      setUsersLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateUserError("");
    setCreateUserLoading(true);

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json"
        },
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
        throw new Error(payload.error ?? `User creation failed with status ${response.status}`);
      }

      setUsers((currentUsers) => [payload.user as ManagedUser, ...currentUsers]);
      setNewUsername("");
      setNewPassword("");
      setNewName("");
      setNewEmail("");
      setNewIsAdmin(false);
      setCreateUserDialogOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setCreateUserError(message);
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
    setEditingUsername("");
    setEditingName("");
    setEditingEmail("");
    setEditingPassword("");
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
    if (!editingUserId) {
      return;
    }

    setUpdateUserLoading(true);
    setUpdateUserError("");

    try {
      const response = await fetch(`/api/users/${editingUserId}`, {
        method: "PUT",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json"
        },
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
        throw new Error(payload.error ?? `User update failed with status ${response.status}`);
      }

      setUsers((currentUsers) => currentUsers.map((user) => (user.id === payload.user?.id ? payload.user : user)));
      cancelEditUser();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setUpdateUserError(message);
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
        headers: {
          ...authHeaders,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          transferToUserId: deleteTransferToUserId ?? undefined
        })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? `User deletion failed with status ${response.status}`);
      }

      setUsers((currentUsers) => currentUsers.filter((user) => user.id !== userId));
      if (editingUserId === userId) {
        cancelEditUser();
      }
      cancelDeleteUserConfirmation();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setDeleteUserError(message);
    } finally {
      setDeleteUserLoadingId(null);
    }
  }

  return (
    <>
      <AppHeader
        title="Shopping List Admin"
        syncInfo={{
          lastSyncedAt,
          refreshing: usersLoading,
          onRefresh: loadUsers
        }}
        actions={
          <>
            <Button color="white" appearance="outline" type="button" onClick={() => navigate("/")}>
              App
            </Button>
            <Button
              color="white"
              appearance="outline"
              type="button"
              icon={<LogOut animateOnHover />}
              iconOnly
              aria-label="Logout"
              title="Logout"
              onClick={() => void onLogout()}
            />
          </>
        }
      />

      <section className="mt-6">
        <motion.article
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.42 }}
          className="relative min-h-[12rem]"
        >
          <h2 className="text-sm font-medium tracking-[0.12em] text-slate-300 uppercase">Users</h2>
          {usersLoading ? <Loader placement="overlay" label="Loading users..." /> : null}
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
                          {user.isAdmin ? "admin" : "user"}
                        </Label>
                        <Button
                          color="white"
                          appearance="outline"
                          type="button"
                          icon={<Edit animateOnHover />}
                          iconOnly
                          aria-label={`Edit ${user.username}`}
                          title={`Edit ${user.username}`}
                          onClick={() => beginEditUser(user)}
                          disabled={deleteUserLoadingId === user.id}
                        />
                        <Button
                          color="danger"
                          appearance="outline"
                          type="button"
                          icon={<Trash2 animateOnHover />}
                          iconOnly
                          aria-label={`Delete ${user.username}`}
                          title={`Delete ${user.username}`}
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
        </motion.article>
      </section>
      <div className="fixed right-8 bottom-8 z-40">
        <Button
          type="button"
          icon={<Plus animateOnHover />}
          iconOnly
          size="lg"
          aria-label="Add new user"
          title="Add new user"
          className="shadow-[0_12px_35px_rgba(99,102,241,0.4)]"
          onClick={() => {
            setCreateUserError("");
            setCreateUserDialogOpen(true);
          }}
        />
      </div>
      <Dialog
        open={Boolean(editingUserId)}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            cancelEditUser();
          }
        }}
        size="sm"
        title="Edit user"
        footer={
          <DialogFormFooterActions
            formId="edit-user-form"
            submitLabel="Save"
            loadingSubmitLabel="Saving..."
            loading={updateUserLoading}
            onCancel={cancelEditUser}
          />
        }
      >
        <form id="edit-user-form" className="grid gap-3" onSubmit={handleUpdateUser}>
          <label className="grid gap-1 text-sm text-slate-200">
            Username
            <Input
              value={editingUsername}
              onChange={(event) => setEditingUsername(event.target.value)}
              minLength={3}
              required
            />
          </label>
          <label className="grid gap-1 text-sm text-slate-200">
            Full name
            <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} required />
          </label>
          <label className="grid gap-1 text-sm text-slate-200">
            Email (optional)
            <Input
              type="email"
              value={editingEmail}
              onChange={(event) => setEditingEmail(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm text-slate-200">
            New password (optional)
            <Input
              type="password"
              value={editingPassword}
              onChange={(event) => setEditingPassword(event.target.value)}
              minLength={8}
              placeholder="Leave empty to keep current password"
            />
          </label>
          <Checkbox checked={editingIsAdmin} onChange={(event) => setEditingIsAdmin(event.target.checked)}>
            Admin user
          </Checkbox>
          {updateUserError ? <p className="m-0 text-sm text-rose-300">{updateUserError}</p> : null}
        </form>
      </Dialog>
      <Dialog
        open={createUserDialogOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setCreateUserDialogOpen(false);
            setCreateUserError("");
          }
        }}
        size="sm"
        title="Add new user"
        footer={
          <DialogFormFooterActions
            formId="create-user-form"
            submitLabel="Create user"
            loadingSubmitLabel="Creating..."
            loading={createUserLoading}
            onCancel={() => setCreateUserDialogOpen(false)}
          />
        }
      >
        <form id="create-user-form" className="grid gap-3" onSubmit={handleCreateUser}>
          <label className="grid gap-1 text-sm text-slate-200">
            Username
            <Input
              value={newUsername}
              onChange={(event) => setNewUsername(event.target.value)}
              minLength={3}
              required
            />
          </label>
          <label className="grid gap-1 text-sm text-slate-200">
            Full name
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              required
            />
          </label>
          <label className="grid gap-1 text-sm text-slate-200">
            Password
            <Input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={8}
              required
            />
          </label>
          <label className="grid gap-1 text-sm text-slate-200">
            Email (optional)
            <Input
              type="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
            />
          </label>
          <Checkbox checked={newIsAdmin} onChange={(event) => setNewIsAdmin(event.target.checked)}>
            Grant admin rights
          </Checkbox>
          {createUserError ? <p className="m-0 text-sm text-rose-300">{createUserError}</p> : null}
        </form>
      </Dialog>
      <Dialog
        open={Boolean(deleteConfirmUser)}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            cancelDeleteUserConfirmation();
          }
        }}
        size="sm"
        title="Confirm user deletion"
        description={
          deleteConfirmUser ? (
            <>
              You are about to permanently delete <strong>{deleteConfirmUser.username}</strong>.
            </>
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
                {deleteUserLoadingId === deleteConfirmUser.id ? "Deleting..." : "Confirm delete"}
              </Button>
              <Button color="white" appearance="outline" type="button" onClick={cancelDeleteUserConfirmation}>
                Cancel
              </Button>
            </>
          ) : null
        }
      >
        {deleteConfirmUser ? (
          <div className="grid gap-2">
            <label className="grid gap-1 text-sm text-slate-200">
              Transfer owned lists to
              <Select
                value={deleteTransferToUserId ? String(deleteTransferToUserId) : ""}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setDeleteTransferToUserId(Number.isInteger(value) && value > 0 ? value : null);
                }}
              >
                <option value="" disabled>
                  Select user
                </option>
                {users
                  .filter((user) => user.id !== deleteConfirmUser.id)
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.username}
                    </option>
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
