// src/collectionsStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Collection {
  id: string;
  name: string;
  parentId?: string;
  bookIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface CollectionsStore {
  collections: Collection[];

  createCollection: (name: string, parentId?: string) => Collection;
  updateCollection: (id: string, updates: Partial<Collection>) => void;
  deleteCollection: (id: string) => void;
  addBookToCollection: (collectionId: string, bookId: string) => void;
  removeBookFromCollection: (collectionId: string, bookId: string) => void;
  getCollectionHierarchy: () => CollectionNode[];
  getCollectionById: (id: string) => Collection | undefined;
  getCollectionBooks: (collectionId: string, allBooks: any[]) => any[];
}

export interface CollectionNode extends Collection {
  children: CollectionNode[];
}

export const useCollectionsStore = create<CollectionsStore>()(
  persist(
    (set, get) => ({
      collections: [],

      createCollection: (name, parentId) => {
        const newCollection: Collection = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          name,
          parentId,
          bookIds: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        set((state) => ({
          collections: [...state.collections, newCollection],
        }));

        return newCollection;
      },

      updateCollection: (id, updates) => {
        set((state) => ({
          collections: state.collections.map((col) =>
            col.id === id
              ? { ...col, ...updates, updatedAt: new Date().toISOString() }
              : col
          ),
        }));
      },

      deleteCollection: (id) => {
        const deleteRecursive = (collectionId: string) => {
          const { collections } = get();
          const childCollections = collections.filter(
            (col) => col.parentId === collectionId
          );

          // Delete all child collections recursively
          childCollections.forEach((child) => deleteRecursive(child.id));

          // Delete the collection itself
          set((state) => ({
            collections: state.collections.filter(
              (col) => col.id !== collectionId
            ),
          }));
        };

        deleteRecursive(id);
      },

      addBookToCollection: (collectionId, bookId) => {
        set((state) => ({
          collections: state.collections.map((col) =>
            col.id === collectionId
              ? {
                  ...col,
                  bookIds: [...new Set([...col.bookIds, bookId])],
                  updatedAt: new Date().toISOString(),
                }
              : col
          ),
        }));
      },

      removeBookFromCollection: (collectionId, bookId) => {
        set((state) => ({
          collections: state.collections.map((col) =>
            col.id === collectionId
              ? {
                  ...col,
                  bookIds: col.bookIds.filter((id) => id !== bookId),
                  updatedAt: new Date().toISOString(),
                }
              : col
          ),
        }));
      },

      getCollectionById: (id) => {
        return get().collections.find((col) => col.id === id);
      },

      // Get all books that belong to a collection (including subcollections)
      getCollectionBooks: (collectionId: string, allBooks: any[]): any[] => {
        const { collections } = get();

        // Get all descendant collection IDs
        const getAllDescendantIds = (id: string): string[] => {
          const descendants = [id];
          const children = collections.filter((c) => c.parentId === id);

          children.forEach((child) => {
            descendants.push(...getAllDescendantIds(child.id));
          });

          return descendants;
        };

        const allCollectionIds = getAllDescendantIds(collectionId);

        // Get unique books across all these collections
        const uniqueBookIds = new Set<string>();
        const booksInCollection: any[] = [];

        allBooks.forEach((book) => {
          if (
            book.metadata.collectionIds?.some((id: string) =>
              allCollectionIds.includes(id)
            )
          ) {
            if (!uniqueBookIds.has(book.id)) {
              uniqueBookIds.add(book.id);
              booksInCollection.push(book);
            }
          }
        });

        return booksInCollection;
      },

      getCollectionHierarchy: () => {
        const { collections } = get();
        const collectionMap = new Map<string, CollectionNode>();
        const rootCollections: CollectionNode[] = [];

        // First pass: create all nodes
        collections.forEach((collection) => {
          collectionMap.set(collection.id, {
            ...collection,
            children: [],
          });
        });

        // Second pass: build hierarchy
        collections.forEach((collection) => {
          const node = collectionMap.get(collection.id)!;

          if (collection.parentId) {
            const parent = collectionMap.get(collection.parentId);
            if (parent) {
              parent.children.push(node);
            } else {
              // If parent doesn't exist, treat as root
              rootCollections.push(node);
            }
          } else {
            rootCollections.push(node);
          }
        });

        // Sort collections alphabetically
        const sortCollections = (collections: CollectionNode[]) => {
          collections.sort((a, b) => a.name.localeCompare(b.name));
          collections.forEach((col) => {
            if (col.children.length > 0) {
              sortCollections(col.children);
            }
          });
        };

        sortCollections(rootCollections);
        return rootCollections;
      },
    }),
    {
      name: "collections-storage",
      version: 1,
    }
  )
);
