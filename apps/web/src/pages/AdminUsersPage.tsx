import { FormEvent, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";

import { LogOut } from "../components/animate-ui/icons/log-out";
import { AppHeader } from "../components/AppHeader";
import { Button, Checkbox, Dialog, H1, Input, Label } from "../components/ui";
import type { AuthUser, ManagedUser } from "../types/auth";

type AdminUsersPageProps = {
  token: string;
  authUser: AuthUser;
  onLogout: () => Promise<void>;
};

export function AdminUsersPage({ token, authUser, onLogout }: AdminUsersPageProps) {
  const navigate = useNavigate();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [usersError, setUsersError] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [createUserLoading, setCreateUserLoading] = useState(false);
  const [createUserError, setCreateUserError] = useState("");
  const [createUserSuccess, setCreateUserSuccess] = useState("");
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
  const [deleteConfirmUsername, setDeleteConfirmUsername] = useState("");
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

  useEffect(() => {
    async function loadUsers() {
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
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        setUsersError(message);
      } finally {
        setUsersLoading(false);
      }
    }

    void loadUsers();
  }, [authHeaders]);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateUserError("");
    setCreateUserSuccess("");
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
      setCreateUserSuccess(`User "${payload.user.username}" created.`);
      setNewUsername("");
      setNewPassword("");
      setNewName("");
      setNewEmail("");
      setNewIsAdmin(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setCreateUserError(message);
    } finally {
      setCreateUserLoading(false);
    }
  }

  function beginEditUser(user: ManagedUser) {
    setDeleteConfirmUserId(null);
    setDeleteConfirmUsername("");
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
    setDeleteConfirmUserId(userId);
    setDeleteConfirmUsername("");
    setDeleteUserError("");
  }

  function cancelDeleteUserConfirmation() {
    setDeleteConfirmUserId(null);
    setDeleteConfirmUsername("");
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
    if (deleteConfirmUsername !== user.username) {
      setDeleteUserError("Type the exact username to confirm deletion.");
      return;
    }

    const userId = user.id;
    setDeleteUserLoadingId(userId);
    setDeleteUserError("");

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
        headers: authHeaders
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
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <AppHeader
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
      </motion.div>

      <section className="mt-6">
        <H1 color="gradient" className="text-4xl">
          Shopping List Admin
        </H1>
        <p className="mt-1 text-slate-200/90">Create users and manage privileged access with fluid real-time updates.</p>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <motion.aside
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.42 }}
          className="relative rounded-[2rem] border border-white/18 bg-slate-900/28 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_20px_60px_rgba(2,8,23,0.42)] backdrop-blur-2xl"
        >
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-white/45 to-transparent" />
          <h2 className="text-base font-semibold text-slate-50">Create user</h2>
          <form className="mt-3 grid gap-3" onSubmit={handleCreateUser}>
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
            <Button type="submit" disabled={createUserLoading} stretch>
              {createUserLoading ? "Creating..." : "Create user"}
            </Button>
            {createUserError ? <p className="m-0 text-sm text-rose-300">{createUserError}</p> : null}
            {createUserSuccess ? <p className="m-0 text-sm text-emerald-300">{createUserSuccess}</p> : null}
          </form>
        </motion.aside>

        <motion.article
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.42 }}
          className="relative"
        >
          <h2 className="text-sm font-medium tracking-[0.12em] text-slate-300 uppercase">Users</h2>
          {usersLoading ? <p className="text-slate-300">Loading users...</p> : null}
          {usersError ? <p className="m-0 text-sm text-rose-300">{usersError}</p> : null}
          {updateUserError && editingUserId === null ? <p className="m-0 text-sm text-rose-300">{updateUserError}</p> : null}
          {!usersLoading && !usersError ? (
            <motion.ul layout className="mt-4 grid list-none gap-2 p-0">
              {users.map((user) => (
                <motion.li
                  layout
                  initial={{ opacity: 0, y: 8, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.25 }}
                  key={user.id}
                  whileHover={{ borderColor: "rgba(186,230,253,0.55)" }}
                  className="group flex items-center justify-between gap-2 rounded-2xl border border-white/16 bg-slate-900/20 p-4 backdrop-blur-lg transition"
                >
                  {editingUserId === user.id ? (
                    <form className="grid w-full gap-2" onSubmit={handleUpdateUser}>
                      <div className="grid gap-1 text-sm text-slate-200">
                        Username
                        <Input
                          value={editingUsername}
                          onChange={(event) => setEditingUsername(event.target.value)}
                          minLength={3}
                          required
                        />
                      </div>
                      <div className="grid gap-1 text-sm text-slate-200">
                        Full name
                        <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} required />
                      </div>
                      <div className="grid gap-1 text-sm text-slate-200">
                        Email (optional)
                        <Input
                          type="email"
                          value={editingEmail}
                          onChange={(event) => setEditingEmail(event.target.value)}
                        />
                      </div>
                      <div className="grid gap-1 text-sm text-slate-200">
                        New password (optional)
                        <Input
                          type="password"
                          value={editingPassword}
                          onChange={(event) => setEditingPassword(event.target.value)}
                          minLength={8}
                          placeholder="Leave empty to keep current password"
                        />
                      </div>
                      <Checkbox checked={editingIsAdmin} onChange={(event) => setEditingIsAdmin(event.target.checked)}>
                        Admin user
                      </Checkbox>
                      {updateUserError ? <p className="m-0 text-sm text-rose-300">{updateUserError}</p> : null}
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit" disabled={updateUserLoading}>
                          {updateUserLoading ? "Saving..." : "Save"}
                        </Button>
                        <Button color="white" appearance="outline" type="button" onClick={cancelEditUser} disabled={updateUserLoading}>
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <>
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
                          onClick={() => beginEditUser(user)}
                          disabled={deleteUserLoadingId === user.id}
                        >
                          Edit
                        </Button>
                        <Button
                          color="danger"
                          appearance="outline"
                          type="button"
                          onClick={() => beginDeleteUserConfirmation(user.id)}
                          disabled={deleteUserLoadingId === user.id}
                        >
                          Delete
                        </Button>
                      </div>
                    </>
                  )}
                </motion.li>
              ))}
            </motion.ul>
          ) : null}
        </motion.article>
      </section>
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
              Type <strong>{deleteConfirmUser.username}</strong> to permanently delete this user.
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
                disabled={deleteUserLoadingId === deleteConfirmUser.id || deleteConfirmUsername !== deleteConfirmUser.username}
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
            <Input
              value={deleteConfirmUsername}
              onChange={(event) => setDeleteConfirmUsername(event.target.value)}
              placeholder={deleteConfirmUser.username}
            />
            {deleteUserError ? <p className="m-0 text-xs text-rose-200">{deleteUserError}</p> : null}
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
