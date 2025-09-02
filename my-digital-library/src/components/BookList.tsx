// src/components/BookList.tsx - Mobile Optimized Version with Performance Fixes + Pagination
import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  memo,
} from "react";
import { useStore } from "../store";
import { BookMetadataEditor } from "./BookMetadataEditor";
import { ConfirmationModal } from "./ConfirmationModal";
import { Book } from "../types";
import { useCollectionsStore } from "../collectionsStore";
import { getIdentifier } from "../utils/metadataHelpers";
import BookCover from "./BookCover";
import { ProgressBar } from "./ProgressBar";

import {
  PencilSquareIcon,
  PlayIcon,
  BookOpenIcon,
  DocumentIcon,
  ArrowPathIcon,
  TrashIcon,
  EllipsisVerticalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { StarIcon, CheckCircleIcon } from "@heroicons/react/24/solid";
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

// ============ NEW: PAGINATION COMPONENTS ============
interface PaginationState {
  currentPage: number;
  itemsPerPage: number;
}

const PaginationControls: React.FC<{
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (items: number) => void;
  startIndex: number;
  endIndex: number;
}> = memo(
  ({
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    onPageChange,
    onItemsPerPageChange,
    startIndex,
    endIndex,
  }) => {
    // Generate page numbers to show
    const getPageNumbers = (): (number | string)[] => {
      const delta = 2; // Pages to show on each side of current page
      const range: (number | string)[] = [];
      const rangeWithDots: (number | string)[] = [];
      let l: number | undefined;

      for (let i = 1; i <= totalPages; i++) {
        if (
          i === 1 ||
          i === totalPages ||
          (i >= currentPage - delta && i <= currentPage + delta)
        ) {
          range.push(i);
        }
      }

      range.forEach((i) => {
        if (l) {
          if (typeof i === "number" && i - l === 2) {
            rangeWithDots.push(l + 1);
          } else if (typeof i === "number" && i - l !== 1) {
            rangeWithDots.push("...");
          }
        }
        rangeWithDots.push(i);
        if (typeof i === "number") l = i;
      });

      return rangeWithDots;
    };

    const pageNumbers = getPageNumbers();

    return (
      <div className="flex flex-col gap-4 border-t theme-border pt-4 mt-4">
        {/* Items per page selector and info */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm theme-text-secondary">
              <span>Show:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
                className="px-3 py-1.5 rounded-lg theme-bg-secondary theme-text-primary theme-border border focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
              <span>per page</span>
            </label>
          </div>

          <div className="text-sm theme-text-secondary">
            Showing{" "}
            <span className="font-medium theme-text-primary">{startIndex}</span>{" "}
            to{" "}
            <span className="font-medium theme-text-primary">{endIndex}</span>{" "}
            of{" "}
            <span className="font-medium theme-text-primary">{totalItems}</span>{" "}
            books
          </div>
        </div>

        {/* Pagination buttons */}
        <div className="flex items-center justify-center gap-1">
          {/* Previous button */}
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className={`
            flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
            ${
              currentPage === 1
                ? "theme-bg-secondary theme-text-muted cursor-not-allowed opacity-50"
                : "theme-bg-secondary theme-text-secondary hover:theme-bg-tertiary hover:theme-text-primary cursor-pointer"
            }
          `}
            aria-label="Previous page"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Previous</span>
          </button>

          {/* Page numbers */}
          <div className="flex items-center gap-1">
            {pageNumbers.map((pageNum, index) =>
              pageNum === "..." ? (
                <span
                  key={`dots-${index}`}
                  className="px-3 py-2 text-sm theme-text-muted"
                >
                  ...
                </span>
              ) : (
                <button
                  key={pageNum}
                  onClick={() => onPageChange(pageNum as number)}
                  className={`
                  min-w-[40px] px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
                  ${
                    currentPage === pageNum
                      ? "theme-bg-primary text-white"
                      : "theme-bg-secondary theme-text-secondary hover:theme-bg-tertiary hover:theme-text-primary"
                  }
                `}
                  aria-label={`Go to page ${pageNum}`}
                >
                  {pageNum}
                </button>
              )
            )}
          </div>

          {/* Next button */}
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className={`
            flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
            ${
              currentPage === totalPages
                ? "theme-bg-secondary theme-text-muted cursor-not-allowed opacity-50"
                : "theme-bg-secondary theme-text-secondary hover:theme-bg-tertiary hover:theme-text-primary cursor-pointer"
            }
          `}
            aria-label="Next page"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }
);

PaginationControls.displayName = "PaginationControls";
// ============ END PAGINATION COMPONENTS ============

// OPTIMIZATION: Memoized helper function to prevent recreation
const getIconForFormat = memo((format: string) => {
  switch (format) {
    case "pdf":
      return <DocumentIcon className="h-16 w-16 theme-text-muted" />;
    case "epub":
      return <BookOpenIcon className="h-16 w-16 theme-text-muted" />;
    case "audio":
      return <PlayIcon className="h-16 w-16 theme-text-muted" />;
    default:
      return <BookOpenIcon className="h-16 w-16 theme-text-muted" />;
  }
});

getIconForFormat.displayName = "GetIconForFormat";

// BookListHeader Component (desktop only)
const BookListHeader = memo(() => {
  return (
    <div className="hidden md:grid grid-cols-[5fr_3fr_2fr_1fr_1fr] px-3 py-2 border-b theme-border text-xs font-sans font-medium theme-text-secondary uppercase tracking-wide">
      <div>Title</div>
      <div>Author</div>
      <div>Format</div>
      <div className="text-center">Fav</div>
      <div className="text-right">Actions</div>
    </div>
  );
});
BookListHeader.displayName = "BookListHeader";

// OPTIMIZATION: Updated props to use stable callbacks
interface BookListItemProps {
  book: Book;
  isSelected: boolean;
  onBookClick: (bookId: string) => void; // Changed to use ID
  onEditBook: (bookId: string) => void; // Changed to use ID
  onDeleteBook: (bookId: string) => void; // Changed to use ID
  isMobile: boolean;
}

const BookListItem = memo<BookListItemProps>(
  ({ book, isSelected, onBookClick, onEditBook, onDeleteBook, isMobile }) => {
    const [showActions, setShowActions] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const kebabRef = useRef<HTMLButtonElement | null>(null);

    // Close kebab on ANY outside click/tap (document-level)
    useEffect(() => {
      if (!showActions) return;
      const handler = (e: MouseEvent | TouchEvent) => {
        const t = e.target as Node;
        if (menuRef.current?.contains(t)) return;
        if (kebabRef.current?.contains(t)) return;
        setShowActions(false);
      };
      document.addEventListener("mousedown", handler, true);
      document.addEventListener("touchstart", handler, true);
      return () => {
        document.removeEventListener("mousedown", handler, true);
        document.removeEventListener("touchstart", handler, true);
      };
    }, [showActions]);

    // Handlers
    const handleClick = useCallback(() => {
      onBookClick(book.id);
    }, [book.id, onBookClick]);

    const handleEdit = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onEditBook(book.id);
        setShowActions(false);
      },
      [book.id, onEditBook]
    );

    const handleDelete = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onDeleteBook(book.id);
        setShowActions(false);
      },
      [book.id, onDeleteBook]
    );

    const toggleActions = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      setShowActions((prev) => !prev);
    }, []);

    return (
      <div
        className={`group relative grid grid-cols-[1fr_auto_auto_auto] md:grid-cols-[5fr_3fr_2fr_1fr_1fr]
          items-center cursor-pointer border-b theme-border
          p-2 md:p-3 transition-colors hover\:theme-bg-secondary
          ${isSelected ? "theme-bg-tertiary" : "theme-bg-primary"}`}
        onClick={handleClick}
      >
        {/* Title (mobile includes author + star inline for breathing room) */}
        <div className="min-w-0">
          <h3 className="font-sans text-sm font-medium leading-tight theme-text-primary truncate">
            {book.metadata.title}
            {book.metadata.author && (
              <span className="md:hidden font-serif text-xs not-italic theme-text-secondary">
                {" "}
                <span className="mx-1">·</span>
                {book.metadata.author}
              </span>
            )}
            {/* Mobile-only favorite inline after title */}
            {book.metadata.isFavorite && (
              <StarIcon className="md:hidden inline h-4 w-4 ml-2 align-middle text-yellow-500" />
            )}
          </h3>
        </div>

        {/* Desktop-only Author column */}
        <div className="hidden md:block min-w-0">
          {book.metadata.author && (
            <p className="line-clamp-1 font-serif text-xs italic theme-text-secondary group-hover\:theme-text-muted">
              {book.metadata.author}
            </p>
          )}
        </div>

        {/* Format */}
        <div className="justify-self-start md:justify-self-auto">
          <span className="inline-flex items-center rounded-full theme-bg-tertiary px-1.5 py-0.5 font-sans text-[10px] font-medium theme-text-secondary">
            {book.format.toUpperCase()}
          </span>
        </div>

        {/* Favorite (desktop only in its own airy column) */}
        <div className="hidden md:flex justify-center">
          {book.metadata.isFavorite && (
            <StarIcon className="h-4 w-4 text-yellow-500" />
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end items-center gap-1">
          {/* Desktop: inline buttons on hover */}
          <div className="hidden md:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleEdit}
              className="p-1 rounded hover\:theme-bg-tertiary theme-text-secondary hover\:theme-text-primary"
              title="Edit book"
              aria-label="Edit"
            >
              <PencilSquareIcon className="h-4 w-4" />
            </button>
            <button
              onClick={handleDelete}
              className="p-1 rounded hover:bg-red-50 text-red-600"
              title="Delete book"
              aria-label="Delete"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Mobile: kebab opens popover */}
          <button
            ref={kebabRef}
            onClick={toggleActions}
            className="md:hidden h-8 w-8 inline-flex items-center justify-center rounded hover\:theme-bg-tertiary theme-text-secondary"
            aria-label="More actions"
            title="More"
          >
            <EllipsisVerticalIcon className="h-5 w-5" />
          </button>

          {/* Mobile popover menu */}
          {showActions && (
            <div
              ref={menuRef}
              className="absolute right-2 top-10 z-50 md:hidden theme-bg-primary rounded-lg shadow-lg border theme-border py-1 min-w-[160px]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={handleEdit}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm theme-text-primary hover\:theme-bg-secondary"
              >
                <PencilSquareIcon className="h-4 w-4" />
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <TrashIcon className="h-4 w-4" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    );
  },
  // OPTIMIZATION: Improved comparison function
  (prevProps, nextProps) => {
    return (
      prevProps.book.id === nextProps.book.id &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.book.metadata.title === nextProps.book.metadata.title &&
      prevProps.book.metadata.author === nextProps.book.metadata.author &&
      prevProps.book.metadata.isFavorite ===
        nextProps.book.metadata.isFavorite &&
      prevProps.book.format === nextProps.book.format &&
      prevProps.isMobile === nextProps.isMobile &&
      prevProps.onBookClick === nextProps.onBookClick &&
      prevProps.onEditBook === nextProps.onEditBook &&
      prevProps.onDeleteBook === nextProps.onDeleteBook
    );
  }
);

BookListItem.displayName = "BookListItem";

// OPTIMIZATION: Updated props to use stable callbacks
interface BookGridItemProps {
  book: Book;
  isSelected: boolean;
  onBookClick: (bookId: string) => void; // Changed to use ID
  onEditClick: (bookId: string) => void; // Changed to use ID
  isMobile: boolean;
}

const BookGridItem = memo<BookGridItemProps>(
  ({ book, isSelected, onBookClick, onEditClick, isMobile }) => {
    // OPTIMIZATION: Memoized handlers
    const handleClick = useCallback(() => {
      onBookClick(book.id);
    }, [book.id, onBookClick]);

    const handleEditClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onEditClick(book.id);
      },
      [book.id, onEditClick]
    );

    // OPTIMIZATION: Memoized styles to prevent recalculation
    const articleStyle = useMemo(
      () => ({
        transform: "translateY(0)",
        transition:
          "transform 300ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 300ms cubic-bezier(0.4, 0, 0.2, 1)",
        willChange: "transform",
      }),
      []
    );

    const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLElement>) => {
      if (window.matchMedia("(min-width: 768px)").matches) {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow =
          "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)";
      }
    }, []);

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLElement>) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = isSelected
          ? "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)"
          : "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)";
      },
      [isSelected]
    );

    return (
      <article
        className={`
          group relative cursor-pointer overflow-hidden rounded-xl p-3 md:p-4
          shadow-sm active:scale-[0.98] md:active:scale-100
          ${
            isSelected
              ? "theme-bg-tertiary !shadow-md ring-2 ring-slate-200 ring-offset-2"
              : "theme-bg-primary"
          }
        `}
        style={articleStyle}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        <div className="space-y-3 md:space-y-4">
          <div className="relative">
            <BookCover book={book} />

            {/* Edit button - only visible on desktop */}
            {!isMobile && (
              <div className="absolute bottom-2 right-2 flex items-center space-x-2">
                <button
                  onClick={handleEditClick}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full theme-bg-primary theme-text-secondary shadow-sm transition-all duration-200 hover:theme-bg-tertiary hover:theme-text-primary opacity-0 group-hover:opacity-100 group-hover:scale-110"
                  title="Edit metadata"
                >
                  <PencilSquareIcon className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Format badge */}
            <div className="absolute top-2 right-2">
              <span className="inline-flex items-center rounded-full theme-bg-primary px-1.5 md:px-2 py-0.5 md:py-1 font-sans text-[9px] md:text-[10px] font-medium uppercase tracking-wide theme-text-secondary md:theme-text-secondary shadow-sm">
                {book.format}
              </span>
            </div>

            {/* Progress bar */}
            <ProgressBar
              progress={book.metadata.readingProgress ?? 0}
              variant="minimal"
              size="xs"
              hideWhenZero={true}
              className="absolute bottom-0 left-0 right-0"
            />
          </div>
          <div className="space-y-1">
            <h3 className="line-clamp-2 font-sans text-sm md:text-base font-medium leading-tight theme-text-primary transition-colors duration-200 md:group-hover\:theme-text-primary">
              {book.metadata.title}
            </h3>
            {book.metadata.author && (
              <p className="line-clamp-1 font-serif text-xs md:text-sm theme-text-secondary">
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
                          : "theme-text-muted"
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
    );
  },
  // OPTIMIZATION: Improved comparison function
  (prevProps, nextProps) => {
    return (
      prevProps.book.id === nextProps.book.id &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.book.metadata.title === nextProps.book.metadata.title &&
      prevProps.book.metadata.author === nextProps.book.metadata.author &&
      prevProps.book.metadata.isFavorite ===
        nextProps.book.metadata.isFavorite &&
      prevProps.book.metadata.userRating ===
        nextProps.book.metadata.userRating &&
      prevProps.book.metadata.readingProgress ===
        nextProps.book.metadata.readingProgress &&
      prevProps.book.format === nextProps.book.format &&
      prevProps.isMobile === nextProps.isMobile &&
      // OPTIMIZATION: Check callback equality
      prevProps.onBookClick === nextProps.onBookClick &&
      prevProps.onEditClick === nextProps.onEditClick
    );
  }
);

BookGridItem.displayName = "BookGridItem";

// ViewToggle Component
interface ViewToggleProps {
  viewMode: string;
  setViewMode: (mode: string) => void;
}

const ViewToggle = memo<ViewToggleProps>(({ viewMode, setViewMode }) => {
  const toggleView = useCallback(
    (mode: string) => {
      setViewMode(mode);
      localStorage.setItem("bookViewMode", mode);
    },
    [setViewMode]
  );

  return (
    <div className="flex items-center space-x-2 rounded-full border theme-border theme-bg-secondary p-1 theme-text-secondary">
      <button
        onClick={() => toggleView("grid")}
        className={`rounded-full p-1.5 md:p-1 transition-colors ${
          viewMode === "grid"
            ? "view-toggle-active"
            : "theme-bg-primary hover:theme-bg-tertiary active:theme-bg-tertiary"
        }`}
        aria-label="Grid view"
      >
        <Squares2X2Icon className="h-5 w-5" />
      </button>

      <button
        onClick={() => toggleView("list")}
        className={`rounded-full p-1.5 md:p-1 transition-colors ${
          viewMode === "list"
            ? "view-toggle-active"
            : "theme-bg-primary hover:theme-bg-tertiary active:theme-bg-tertiary"
        }`}
        aria-label="List view"
      >
        <Bars3Icon className="h-5 w-5" />
      </button>
    </div>
  );
});

ViewToggle.displayName = "ViewToggle";

// ============ MAIN BOOKLIST COMPONENT ============
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

  // ============ NEW: PAGINATION STATE ============
  const [paginationState, setPaginationState] = useState<PaginationState>({
    currentPage: 1,
    itemsPerPage: parseInt(localStorage.getItem("booksPerPage") || "50"),
  });

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // OPTIMIZATION: Stable callbacks that only use IDs
  const handleBookClick = useCallback(
    (bookId: string) => {
      const book = books.find((b) => b.id === bookId);
      if (book) setSelectedBook(book);
    },
    [books, setSelectedBook]
  );

  const handleEditBook = useCallback(
    (bookId: string) => {
      const book = books.find((b) => b.id === bookId);
      if (book) setEditingBook(book);
    },
    [books]
  );

  const handleDeleteBook = useCallback(
    (bookId: string) => {
      const book = books.find((b) => b.id === bookId);
      if (book) setBookToDelete(book);
    },
    [books]
  );

  // OPTIMIZATION: Stable callback for closing edit modal
  const handleCloseEdit = useCallback(() => {
    setEditingBook(null);
  }, []);

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

  const cancelDeleteBook = useCallback(() => {
    setBookToDelete(null);
  }, []);

  // OPTIMIZATION: Properly memoized filtered books with minimal dependencies
  const filteredBooks = useMemo(() => {
    return books.filter((book) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          book.metadata.title.toLowerCase().includes(query) ||
          (book.metadata.author &&
            book.metadata.author.toLowerCase().includes(query)) ||
          (getIdentifier(book.metadata, "isbn") &&
            String(getIdentifier(book.metadata, "isbn")).includes(query)) ||
          (book.metadata.description &&
            book.metadata.description.toLowerCase().includes(query));

        if (!matchesSearch) return false;
      }

      // Collection filter
      if (selectedCollection) {
        switch (selectedCollection) {
          case "currently-reading":
            return (
              typeof book.metadata.readingProgress === "number" &&
              book.metadata.readingProgress > 0 &&
              book.metadata.readingProgress < 100
            );

          case "recently-added": {
            const raw = book.metadata?.dateAdded;
            if (!raw) return false;
            const addedDate = new Date(raw);
            if (isNaN(+addedDate)) return false;
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            return addedDate > thirtyDaysAgo;
          }

          case "finished":
            return book.metadata.readingProgress === 100;

          case "favorites":
            return book.metadata.isFavorite === true;

          case "unsorted":
            const ids = Array.isArray(book.metadata?.collectionIds)
              ? book.metadata.collectionIds
              : [];
            return ids.length === 0;

          case "not-started":
            return (book.metadata.readingProgress ?? 0) === 0;

          default:
            // User collections (incl. descendants)
            const isInCollection = (
              bookCollectionIds: string[] | undefined,
              targetCollectionId: string
            ): boolean => {
              if (!bookCollectionIds) return false;
              if (bookCollectionIds.includes(targetCollectionId)) return true;

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
  }, [books, searchQuery, selectedCollection, filters, collections]);

  // ============ NEW: PAGINATION LOGIC ============
  const totalPages = Math.ceil(
    filteredBooks.length / paginationState.itemsPerPage
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setPaginationState((prev) => ({ ...prev, currentPage: 1 }));
  }, [searchQuery, selectedCollection, filters]);

  // Ensure current page is valid
  useEffect(() => {
    if (paginationState.currentPage > totalPages && totalPages > 0) {
      setPaginationState((prev) => ({ ...prev, currentPage: totalPages }));
    }
  }, [totalPages, paginationState.currentPage]);

  const paginatedBooks = useMemo(() => {
    const startIndex =
      (paginationState.currentPage - 1) * paginationState.itemsPerPage;
    const endIndex = startIndex + paginationState.itemsPerPage;
    return filteredBooks.slice(startIndex, endIndex);
  }, [
    filteredBooks,
    paginationState.currentPage,
    paginationState.itemsPerPage,
  ]);

  const handlePageChange = useCallback((page: number) => {
    setPaginationState((prev) => ({ ...prev, currentPage: page }));
    // Scroll to top of book list
    document
      .querySelector(".overflow-y-auto")
      ?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleItemsPerPageChange = useCallback((items: number) => {
    localStorage.setItem("booksPerPage", items.toString());
    setPaginationState((prev) => ({
      ...prev,
      itemsPerPage: items,
      currentPage: 1, // Reset to first page when changing items per page
    }));
  }, []);

  const startIndex =
    filteredBooks.length === 0
      ? 0
      : (paginationState.currentPage - 1) * paginationState.itemsPerPage + 1;
  const endIndex = Math.min(
    paginationState.currentPage * paginationState.itemsPerPage,
    filteredBooks.length
  );
  // ============ END PAGINATION LOGIC ============

  // OPTIMIZATION: Memoized collection name calculation
  const collectionName = useMemo(() => {
    if (!selectedCollection) return "All Books";

    const collection = collections.find((c) => c.id === selectedCollection);
    if (collection) return collection.name;

    return (
      selectedCollection.charAt(0).toUpperCase() +
      selectedCollection.slice(1).replace("-", " ")
    );
  }, [selectedCollection, collections]);

  return (
    <div className="h-full flex flex-col theme-bg-primary">
      {/* Header with View Toggle */}
      <div className="flex items-center justify-between p-3 md:p-4 border-b theme-border">
        <div className="flex items-center space-x-2 md:space-x-4 min-w-0">
          <h2 className="text-base md:text-lg font-semibold theme-text-primary truncate">
            {collectionName}
          </h2>
          <span className="text-xs md:text-sm theme-text-secondary flex-shrink-0">
            {filteredBooks.length}{" "}
            {filteredBooks.length === 1 ? "book" : "books"}
          </span>
        </div>
        <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <ArrowPathIcon className="h-8 w-8 animate-spin theme-text-muted" />
          </div>
        ) : filteredBooks.length === 0 ? (
          <div className="text-center py-12">
            <BookOpenIcon className="h-16 w-16 theme-text-muted mx-auto mb-4" />
            <h3 className="text-lg font-medium theme-text-primary mb-2">
              {searchQuery || selectedCollection
                ? "No books found"
                : "No books in your library"}
            </h3>
            <p className="text-sm theme-text-secondary mb-6 px-4">
              {searchQuery
                ? "Try adjusting your search terms"
                : selectedCollection
                ? "No books in this collection"
                : "Start by adding some books to your library"}
            </p>
          </div>
        ) : (
          <>
            {/* List View - Always rendered, hidden when not active */}
            <div style={{ display: viewMode === "list" ? "block" : "none" }}>
              <BookListHeader />
              {/* CHANGED: Using paginatedBooks instead of filteredBooks */}
              {paginatedBooks.map((book, index) => (
                <div
                  key={book.id}
                  className={index > 0 ? "border-t theme-border" : ""}
                >
                  <BookListItem
                    book={book}
                    isSelected={selectedBook?.id === book.id}
                    onBookClick={handleBookClick}
                    onEditBook={handleEditBook}
                    onDeleteBook={handleDeleteBook}
                    isMobile={isMobile}
                  />
                </div>
              ))}
            </div>

            {/* Grid View - Always rendered, hidden when not active */}
            <div
              className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 md:gap-6"
              style={{
                display: viewMode === "grid" ? "grid" : "none",
              }}
            >
              {/* CHANGED: Using paginatedBooks instead of filteredBooks */}
              {paginatedBooks.map((book) => (
                <BookGridItem
                  key={book.id}
                  book={book}
                  isSelected={selectedBook?.id === book.id}
                  onBookClick={handleBookClick}
                  onEditClick={handleEditBook}
                  isMobile={isMobile}
                />
              ))}
            </div>

            {/* NEW: Pagination Controls - Only show if there's more than one page */}
            {totalPages > 1 && (
              <PaginationControls
                currentPage={paginationState.currentPage}
                totalPages={totalPages}
                totalItems={filteredBooks.length}
                itemsPerPage={paginationState.itemsPerPage}
                onPageChange={handlePageChange}
                onItemsPerPageChange={handleItemsPerPageChange}
                startIndex={startIndex}
                endIndex={endIndex}
              />
            )}
          </>
        )}
      </div>

      {/* Confirmation Modal */}
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
        <BookMetadataEditor book={editingBook} onClose={handleCloseEdit} />
      )}
    </div>
  );
}
