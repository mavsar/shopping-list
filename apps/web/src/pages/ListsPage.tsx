import { motion } from 'motion/react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AppHeader } from '../components/AppHeader';
import { CheckCheck, Edit, Plus, SettingsCog, Trash2 } from '../components/lordicon/icons';
import { Button, Card, Checkbox, Dialog, Input, Loader } from '../components/ui';
import { toListSlug } from '../domain/list-slug';
import type { AuthUser } from '../types/auth';
import type { ShoppingList } from '../types/lists';

type ListsPageProps = {
  token: string;
  authUser: AuthUser;
  onLogout: () => Promise<void>;
};

export function ListsPage({ token, authUser, onLogout }: ListsPageProps) {
  const navigate = useNavigate();
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [listsError, setListsError] = useState('');
  const [listsLoading, setListsLoading] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const [createListDialogOpen, setCreateListDialogOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListIsPrivate, setNewListIsPrivate] = useState(true);
  const [createListLoading, setCreateListLoading] = useState(false);
  const [createListError, setCreateListError] = useState('');

  const [editingListId, setEditingListId] = useState<number | null>(null);
  const [editingListName, setEditingListName] = useState('');
  const [editingListIsPrivate, setEditingListIsPrivate] = useState(true);
  const [updateListLoading, setUpdateListLoading] = useState(false);
  const [updateListError, setUpdateListError] = useState('');

  const [deleteConfirmListId, setDeleteConfirmListId] = useState<number | null>(null);
  const [deleteListLoadingId, setDeleteListLoadingId] = useState<number | null>(null);
  const [deleteListError, setDeleteListError] = useState('');

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
    }),
    [token],
  );
  const deleteConfirmList = useMemo(
    () => lists.find((list) => list.id === deleteConfirmListId) ?? null,
    [lists, deleteConfirmListId],
  );

  const loadLists = useCallback(async () => {
    setListsLoading(true);
    setListsError('');
    try {
      const response = await fetch('/api/lists', {
        headers: authHeaders,
      });
      if (!response.ok) {
        throw new Error(`Lists API failed with status ${response.status}`);
      }

      const payload = (await response.json()) as { lists: ShoppingList[] };
      setLists(payload.lists);
      setLastSyncedAt(new Date());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setListsError(message);
    } finally {
      setListsLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  async function handleCreateList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateListError('');
    setCreateListLoading(true);

    try {
      const response = await fetch('/api/lists', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newListName.trim(),
          isPrivate: newListIsPrivate,
        }),
      });

      const payload = (await response.json()) as { list?: ShoppingList; error?: string };
      if (!response.ok || !payload.list) {
        throw new Error(payload.error ?? `List creation failed with status ${response.status}`);
      }

      setLists((currentLists) => [payload.list as ShoppingList, ...currentLists]);
      setNewListName('');
      setNewListIsPrivate(true);
      setCreateListDialogOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setCreateListError(message);
    } finally {
      setCreateListLoading(false);
    }
  }

  function beginEditList(list: ShoppingList) {
    setDeleteConfirmListId(null);
    setDeleteListError('');
    setEditingListId(list.id);
    setEditingListName(list.name);
    setEditingListIsPrivate(list.isPrivate);
    setUpdateListError('');
  }

  function cancelEditList() {
    setEditingListId(null);
    setEditingListName('');
    setEditingListIsPrivate(true);
    setUpdateListError('');
  }

  function beginDeleteListConfirmation(listId: number) {
    setDeleteConfirmListId(listId);
    setDeleteListError('');
  }

  function cancelDeleteListConfirmation() {
    setDeleteConfirmListId(null);
    setDeleteListError('');
  }

  async function handleUpdateList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingListId) {
      return;
    }

    setUpdateListLoading(true);
    setUpdateListError('');

    try {
      const response = await fetch(`/api/lists/${editingListId}`, {
        method: 'PUT',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editingListName.trim(),
          isPrivate: editingListIsPrivate,
        }),
      });

      const payload = (await response.json()) as { list?: ShoppingList; error?: string };
      if (!response.ok || !payload.list) {
        throw new Error(payload.error ?? `List update failed with status ${response.status}`);
      }

      setLists((currentLists) =>
        currentLists.map((list) => (list.id === payload.list?.id ? payload.list : list)),
      );
      cancelEditList();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setUpdateListError(message);
    } finally {
      setUpdateListLoading(false);
    }
  }

  async function handleDeleteList(list: ShoppingList) {
    const listId = list.id;
    setDeleteListLoadingId(listId);
    setDeleteListError('');

    try {
      const response = await fetch(`/api/lists/${listId}`, {
        method: 'DELETE',
        headers: authHeaders,
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
      const message = error instanceof Error ? error.message : 'Unknown error';
      setDeleteListError(message);
    } finally {
      setDeleteListLoadingId(null);
    }
  }

  return (
    <>
      <AppHeader
        title="Shopping Lists"
        syncInfo={{
          lastSyncedAt,
          refreshing: listsLoading,
          onRefresh: loadLists,
        }}
        actions={
          <>
            {authUser.isAdmin ? (
              <Button
                color="white"
                appearance="outline"
                type="button"
                icon={<SettingsCog animation="default" />}
                iconOnly
                aria-label="Admin"
                title="Admin"
                onClick={() => navigate('/admin/users')}
              />
            ) : null}
          </>
        }
      />

      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.42 }}
        className="relative mt-6 min-h-[12rem]"
      >
        {listsLoading ? <Loader placement="overlay" label="Loading lists..." /> : null}
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
                className="group cursor-pointer focus-visible:outline-none"
                onClick={() =>
                  navigate(`/lists/${toListSlug(list.name)}`, { state: { listName: list.name } })
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(`/lists/${toListSlug(list.name)}`, { state: { listName: list.name } });
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <Card interactive>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="m-0 text-xl font-semibold text-slate-50">{list.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {list.isPrivate ? (
                        <span className="inline-flex rounded-full border border-white/20 bg-slate-950/45 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-slate-200 uppercase">
                          Private
                        </span>
                      ) : null}
                      <Button
                        color="white"
                        appearance="transparent"
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
                    </div>
                  </div>
                </Card>
              </motion.li>
            ))}
            {!lists.length ? (
              <li className="rounded-2xl border border-dashed border-white/18 bg-slate-900/20 p-4 text-sm text-slate-300">
                No lists yet. Tap the + button in the bottom-right corner to add your first one.
              </li>
            ) : null}
          </motion.ul>
        ) : null}
      </motion.section>
      <div className="fixed right-8 bottom-8 z-40">
        <Button
          type="button"
          icon={<Plus animateOnHover />}
          iconOnly
          size="lg"
          aria-label="Create list"
          title="Create list"
          className="shadow-[0_12px_35px_rgba(99,102,241,0.4)]"
          onClick={() => {
            setNewListName('');
            setNewListIsPrivate(true);
            setCreateListError('');
            setCreateListDialogOpen(true);
          }}
        />
      </div>

      <Dialog
        open={createListDialogOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setCreateListDialogOpen(false);
            setCreateListError('');
            setNewListName('');
            setNewListIsPrivate(true);
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
              {createListLoading ? 'Saving...' : 'Save'}
            </Button>
            <Button
              color="white"
              appearance="outline"
              type="button"
              onClick={() => {
                setCreateListDialogOpen(false);
                setCreateListError('');
                setNewListName('');
                setNewListIsPrivate(true);
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
          <Checkbox checked={newListIsPrivate} onCheckedChange={setNewListIsPrivate}>
            Private list
          </Checkbox>
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
              {updateListLoading ? 'Saving...' : 'Save'}
            </Button>
            <Button
              color="white"
              appearance="outline"
              type="button"
              onClick={cancelEditList}
              disabled={updateListLoading}
            >
              Cancel
            </Button>
            <Button
              color="danger"
              appearance="outline"
              type="button"
              className="ml-auto"
              icon={<Trash2 animateOnHover />}
              onClick={() => {
                if (editingListId !== null) {
                  beginDeleteListConfirmation(editingListId);
                }
              }}
              disabled={updateListLoading || editingListId === null}
            >
              Delete
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
          <Checkbox checked={editingListIsPrivate} onCheckedChange={setEditingListIsPrivate}>
            Private list
          </Checkbox>
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
              You are about to permanently delete <strong>{deleteConfirmList.name}</strong>. This
              action cannot be undone.
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
                {deleteListLoadingId === deleteConfirmList.id ? 'Deleting...' : 'Confirm delete'}
              </Button>
              <Button
                color="white"
                appearance="outline"
                type="button"
                onClick={cancelDeleteListConfirmation}
              >
                Cancel
              </Button>
            </>
          ) : null
        }
      >
        {deleteConfirmList ? (
          deleteListError ? (
            <p className="m-0 text-xs text-rose-200">{deleteListError}</p>
          ) : null
        ) : null}
      </Dialog>
    </>
  );
}
