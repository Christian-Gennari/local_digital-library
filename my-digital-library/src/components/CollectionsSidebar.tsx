// src/components/CollectionsSidebar.tsx
import { useState, useMemo, Fragment, useRef, useEffect } from "react";
import { useStore } from "../store";
import { useCollectionsStore, CollectionNode } from "../collectionsStore";
import {
  FolderIcon,
  FolderOpenIcon,
  PlusIcon,
  BookOpenIcon,
  BookmarkIcon,
  ClockIcon,
  StarIcon,
  CheckIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  TrashIcon,
  PencilIcon,
  XMarkIcon,
  EllipsisVerticalIcon,
  InboxIcon,
  DocumentIcon,
} from "@heroicons/react/24/outline";

interface SmartCollection {
  id: string;
  name: string;
  type: "smart";
  icon?: React.ReactNode;
  count?: number;
}

interface Props {
  selectedCollection: string | null;
  onSelectCollection: (collectionId: string | null) => void;
  isMobile?: boolean; // ADD THIS LINE
}

export function CollectionsSidebar({
  selectedCollection,
  onSelectCollection,
  isMobile = false,
}: Props) {
  const { books } = useStore();
  const {
    collections,
    load,
    isLoaded,
    createCollection,
    deleteCollection,
    updateCollection,
    getCollectionHierarchy,
    getCollectionCount, // <-- use store-provided counter
  } = useCollectionsStore();

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [creatingSubcollectionParentId, setCreatingSubcollectionParentId] =
    useState<string | null>(null);
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(
    null
  );
  const [editingCollectionName, setEditingCollectionName] = useState("");

  // Kebab popover
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Load collections on mount
  useEffect(() => {
    if (!isLoaded) {
      load().catch(console.error);
    }
  }, [isLoaded, load]);

  // Close menu on outside click / Esc
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!(e.target instanceof Node)) return;
      if (!menuRef.current.contains(e.target)) setOpenMenuId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenuId(null);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Cmd/Ctrl+N to create root collection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const metaPressed = isMac ? e.metaKey : e.ctrlKey;
      if (metaPressed && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        if (
          !isCreatingCollection &&
          !editingCollectionId &&
          !creatingSubcollectionParentId
        ) {
          setIsCreatingCollection(true);
          setNewCollectionName("");
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    isCreatingCollection,
    editingCollectionId,
    creatingSubcollectionParentId,
  ]);

  // Hierarchy
  const userCollections = useMemo(
    () => getCollectionHierarchy(),
    [collections, getCollectionHierarchy]
  );

  // Smart counts
  const currentlyReadingCount = books.filter(
    (b) =>
      b.metadata.readingProgress &&
      b.metadata.readingProgress > 0 &&
      b.metadata.readingProgress < 100
  ).length;

  const recentlyAddedCount = books.filter((b) => {
    const added = b.metadata.dateAdded ? new Date(b.metadata.dateAdded) : null;
    if (!added) return false;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return added > thirtyDaysAgo;
  }).length;

  const finishedCount = books.filter(
    (b) => b.metadata.readingProgress === 100
  ).length;
  const favoritesCount = books.filter(
    (b) => (b.metadata as any)?.isFavorite === true
  ).length;

  const unsortedCount = books.filter(
    (b) => !b.metadata.collectionIds || b.metadata.collectionIds.length === 0
  ).length;

  const notStartedCount = books.filter(
    (b) => (b.metadata.readingProgress ?? 0) === 0
  ).length;

  const smartCollections: SmartCollection[] = [
    {
      id: "not-started",
      name: "Not Started",
      type: "smart",
      icon: <BookmarkIcon className="h-4 w-4" />,
      count: notStartedCount,
    },
    {
      id: "currently-reading",
      name: "Currently Reading",
      type: "smart",
      icon: <BookOpenIcon className="h-4 w-4" />,
      count: currentlyReadingCount,
    },
    {
      id: "finished",
      name: "Finished",
      type: "smart",
      icon: <CheckCircleIcon className="h-4 w-4" />,
      count: finishedCount,
    },
    {
      id: "favorites",
      name: "Favorites",
      type: "smart",
      icon: <StarIcon className="h-4 w-4" />,
      count: favoritesCount,
    },
    {
      id: "recently-added",
      name: "Recently Added",
      type: "smart",
      icon: <ClockIcon className="h-4 w-4" />,
      count: recentlyAddedCount,
    },
    {
      id: "unsorted",
      name: "Unsorted",
      type: "smart",
      icon: <InboxIcon className="h-4 w-4" />,
      count: unsortedCount,
    },
  ];

  const toggleFolder = (id: string) => {
    const next = new Set(expandedFolders);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpandedFolders(next);
  };

  const handleCreateCollection = (parentId?: string) => {
    const name = parentId ? editingCollectionName : newCollectionName;
    if (!name.trim()) return;
    createCollection(name.trim(), parentId);
    setNewCollectionName("");
    setEditingCollectionName("");
    setIsCreatingCollection(false);
    setCreatingSubcollectionParentId(null);
    setOpenMenuId(null);
    if (parentId) {
      const next = new Set(expandedFolders);
      next.add(parentId);
      setExpandedFolders(next);
    }
  };

  const handleCancelCreateRoot = () => {
    setIsCreatingCollection(false);
    setNewCollectionName("");
  };

  const handleCancelCreateSub = () => {
    setCreatingSubcollectionParentId(null);
    setEditingCollectionName("");
  };

  const handleUpdateCollection = (id: string) => {
    if (!editingCollectionName.trim()) {
      setEditingCollectionId(null);
      setEditingCollectionName("");
      return;
    }
    updateCollection(id, { name: editingCollectionName.trim() });
    setEditingCollectionId(null);
    setEditingCollectionName("");
    setOpenMenuId(null);
  };

  const handleDeleteCollection = (id: string) => {
    if (!window.confirm("Delete this collection (and its subcollections)?"))
      return;
    deleteCollection(id);
    if (selectedCollection === id) onSelectCollection(null);
    setOpenMenuId(null);
  };

  const ActionMenu = ({
    id,
    onAddSub,
    onRename,
    onDelete,
  }: {
    id: string;
    onAddSub: () => void;
    onRename: () => void;
    onDelete: () => void;
  }) => {
    const isOpen = openMenuId === id;
    return (
      <div className="relative" ref={isOpen ? menuRef : null}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenuId((prev) => (prev === id ? null : id));
          }}
          className="h-8 w-8 inline-flex items-center justify-center rounded hover\:theme-bg-tertiary"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label="Open actions"
        >
          <EllipsisVerticalIcon className="h-5 w-5" />
        </button>

        {isOpen && (
          <div
            role="menu"
            className="absolute right-0 mt-1 w-44 rounded-lg border theme-border theme-bg-primary shadow-lg z-20 p-1"
          >
            <button
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setCreatingSubcollectionParentId(id);
                setEditingCollectionName("");
                const next = new Set(expandedFolders);
                next.add(id);
                setExpandedFolders(next);
                setOpenMenuId(null);
              }}
              className="w-full text-left px-3 py-2 text-sm rounded hover\:theme-bg-tertiary flex items-center gap-2"
            >
              <PlusIcon className="h-4 w-4" />
              Add subcollection
            </button>
            <button
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setEditingCollectionId(id);
                const col = collections.find((c) => c.id === id);
                setEditingCollectionName(col?.name || "");
                setOpenMenuId(null);
              }}
              className="w-full text-left px-3 py-2 text-sm rounded hover\:theme-bg-tertiary flex items-center gap-2"
            >
              <PencilIcon className="h-4 w-4" />
              Rename
            </button>
            <button
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteCollection(id);
              }}
              className="w-full text-left px-3 py-2 text-sm rounded hover:bg-red-50 text-red-600 flex items-center gap-2"
            >
              <TrashIcon className="h-4 w-4" />
              Delete
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderUserCollection = (col: CollectionNode, level = 0) => {
    const isExpanded = expandedFolders.has(col.id);
    const hasChildren = !!col.children?.length;
    const isSelected = selectedCollection === col.id;
    const isEditing = editingCollectionId === col.id;
    const isCreatingSub = creatingSubcollectionParentId === col.id;
    const count = getCollectionCount(col.id); // <- uses store

    return (
      <Fragment key={col.id}>
        {isEditing ? (
          <div
            className="flex items-center px-3 py-1 gap-2"
            style={{ paddingLeft: `${12 + level * 16}px` }}
          >
            <input
              value={editingCollectionName}
              onChange={(e) => setEditingCollectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleUpdateCollection(col.id);
                if (e.key === "Escape") {
                  setEditingCollectionId(null);
                  setEditingCollectionName("");
                }
              }}
              className="flex-1 h-9 px-2 text-sm border theme-border rounded focus:outline-none focus:border-blue-500"
              autoFocus
              placeholder="Rename collection"
            />
            <button
              onClick={() => handleUpdateCollection(col.id)}
              className="h-9 px-3 inline-flex items-center justify-center rounded theme-btn-primary hover:theme-btn-primary disabled:opacity-50"
              title="Save"
              aria-label="Save"
              disabled={!editingCollectionName.trim()}
            >
              <CheckIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                setEditingCollectionId(null);
                setEditingCollectionName("");
              }}
              className="h-9 px-3 inline-flex items-center justify-center rounded hover\:theme-bg-tertiary"
              title="Cancel"
              aria-label="Cancel"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div
            className={`group relative flex items-center justify-between w-full px-3 py-2 text-sm transition-colors ${
              isSelected
                ? "theme-bg-tertiary theme-text-primary"
                : "theme-text-primary hover:theme-bg-secondary"
            }`}
            style={{ paddingLeft: `${12 + level * 16}px` }}
            onClick={() => onSelectCollection(col.id)} // <-- CHANGED: Removed toggle logic
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* CHANGED: Made chevron a separate clickable button */}
              <button
                className="w-4 h-4 flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation(); // Prevent the parent onClick from firing
                  if (hasChildren) toggleFolder(col.id);
                }}
              >
                {hasChildren ? (
                  isExpanded ? (
                    <ChevronDownIcon className="h-4 w-4" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4" />
                  )
                ) : null}
              </button>
              {isExpanded ? (
                <FolderOpenIcon className="h-4 w-4" />
              ) : (
                <FolderIcon className="h-4 w-4" />
              )}
              <span className="truncate">{col.name}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs theme-text-secondary tabular-nums">
                {count}
              </span>
              <ActionMenu
                id={col.id}
                onAddSub={() => {
                  setCreatingSubcollectionParentId(col.id);
                  setEditingCollectionName("");
                  const next = new Set(expandedFolders);
                  next.add(col.id);
                  setExpandedFolders(next);
                  setOpenMenuId(null);
                }}
                onRename={() => {
                  setEditingCollectionId(col.id);
                  setEditingCollectionName(col.name);
                  setOpenMenuId(null);
                }}
                onDelete={() => handleDeleteCollection(col.id)}
              />
            </div>
          </div>
        )}

        {isCreatingSub && (
          <div
            className="px-3 py-1 flex items-center gap-2"
            style={{ paddingLeft: `${28 + level * 16}px` }}
          >
            <input
              value={editingCollectionName}
              onChange={(e) => setEditingCollectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateCollection(col.id);
                if (e.key === "Escape") handleCancelCreateSub();
              }}
              placeholder="Subcollection name"
              className="flex-1 h-9 px-2 text-sm border theme-border rounded focus:outline-none focus:border-blue-500"
              autoFocus
            />
            <button
              onClick={() => handleCreateCollection(col.id)}
              className="h-9 px-3 inline-flex items-center justify-center rounded theme-btn-primary hover:theme-btn-primary disabled:opacity-50"
              title="Add subcollection"
              aria-label="Add subcollection"
              disabled={!editingCollectionName.trim()}
            >
              <CheckIcon className="h-4 w-4" />
            </button>
            <button
              onClick={handleCancelCreateSub}
              className="h-9 px-3 inline-flex items-center justify-center rounded hover\:theme-bg-tertiary"
              title="Cancel"
              aria-label="Cancel"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        )}

        {hasChildren &&
          isExpanded &&
          col.children!.map((child) => renderUserCollection(child, level + 1))}
      </Fragment>
    );
  };

  return (
    <div className="h-full flex flex-col select-none">
      {/* Header - Only show on desktop */}
      {!isMobile && (
        <div className="p-4 border-b theme-border">
          <h2 className="font-semibold theme-text-primary">Collections</h2>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* All Books */}
        <button
          onClick={() => onSelectCollection(null)}
          className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${
            selectedCollection === null
              ? "theme-bg-tertiary theme-text-primary"
              : "theme-text-primary hover:theme-bg-secondary"
          }`}
        >
          <div className="flex items-center gap-2">
            <BookOpenIcon className="h-4 w-4" />
            <span>All Books</span>
          </div>
          <span className="text-xs theme-text-secondary tabular-nums">
            {books.length}
          </span>
        </button>

        {/* Smart Collections */}
        <div className="mt-4">
          <h3 className="px-3 text-[10px] font-semibold theme-text-secondary uppercase tracking-wider">
            Smart Collections
          </h3>
          <div className="mt-2">
            {smartCollections.map((c) => {
              const isSelected = selectedCollection === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => onSelectCollection(c.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                    isSelected
                      ? "theme-bg-tertiary theme-text-primary"
                      : "theme-text-primary hover:theme-bg-secondary"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {c.icon}
                    <span className="truncate">{c.name}</span>
                  </div>
                  <span className="text-xs theme-text-secondary tabular-nums">
                    {c.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Create root collection row */}
        {isCreatingCollection && (
          <div className="px-3 mb-2 flex items-center gap-2">
            <FolderIcon className="h-4 w-4 flex-shrink-0 theme-text-muted" />
            <input
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateCollection();
                if (e.key === "Escape") handleCancelCreateRoot();
              }}
              placeholder="Collection name"
              className="flex-1 h-8 px-2 text-sm border theme-border rounded focus:outline-none focus:border-blue-500"
              autoFocus
            />
            <button
              onClick={() => handleCreateCollection()}
              className="h-8 px-2 inline-flex items-center justify-center rounded theme-btn-primary hover:theme-btn-primary disabled:opacity-50"
              title="Add collection"
              aria-label="Add collection"
              disabled={!newCollectionName.trim()}
            >
              <CheckIcon className="h-4 w-4" />
            </button>
            <button
              onClick={handleCancelCreateRoot}
              className="h-8 px-2 inline-flex items-center justify-center rounded hover\:theme-bg-tertiary"
              title="Cancel"
              aria-label="Cancel"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* User Collections */}
        <div className="mt-6">
          <div className="px-3 mb-2 flex items-center justify-between">
            <h3 className="text-[10px] font-semibold theme-text-secondary uppercase tracking-wider">
              My Collections
            </h3>
            {/* New Collection Button - Clean simple plus */}
            <button
              onClick={() => setIsCreatingCollection(true)}
              className="h-6 w-6 inline-flex items-center justify-center rounded hover\:theme-bg-tertiary theme-text-secondary hover\:theme-text-primary transition-colors"
              title="Create new collection (Cmd/Ctrl+N)"
              aria-label="Create new collection"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-2">
            {userCollections.length === 0 ? (
              <p className="px-3 text-xs theme-text-secondary italic">
                No collections yet
              </p>
            ) : (
              userCollections.map((c) => renderUserCollection(c))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
