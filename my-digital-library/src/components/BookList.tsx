// src/components/BookList.tsx - Fixed version
import { useState, useEffect, useMemo } from "react";
import { useStore } from "../store";
import { FileUpload } from "./FileUpload";
import { BookMetadataEditor } from "./BookMetadataEditor";
import { ConfirmationModal } from "./ConfirmationModal";
import { Book } from "../types";
import { useCollectionsStore } from "../collectionsStore";
import {
  PencilSquareIcon,
  PlayIcon,
  BookOpenIcon,
  DocumentIcon,
  ArrowPathIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/solid";
import { Squares2X2Icon, Bars3Icon } from "@heroicons/react/24/outline";

interface BookListProps {
  searchQuery?: string;
  selectedCollection?: string | null;
  filters?: {
    format: string;
    rating: string;
    readingStatus: string;
  };
}

// Create a cache for local image URLs outside of the component
const coverUrlCache = new Map<string, string>();

// Memoized function to get the cover image source with caching
const getCoverImageSrc = async (book: Book): Promise<string | null> => {
  // Check the cache first
  if (coverUrlCache.has(book.id)) {
    return coverUrlCache.get(book.id)!;
  }

  // If a local cover file exists, fetch it and cache the URL
  if (book.metadata.coverFile) {
    try {
      const coverHandle = await book.folderHandle.getFileHandle(
        book.metadata.coverFile
      );
      const file = await coverHandle.getFile();
      const url = URL.createObjectURL(file);
      // Store the new URL in the cache
      coverUrlCache.set(book.id, url);
      return url;
    } catch {
      // fallback silently
    }
  }
  // Fallback to online URL if no local file or cache is found
  return book.metadata.coverUrl || null;
};

export function BookList({
  searchQuery = "",
  selectedCollection = null,
  filters = {
    format: "all",
    rating: "all",
    readingStatus: "all",
  },
}: BookListProps) {
  const {
    books,
    libraryFolder,
    openBook,
    loadBooksFromFolder,
    isLoading,
    selectedBook,
    setSelectedBook,
    removeBook,
  } = useStore();
  const { collections } = useCollectionsStore();
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [viewMode, setViewMode] = useState(
    localStorage.getItem("bookViewMode") || "grid"
  );

  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteBook = async (book: Book, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent book selection
    setBookToDelete(book);
  };

  const confirmDeleteBook = async () => {
    if (!bookToDelete) return;

    setIsDeleting(true);
    try {
      await removeBook(bookToDelete.id);
      setBookToDelete(null);
    } catch (error) {
      console.error("Failed to delete book:", error);
      alert("Failed to delete book. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDeleteBook = () => {
    setBookToDelete(null);
  };

  useEffect(() => {
    if (libraryFolder) {
      loadBooksFromFolder();
    }
    // Cleanup function to revoke all cached URLs when the component unmounts
    return () => {
      coverUrlCache.forEach((url) => URL.revokeObjectURL(url));
      coverUrlCache.clear();
    };
  }, [libraryFolder]);

  const filteredBooks = useMemo(() => {
    return books.filter((book) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          book.metadata.title.toLowerCase().includes(query) ||
          (book.metadata.author &&
            book.metadata.author.toLowerCase().includes(query)) ||
          (book.metadata.isbn && book.metadata.isbn.includes(query)) ||
          (book.metadata.description &&
            book.metadata.description.toLowerCase().includes(query));

        if (!matchesSearch) return false;
      }

      // Collection filter
      if (selectedCollection) {
        // Smart collections
        switch (selectedCollection) {
          case "currently-reading":
            return (
              book.metadata.readingProgress &&
              book.metadata.readingProgress > 0 &&
              book.metadata.readingProgress < 100
            );

          case "recently-added":
            const addedDate = new Date(book.metadata.dateAdded);
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            return addedDate > thirtyDaysAgo;

          case "finished":
            return book.metadata.readingProgress === 100;

          case "favorites":
            // UPDATED: Use isFavorite field instead of rating
            return book.metadata.isFavorite === true;

          default:
            // User collections - check if book belongs to the collection or any of its subcollections
            const isInCollection = (
              bookCollectionIds: string[] | undefined,
              targetCollectionId: string
            ): boolean => {
              if (!bookCollectionIds) return false;

              // Check direct membership
              if (bookCollectionIds.includes(targetCollectionId)) return true;

              // Check if book is in any subcollection of the target
              const getAllDescendantIds = (id: string): string[] => {
                const descendants = [id];
                const children = collections.filter((c) => c.parentId === id);

                children.forEach((child) => {
                  descendants.push(...getAllDescendantIds(child.id));
                });

                return descendants;
              };

              const allCollectionIds = getAllDescendantIds(targetCollectionId);
              return bookCollectionIds.some((id) =>
                allCollectionIds.includes(id)
              );
            };

            return isInCollection(
              book.metadata.collectionIds,
              selectedCollection
            );
        }
      }

      // Format filter
      if (filters.format !== "all" && book.format !== filters.format) {
        return false;
      }

      // Rating filter
      if (filters.rating !== "all") {
        if (filters.rating === "unrated") {
          return !book.metadata.userRating;
        } else {
          const minRating = parseInt(filters.rating);
          return (
            book.metadata.userRating && book.metadata.userRating >= minRating
          );
        }
      }

      // Reading status filter
      if (filters.readingStatus !== "all") {
        const progress = book.metadata.readingProgress || 0;
        switch (filters.readingStatus) {
          case "unread":
            return progress === 0;
          case "reading":
            return progress > 0 && progress < 100;
          case "finished":
            return progress === 100;
          default:
            return true;
        }
      }

      return true;
    });
  }, [books, searchQuery, selectedCollection, filters]);

  const handleBookClick = (book: Book) => {
    setSelectedBook(book);
  };

  function BookCover({ book }: { book: Book }) {
    const [coverSrc, setCoverSrc] = useState<string | null>(null);

    useEffect(() => {
      // The `getCoverImageSrc` function now handles caching
      getCoverImageSrc(book).then(setCoverSrc);
    }, [book]);

    const getIconForFormat = (format: string) => {
      switch (format) {
        case "pdf":
          return <DocumentIcon className="h-16 w-16 text-slate-300" />;
        case "epub":
          return <BookOpenIcon className="h-16 w-16 text-slate-300" />;
        case "audio":
          return <PlayIcon className="h-16 w-16 text-slate-300" />;
        default:
          return <BookOpenIcon className="h-16 w-16 text-slate-300" />;
      }
    };

    return (
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-slate-50/50 shadow-inner">
        {coverSrc ? (
          <img
            src={coverSrc}
            alt={book.metadata.title}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-8">
            {getIconForFormat(book.format)}
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/5" />

        {/* Favorite Star Overlay */}
        {book.metadata.isFavorite && (
          <div className="absolute top-2 left-2">
            <div className="bg-yellow-400 rounded-full p-1.5 shadow-lg">
              <StarIcon className="h-4 w-4 text-white" />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Updated List Header
  function BookListHeader() {
    return (
      <div className="grid grid-cols-12 gap-x-6 border-b border-slate-200 bg-slate-50/80 px-4 py-2 text-left font-sans text-xs font-semibold uppercase tracking-wider text-slate-500">
        <h3 className="col-span-5">Title</h3>
        <h3 className="col-span-3">Author</h3>
        <h3 className="col-span-2">Type</h3>
        <h3 className="col-span-1 text-center">Favorite</h3>
        <div className="col-span-1"></div> {/* Spacer for action buttons */}
      </div>
    );
  }

  // Updated List Item with Favorite display and delete button (ONLY IN LIST VIEW)
  function BookListItem({
    book,
    handleBookClick,
    setEditingBook,
  }: {
    book: Book;
    handleBookClick: (book: Book) => void;
    setEditingBook: (book: Book | null) => void;
  }) {
    return (
      <div
        key={book.id}
        className={`group grid grid-cols-12 cursor-pointer items-center gap-x-6 p-4 transition-colors hover:bg-slate-50 ${
          selectedBook?.id === book.id ? "bg-slate-100 shadow-sm" : ""
        }`}
        onClick={() => handleBookClick(book)}
      >
        {/* Title */}
        <div className="col-span-5">
          <h3 className="line-clamp-2 font-sans text-sm font-medium leading-tight text-slate-900 transition-colors duration-200 group-hover:text-slate-700">
            {book.metadata.title}
          </h3>
        </div>

        {/* Author */}
        <div className="col-span-3">
          {book.metadata.author && (
            <p className="line-clamp-1 font-serif text-sm text-slate-500 group-hover:text-slate-400">
              {book.metadata.author}
            </p>
          )}
        </div>

        {/* Type Badge */}
        <div className="col-span-2">
          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 font-sans text-xs font-medium text-slate-600">
            {book.format.toUpperCase()}
          </span>
        </div>

        {/* Favorite */}
        <div className="col-span-1 flex justify-center">
          {book.metadata.isFavorite && (
            <StarIcon className="h-5 w-5 text-yellow-500" />
          )}
        </div>

        {/* Action Buttons - ONLY VISIBLE IN LIST VIEW */}
        <div className="col-span-1 flex justify-end">
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingBook(book);
              }}
              className="p-1 text-slate-500 hover:text-slate-700 rounded cursor-pointer"
              title="Edit book"
            >
              <PencilSquareIcon className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => handleDeleteBook(book, e)}
              className="p-1 text-slate-500 hover:text-red-600 rounded cursor-pointer"
              title="Delete book"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  function ViewToggle({
    viewMode,
    setViewMode,
  }: {
    viewMode: string;
    setViewMode: (mode: string) => void;
  }) {
    const toggleView = (mode: string) => {
      setViewMode(mode);
      localStorage.setItem("bookViewMode", mode);
    };

    return (
      <div className="flex items-center space-x-2 rounded-full border border-slate-200 bg-slate-50 p-1 text-slate-500">
        <button
          onClick={() => toggleView("grid")}
          className={`rounded-full p-1 transition-colors ${
            viewMode === "grid"
              ? "bg-slate-700 text-white"
              : "hover:bg-slate-100"
          }`}
          aria-label="Grid view"
        >
          <Squares2X2Icon className="h-5 w-5" />
        </button>

        <button
          onClick={() => toggleView("list")}
          className={`rounded-full p-1 transition-colors ${
            viewMode === "list"
              ? "bg-slate-700 text-white"
              : "hover:bg-slate-100"
          }`}
          aria-label="List view"
        >
          <Bars3Icon className="h-5 w-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with View Toggle */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {selectedCollection
              ? collections.find((c) => c.id === selectedCollection)?.name ||
                selectedCollection.charAt(0).toUpperCase() +
                  selectedCollection.slice(1).replace("-", " ")
              : "All Books"}
          </h2>
          <span className="text-sm text-gray-500">
            {filteredBooks.length}{" "}
            {filteredBooks.length === 1 ? "book" : "books"}
          </span>
        </div>
        <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <ArrowPathIcon className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : filteredBooks.length === 0 ? (
          <div className="text-center py-12">
            <BookOpenIcon className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              {searchQuery || selectedCollection
                ? "No books found"
                : "No books in your library"}
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              {searchQuery
                ? "Try adjusting your search terms"
                : selectedCollection
                ? "No books in this collection"
                : "Start by adding some books to your library"}
            </p>
            {!searchQuery && !selectedCollection}
          </div>
        ) : viewMode === "list" ? (
          // List View - WITH DELETE BUTTONS
          <div className="bg-white rounded-lg shadow-sm border border-slate-200">
            <BookListHeader />
            <div className="divide-y divide-slate-200">
              {filteredBooks.map((book) => (
                <BookListItem
                  key={book.id}
                  book={book}
                  handleBookClick={handleBookClick}
                  setEditingBook={setEditingBook}
                />
              ))}
            </div>
          </div>
        ) : (
          // Grid View - CLEAN, NO DELETE BUTTONS (edit button restored)
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredBooks.map((book) => (
              <article
                key={book.id}
                className={`group relative cursor-pointer overflow-hidden rounded-xl p-4 transition-all duration-300 ease-in-out transform-gpu hover:-translate-y-0.5 hover:shadow-lg
                  ${
                    selectedBook?.id === book.id
                      ? "bg-slate-100 shadow-md ring-2 ring-slate-200 ring-offset-2"
                      : "bg-white shadow-sm"
                  }`}
                onClick={() => handleBookClick(book)}
              >
                <div className="space-y-4">
                  <div className="relative">
                    <BookCover book={book} />

                    {/* Edit button - restored in bottom right of cover */}
                    <div className="absolute bottom-2 right-2 flex items-center space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingBook(book);
                        }}
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/70 text-slate-500 opacity-0 shadow-sm backdrop-blur-sm transition-all duration-200 hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100 group-hover:scale-110"
                        title="Edit metadata"
                      >
                        <PencilSquareIcon className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Format badge */}
                    <div className="absolute top-2 right-2">
                      <span className="inline-flex items-center rounded-full bg-white/70 px-2 py-1 font-sans text-[10px] font-medium uppercase tracking-wide text-slate-500 shadow-sm backdrop-blur-sm">
                        {book.format}
                      </span>
                    </div>

                    {/* Progress bar */}
                    {(book.metadata.readingProgress ?? 0) > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/10">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{
                            width: `${book.metadata.readingProgress}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <h3 className="line-clamp-2 font-sans text-base font-medium leading-tight text-slate-900 transition-colors duration-200 group-hover:text-slate-700">
                      {book.metadata.title}
                    </h3>
                    {book.metadata.author && (
                      <p className="line-clamp-1 font-serif text-sm text-slate-500">
                        {book.metadata.author}
                      </p>
                    )}
                    {book.metadata.userRating && (
                      <div className="flex items-center pt-1">
                        <div className="flex">
                          {[...Array(5)].map((_, i) => (
                            <span
                              key={i}
                              className={`text-xs ${
                                i < book.metadata.userRating!
                                  ? "text-yellow-500"
                                  : "text-gray-300"
                              }`}
                            >
                              ★
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Modal - ONLY FOR LIST VIEW DELETES */}
      <ConfirmationModal
        isOpen={bookToDelete !== null}
        title="Delete Book"
        message={`Are you sure you want to delete "${bookToDelete?.metadata.title}"? This will permanently remove the book file and all associated notes from your library.`}
        confirmText={isDeleting ? "Deleting..." : "Delete"}
        cancelText="Cancel"
        onConfirm={confirmDeleteBook}
        onCancel={cancelDeleteBook}
        isDestructive={true}
      />

      {/* Metadata Editor Modal */}
      {editingBook && (
        <BookMetadataEditor
          book={editingBook}
          onClose={() => setEditingBook(null)}
        />
      )}
    </div>
  );
}
