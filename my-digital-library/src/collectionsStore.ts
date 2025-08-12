// src/collectionsStore.ts
import { create } from "zustand";
import { RemoteFS } from "./fsRemote";

export interface Collection {
  id: string;
  name: string;
  parentId?: string;
  bookIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CollectionNode extends Collection {
  children: CollectionNode[];
}

interface CollectionsStore {
  // state
  collections: Collection[];
  isLoaded: boolean;
  lastSavedAt?: string;
  isSaving: boolean;

  // lifecycle
  load: () => Promise<void>;
  forceSave: () => Promise<void>;

  // mutations
  createCollection: (name: string, parentId?: string) => Collection;
  updateCollection: (id: string, updates: Partial<Collection>) => void;
  deleteCollection: (id: string) => void;
  addBookToCollection: (collectionId: string, bookId: string) => void;
  removeBookFromCollection: (collectionId: string, bookId: string) => void;

  // queries
  getCollectionById: (id: string) => Collection | undefined;
  getCollectionHierarchy: () => CollectionNode[];
  getCollectionBooks: (collectionId: string, allBooks: any[]) => any[];
  getCollectionCount: (collectionId: string) => number;
}

let saveTimer: number | null = null;
const DEBOUNCE_MS = 300;

async function persist(collections: Collection[], set: any) {
  set({ isSaving: true });
  const res = await RemoteFS.saveCollections(collections);
  set({ isSaving: false, lastSavedAt: res?.updatedAt });
}

function scheduleSave(get: () => CollectionsStore, set: any) {
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const { collections } = get();
    persist(collections, set).catch(console.error);
  }, DEBOUNCE_MS);
}

export const useCollectionsStore = create<CollectionsStore>((set, get) => ({
  collections: [],
  isLoaded: false,
  isSaving: false,
  lastSavedAt: undefined,

  load: async () => {
    try {
      const data = await RemoteFS.getCollections();
      if (Array.isArray(data)) set({ collections: data, isLoaded: true });
      else set({ collections: [], isLoaded: true });
    } catch (e) {
      console.error("collections:load", e);
      set({ collections: [], isLoaded: true });
    }
  },

  forceSave: async () => {
    const { collections } = get();
    await persist(collections, set);
  },

  createCollection: (name, parentId) => {
    const now = new Date().toISOString();
    const col: Collection = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name: name.trim(),
      parentId,
      bookIds: [],
      createdAt: now,
      updatedAt: now,
    };
    set((state: CollectionsStore) => ({
      collections: [...state.collections, col],
    }));
    scheduleSave(get, set);
    return col;
  },

  updateCollection: (id, updates) => {
    set((state: CollectionsStore) => ({
      collections: state.collections.map((c) =>
        c.id === id
          ? { ...c, ...updates, updatedAt: new Date().toISOString() }
          : c
      ),
    }));
    scheduleSave(get, set);
  },

  deleteCollection: (id) => {
    const all = get().collections;
    // gather descendants
    const childrenByParent = new Map<string, string[]>();
    for (const c of all) {
      const p = c.parentId || "";
      if (!childrenByParent.has(p)) childrenByParent.set(p, []);
      childrenByParent.get(p)!.push(c.id);
    }
    const toDelete = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const x = stack.pop()!;
      toDelete.add(x);
      const kids = childrenByParent.get(x) || [];
      for (const k of kids) stack.push(k);
    }
    set((state: CollectionsStore) => ({
      collections: state.collections.filter((c) => !toDelete.has(c.id)),
    }));
    scheduleSave(get, set);
  },

  addBookToCollection: (collectionId, bookId) => {
    set((state: CollectionsStore) => ({
      collections: state.collections.map((c) =>
        c.id === collectionId
          ? {
              ...c,
              bookIds: c.bookIds.includes(bookId)
                ? c.bookIds
                : [...c.bookIds, bookId],
              updatedAt: new Date().toISOString(),
            }
          : c
      ),
    }));
    scheduleSave(get, set);
  },

  removeBookFromCollection: (collectionId, bookId) => {
    set((state: CollectionsStore) => ({
      collections: state.collections.map((c) =>
        c.id === collectionId
          ? {
              ...c,
              bookIds: c.bookIds.filter((b) => b !== bookId),
              updatedAt: new Date().toISOString(),
            }
          : c
      ),
    }));
    scheduleSave(get, set);
  },

  getCollectionById: (id) => get().collections.find((c) => c.id === id),

  getCollectionHierarchy: () => {
    const nodes = new Map<string, CollectionNode>();
    const roots: CollectionNode[] = [];
    for (const c of get().collections) nodes.set(c.id, { ...c, children: [] });
    for (const c of get().collections) {
      const node = nodes.get(c.id)!;
      if (c.parentId && nodes.has(c.parentId)) {
        nodes.get(c.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    const sort = (arr: CollectionNode[]) => {
      arr.sort((a, b) => a.name.localeCompare(b.name));
      arr.forEach((n) => n.children.length && sort(n.children));
    };
    sort(roots);
    return roots;
  },

  getCollectionBooks: (collectionId, allBooks) => {
    const byId = new Map(get().collections.map((c) => [c.id, c]));
    const gather = (id: string, acc: Set<string>) => {
      const node = byId.get(id);
      if (!node) return;
      node.bookIds.forEach((b) => acc.add(b));
      for (const c of get().collections) {
        if (c.parentId === id) gather(c.id, acc);
      }
    };
    const ids = new Set<string>();
    gather(collectionId, ids);
    return allBooks.filter((b: any) => ids.has(b.id));
  },

  getCollectionCount: (collectionId) => {
    const allBooks = new Set<string>();
    const byId = new Map(get().collections.map((c) => [c.id, c]));
    const dfs = (id: string) => {
      const c = byId.get(id);
      if (!c) return;
      c.bookIds.forEach((b) => allBooks.add(b));
      for (const k of get().collections) if (k.parentId === id) dfs(k.id);
    };
    dfs(collectionId);
    return allBooks.size;
  },
}));
