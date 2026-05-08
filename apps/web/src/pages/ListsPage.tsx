import { FormEvent, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";

import { CheckCheck, Edit, Plus, SettingsCog, Trash2 } from "../components/lordicon/icons";
import { AppHeader } from "../components/AppHeader";
import { Button, Dialog, H1, Input } from "../components/ui";
import { toListSlug } from "../domain/list-slug";
import type { AuthUser } from "../types/auth";
import type { ShoppingList } from "../types/lists";

type ListsPageProps = {
  token: string;
  authUser: AuthUser;
  onLogout: () => Promise<void>;
};

export function ListsPage({ token, authUser, onLogout }: ListsPageProps) {
  const navigate = useNavigate();
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [listsError, setListsError] = useState("");
  const [listsLoading, setListsLoading] = useState(false);

  const [createListDialogOpen, setCreateListDialogOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [createListLoading, setCreateListLoading] = useState(false);
  const [createListError, setCreateListError] = useState("");

  const [editingListId, setEditingListId] = useState<number | null>(null);
  const [editingListName, setEditingListName] = useState("");
  const [updateListLoading, setUpdateListLoading] = useState(false);
  const [updateListError, setUpdateListError] = useState("");

  const [deleteConfirmListId, setDeleteConfirmListId] = useState<number | null>(null);
  const [deleteListLoadingId, setDeleteListLoadingId] = useState<number | null>(null);
  const [deleteListError, setDeleteListError] = useState("");

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`
    }),
    [token]
  );
  const deleteConfirmList = useMemo(
    () => lists.find((list) => list.id === deleteConfirmListId) ?? null,
    [lists, deleteConfirmListId]
  );

  useEffect(() => {
    async function loadLists() {
      setListsLoading(true);
      setListsError("");
      try {
        const response = await fetch("/api/lists", {
          headers: authHeaders
        });
        if (!response.ok) {
          throw new Error(`Lists API failed with status ${response.status}`);
        }

        const payload = (await response.json()) as { lists: ShoppingList[] };
        setLists(payload.lists);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        setListsError(message);
      } finally {
        setListsLoading(false);
      }
    }

    void loadLists();
  }, [authHeaders]);

  async function handleCreateList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateListError("");
    setCreateListLoading(true);

    try {
      const response = await fetch("/api/lists", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: newListName.trim()
        })
      });

      const payload = (await response.json()) as { list?: ShoppingList; error?: string };
      if (!response.ok || !payload.list) {
        throw new Error(payload.error ?? `List creation failed with status ${response.status}`);
      }

      setLists((currentLists) => [payload.list as ShoppingList, ...currentLists]);
      setNewListName("");
      setCreateListDialogOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setCreateListError(message);
    } finally {
      setCreateListLoading(false);
    }
  }

  function beginEditList(list: ShoppingList) {
    setDeleteConfirmListId(null);
    setDeleteListError("");
    setEditingListId(list.id);
    setEditingListName(list.name);
    setUpdateListError("");
  }

  function cancelEditList() {
    setEditingListId(null);
    setEditingListName("");
    setUpdateListError("");
  }

  function beginDeleteListConfirmation(listId: number) {
    setDeleteConfirmListId(listId);
    setDeleteListError("");
  }

  function cancelDeleteListConfirmation() {
    setDeleteConfirmListId(null);
    setDeleteListError("");
  }

  async function handleUpdateList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingListId) {
      return;
    }

    setUpdateListLoading(true);
    setUpdateListError("");

    try {
      const response = await fetch(`/api/lists/${editingListId}`, {
        method: "PUT",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: editingListName.trim()
        })
      });

      const payload = (await response.json()) as { list?: ShoppingList; error?: string };
      if (!response.ok || !payload.list) {
        throw new Error(payload.error ?? `List update failed with status ${response.status}`);
      }

      setLists((currentLists) => currentLists.map((list) => (list.id === payload.list?.id ? payload.list : list)));
      cancelEditList();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setUpdateListError(message);
    } finally {
      setUpdateListLoading(false);
    }
  }

  async function handleDeleteList(list: ShoppingList) {
    const listId = list.id;
    setDeleteListLoadingId(listId);
    setDeleteListError("");

    try {
      const response = await fetch(`/api/lists/${listId}`, {
        method: "DELETE",
        headers: authHeaders
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? `List deletion failed with status ${response.status}`);
      }

      setLists((currentLists) => currentLists.filter((currentList) => currentList.id !== listId));
      if (editingListId === listId) {
        cancelEditList();
      }
      cancelDeleteListConfirmation();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setDeleteListError(message);
    } finally {
      setDeleteListLoadingId(null);
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
              <Button
                type="button"
                icon={<Plus />}
                onClick={() => {
                  setNewListName("");
                  setCreateListError("");
                  setCreateListDialogOpen(true);
                }}
              >
                Create list
              </Button>
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
      </motion.div>

      <section className="mt-6">
        <H1 color="gradient" className="text-4xl">
          Shopping Lists
        </H1>
        <p className="mt-1 text-slate-200/90">
          Create and manage shared lists for your household and plan shopping faster.
        </p>
      </section>

      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.42 }}
        className="relative mt-6"
      >
        {listsLoading ? <p className="text-slate-300">Loading lists...</p> : null}
        {listsError ? <p className="m-0 text-sm text-rose-300">{listsError}</p> : null}
        {!listsLoading && !listsError ? (
          <motion.ul layout className="mt-4 grid list-none gap-2 p-0">
            {lists.map((list) => (
              <motion.li
                layout
                initial={{ opacity: 0, y: 8, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.25 }}
                key={list.id}
                whileHover={{ borderColor: "rgba(186,230,253,0.55)" }}
                className="group relative flex cursor-pointer items-center justify-between gap-2 rounded-2xl border border-white/12 bg-slate-900/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_10px_24px_rgba(2,8,23,0.3)] backdrop-blur-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/45"
                onClick={() => navigate(`/lists/${toListSlug(list.name)}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate(`/lists/${toListSlug(list.name)}`);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div>
                  <p className="m-0 text-base font-semibold text-slate-50">{list.name}</p>
                  <p className="m-0 text-sm text-slate-300">Updated {new Date(list.updatedAt).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    color="white"
                    appearance="outline"
                    type="button"
                    icon={<Edit animateOnHover />}
                    iconOnly
                    aria-label={`Edit ${list.name}`}
                    title={`Edit ${list.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      beginEditList(list);
                    }}
                    disabled={deleteListLoadingId === list.id}
                  />
                  <Button
                    color="danger"
                    appearance="outline"
                    type="button"
                    icon={<Trash2 animateOnHover />}
                    iconOnly
                    aria-label={`Delete ${list.name}`}
                    title={`Delete ${list.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      beginDeleteListConfirmation(list.id);
                    }}
                    disabled={deleteListLoadingId === list.id}
                  />
                </div>
              </motion.li>
            ))}
            {!lists.length ? (
              <li className="rounded-2xl border border-dashed border-white/18 bg-slate-900/20 p-4 text-sm text-slate-300">
                No lists yet. Click "Create list" to add your first one.
              </li>
            ) : null}
          </motion.ul>
        ) : null}
      </motion.section>

      <Dialog
        open={createListDialogOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setCreateListDialogOpen(false);
            setCreateListError("");
            setNewListName("");
          }
        }}
        size="sm"
        title="Create list"
        footer={
          <>
            <Button
              type="submit"
              form="create-list-form"
              disabled={createListLoading}
              icon={<CheckCheck animation="default" />}
            >
              {createListLoading ? "Saving..." : "Save"}
            </Button>
            <Button
              color="white"
              appearance="outline"
              type="button"
              onClick={() => {
                setCreateListDialogOpen(false);
                setCreateListError("");
                setNewListName("");
              }}
            >
              Cancel
            </Button>
          </>
        }
      >
        <form id="create-list-form" className="grid gap-2" onSubmit={handleCreateList}>
          <Input
            value={newListName}
            onChange={(event) => setNewListName(event.target.value)}
            minLength={1}
            maxLength={200}
            placeholder="Weekly groceries"
            required
          />
          {createListError ? <p className="m-0 text-xs text-rose-200">{createListError}</p> : null}
        </form>
      </Dialog>

      <Dialog
        open={Boolean(editingListId)}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            cancelEditList();
          }
        }}
        size="sm"
        title="Edit list"
        footer={
          <>
            <Button type="submit" form="edit-list-form" disabled={updateListLoading}>
              {updateListLoading ? "Saving..." : "Save"}
            </Button>
            <Button color="white" appearance="outline" type="button" onClick={cancelEditList} disabled={updateListLoading}>
              Cancel
            </Button>
          </>
        }
      >
        <form id="edit-list-form" className="grid gap-2" onSubmit={handleUpdateList}>
          <Input
            value={editingListName}
            onChange={(event) => setEditingListName(event.target.value)}
            minLength={1}
            maxLength={200}
            required
          />
          {updateListError ? <p className="m-0 text-xs text-rose-200">{updateListError}</p> : null}
        </form>
      </Dialog>

      <Dialog
        open={Boolean(deleteConfirmList)}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            cancelDeleteListConfirmation();
          }
        }}
        size="sm"
        title="Confirm list deletion"
        description={
          deleteConfirmList ? (
            <>
              You are about to permanently delete <strong>{deleteConfirmList.name}</strong>. This action cannot be undone.
            </>
          ) : undefined
        }
        footer={
          deleteConfirmList ? (
            <>
              <Button
                color="danger"
                appearance="outline"
                type="button"
                onClick={() => void handleDeleteList(deleteConfirmList)}
                disabled={deleteListLoadingId === deleteConfirmList.id}
              >
                {deleteListLoadingId === deleteConfirmList.id ? "Deleting..." : "Confirm delete"}
              </Button>
              <Button color="white" appearance="outline" type="button" onClick={cancelDeleteListConfirmation}>
                Cancel
              </Button>
            </>
          ) : null
        }
      >
        {deleteConfirmList ? (
          deleteListError ? <p className="m-0 text-xs text-rose-200">{deleteListError}</p> : null
        ) : null}
      </Dialog>
    </>
  );
}
