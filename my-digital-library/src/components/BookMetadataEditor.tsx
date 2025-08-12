// src/components/BookMetadataEditor.tsx
import { useState, useRef, useEffect, useCallback } from "react";
import { Book } from "../types";
import { useStore } from "../store";
import { useCollectionsStore } from "../collectionsStore";
import { cleanISBN, fetchBookDataFromISBN } from "../utils/isbn";
import { fetchArticleDataFromDOI } from "../utils/doi";
import {
  getFieldVisibility,
  getIdentifier,
  setIdentifier,
  formatDuration,
  parseDuration,
  validators,
  migrateMetadata,
} from "../utils/metadataHelpers";
import { StarIcon } from "@heroicons/react/24/solid";
import {
  StarIcon as StarOutlineIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { REMOTE_MODE } from "../store";

interface Props {
  book: Book;
  onClose: () => void;
}

// Define a new type for the item type
type ItemType = "book" | "audiobook" | "article";

export function BookMetadataEditor({ book, onClose }: Props) {
  const { updateBookMetadata, saveManualCoverForBook } = useStore();
  const { collections, addBookToCollection, removeBookFromCollection } =
    useCollectionsStore();

  // Migrate metadata on load
  const [metadata, setMetadata] = useState(() =>
    migrateMetadata(book.metadata)
  );
  const [identifierLookup, setIdentifierLookup] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [manualCoverFile, setManualCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [activeTab, setActiveTab] = useState<
    "basic" | "publication" | "identifiers" | "digital" | "user" | "collections"
  >("basic");
  const [itemType, setItemType] = useState<ItemType>(
    (book.metadata.itemType as ItemType) || "book"
  );
  const [selectedCollections, setSelectedCollections] = useState<Set<string>>(
    new Set(metadata.collectionIds || [])
  );

  // Get field visibility based on item type
  const fieldVisibility = getFieldVisibility(itemType);

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    getCoverImageSrc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book]);

  const getCoverImageSrc = async () => {
    // Handle REMOTE_MODE
    if (REMOTE_MODE) {
      if (metadata.coverFile) {
        const coverUrl = `/files/${encodeURIComponent(
          book.id
        )}/${encodeURIComponent(metadata.coverFile)}`;
        setCoverPreview(coverUrl);
        return;
      }
      setCoverPreview(metadata.coverUrl || null);
      return;
    }

    // Local mode - use FileSystem API
    if (metadata.coverFile) {
      try {
        const coverHandle = await book.folderHandle.getFileHandle(
          metadata.coverFile
        );
        const file = await coverHandle.getFile();
        setCoverPreview(URL.createObjectURL(file));
        return;
      } catch {
        // fallback silently
      }
    }
    setCoverPreview(metadata.coverUrl || null);
  };

  const handleIdentifierChange = (type: string, value: string) => {
    setMetadata((prev) => setIdentifier(prev, type as any, value));
  };

  const handleAudiobookFieldChange = (field: string, value: any) => {
    setMetadata((prev) => ({
      ...prev,
      audiobook: {
        ...prev.audiobook,
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      // Update book metadata
      await updateBookMetadata(book.id, {
        ...metadata,
        itemType,
      });

      // Handle collection updates
      const currentCollections = new Set(book.metadata.collectionIds || []);

      // Add to new collections
      for (const collectionId of selectedCollections) {
        if (!currentCollections.has(collectionId)) {
          addBookToCollection(collectionId, book.id);
        }
      }

      // Remove from old collections
      for (const collectionId of currentCollections) {
        if (!selectedCollections.has(collectionId)) {
          removeBookFromCollection(collectionId, book.id);
        }
      }

      // Save manual cover if provided
      if (manualCoverFile) {
        await saveManualCoverForBook(book.id, manualCoverFile);
      }

      setSuccess("Metadata updated successfully!");
      successTimeoutRef.current = setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error("Failed to save metadata:", error);
      setError("Failed to save metadata");
    } finally {
      setIsLoading(false);
    }
  };

  const handleIdentifierFetch = async () => {
    if (!identifierLookup.trim()) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
    }

    try {
      let result: any = null;

      if (itemType === "article") {
        result = await fetchArticleDataFromDOI(identifierLookup.trim());
      } else {
        const cleanedISBN = cleanISBN(identifierLookup.trim());
        result = await fetchBookDataFromISBN(cleanedISBN);
      }

      if (result) {
        setMetadata((prev) => ({
          ...prev,
          ...result,
          itemType: itemType,
        }));

        const successMessage = `✅ ${
          itemType === "article" ? "Article" : "Book"
        } metadata updated successfully!`;
        setSuccess(successMessage);
        setIdentifierLookup("");

        successTimeoutRef.current = setTimeout(() => {
          setSuccess(null);
        }, 8000);
      } else {
        setError(
          itemType === "article"
            ? "No article found with that DOI. Please verify the DOI is correct."
            : "No book found with that ISBN. Please verify the ISBN is correct."
        );
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
      console.error("Fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualCoverSelect = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setManualCoverFile(file);

      const reader = new FileReader();
      reader.onload = (e) => {
        setCoverPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      setMetadata((prev) => ({ ...prev, coverUrl: undefined }));
    }
  };

  const handleRemoveCover = () => {
    setManualCoverFile(null);
    setCoverPreview(null);
    setMetadata((prev) => ({
      ...prev,
      coverFile: undefined,
      coverUrl: undefined,
    }));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const toggleFavorite = () => {
    setMetadata({ ...metadata, isFavorite: !metadata.isFavorite });
  };

  const toggleCollection = (collectionId: string) => {
    const newSet = new Set(selectedCollections);
    if (newSet.has(collectionId)) {
      newSet.delete(collectionId);
    } else {
      newSet.add(collectionId);
    }
    setSelectedCollections(newSet);
    setMetadata({ ...metadata, collectionIds: Array.from(newSet) });
  };

  // a11y: ESC to close, simple focus trap within the panel
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panelRef.current) {
        const nodes = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (!nodes.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onKey]);

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <button
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />

      {/* Panel: mobile bottom sheet, desktop centered dialog */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-title"
        className="absolute inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 w-full md:max-w-4xl md:-translate-x-1/2 md:-translate-y-1/2 bg-white shadow-2xl md:rounded-xl pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] max-h-[95vh] flex flex-col"
      >
        {/* Grabber (mobile) */}
        <div className="md:hidden pt-2">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2 min-w-0">
            <h2
              id="edit-title"
              className="text-xl md:text-2xl font-bold text-gray-900 truncate"
            >
              Edit Metadata
            </h2>
            <span className="bg-slate-100 text-slate-700 font-semibold px-3 py-1 rounded-full text-xs flex-shrink-0">
              {itemType === "article"
                ? "Article"
                : itemType === "audiobook"
                ? "Audiobook"
                : "Book"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100"
            aria-label="Close"
          >
            <XMarkIcon className="h-6 w-6 text-slate-600" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="p-4 md:p-6 overflow-y-auto">
          {/* Error/Success Messages */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              {success}
            </div>
          )}

          {/* Item Type Selector */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Item Type
            </label>
            <select
              value={itemType}
              onChange={(e) => setItemType(e.target.value as ItemType)}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
            >
              <option value="book">Book</option>
              <option value="audiobook">Audiobook</option>
              <option value="article">Article</option>
            </select>
          </div>

          {/* Favorite Toggle - Always visible at top */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <button
              onClick={toggleFavorite}
              className="flex items-center gap-3 w-full"
            >
              {metadata.isFavorite ? (
                <StarIcon className="h-6 w-6 text-yellow-500" />
              ) : (
                <StarOutlineIcon className="h-6 w-6 text-gray-400" />
              )}
              <div className="text-left">
                <p className="font-medium text-gray-900">
                  {metadata.isFavorite ? "In Favorites" : "Add to Favorites"}
                </p>
                <p className="text-sm text-gray-500">
                  {metadata.isFavorite
                    ? "This book is marked as a favorite"
                    : "Click to add this book to your favorites"}
                </p>
              </div>
            </button>
          </div>

          {/* Cover Image Section */}
          <div className="mb-8 flex gap-4 md:gap-6 items-start flex-col sm:flex-row">
            <div className="flex-shrink-0">
              <div className="w-28 h-40 md:w-32 md:h-48 bg-gray-100 rounded-lg border border-gray-300 overflow-hidden flex items-center justify-center">
                {coverPreview ? (
                  <img
                    src={coverPreview}
                    alt="Book cover"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <svg
                    className="h-10 w-10 md:h-12 md:w-12 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                    />
                  </svg>
                )}
              </div>
            </div>

            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Book Cover
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleManualCoverSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors cursor-pointer"
                >
                  Upload Cover
                </button>
                {coverPreview && (
                  <button
                    onClick={handleRemoveCover}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-medium transition-colors cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Tabs for organizing fields */}
          <div className="border-b border-gray-200 mb-6 overflow-x-auto hide-scrollbar">
            <nav className="-mb-px flex space-x-6 min-w-max" aria-label="Tabs">
              <button
                onClick={() => setActiveTab("basic")}
                className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === "basic"
                    ? "border-slate-600 text-slate-900"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                Basic Info
              </button>
              <button
                onClick={() => setActiveTab("identifiers")}
                className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === "identifiers"
                    ? "border-slate-600 text-slate-900"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                Identifiers
              </button>
              <button
                onClick={() => setActiveTab("publication")}
                className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === "publication"
                    ? "border-slate-600 text-slate-900"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                Publication
              </button>
              <button
                onClick={() => setActiveTab("digital")}
                className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === "digital"
                    ? "border-slate-600 text-slate-900"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {itemType === "audiobook" ? "Media Details" : "Digital/Series"}
              </button>
              <button
                onClick={() => setActiveTab("user")}
                className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === "user"
                    ? "border-slate-600 text-slate-900"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                Personal
              </button>
              <button
                onClick={() => setActiveTab("collections")}
                className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === "collections"
                    ? "border-slate-600 text-slate-900"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                Collections
              </button>
            </nav>
          </div>

          <div className="space-y-6">
            {activeTab === "basic" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={metadata.title || ""}
                    onChange={(e) =>
                      setMetadata({ ...metadata, title: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                    placeholder="Book title"
                  />
                </div>
                {itemType === "article" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Journal/Publication
                    </label>
                    <input
                      type="text"
                      value={metadata.journalTitle || ""}
                      onChange={(e) =>
                        setMetadata({
                          ...metadata,
                          journalTitle: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                      placeholder="Journal or publication name"
                    />
                  </div>
                )}
                {(itemType === "book" || itemType === "audiobook") && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Subtitle
                    </label>
                    <input
                      type="text"
                      value={metadata.subtitle || ""}
                      onChange={(e) =>
                        setMetadata({ ...metadata, subtitle: e.target.value })
                      }
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                      placeholder="Book subtitle (if any)"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Author(s)
                    </label>
                    <input
                      type="text"
                      value={metadata.author || ""}
                      onChange={(e) =>
                        setMetadata({ ...metadata, author: e.target.value })
                      }
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                      placeholder="e.g., John Doe, Jane Smith"
                    />
                  </div>
                  {fieldVisibility.narrator && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Narrator(s)
                      </label>
                      <input
                        type="text"
                        value={metadata.audiobook?.narrator || ""}
                        onChange={(e) =>
                          handleAudiobookFieldChange("narrator", e.target.value)
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                        placeholder="e.g., Stephen Fry"
                      />
                    </div>
                  )}
                  {!fieldVisibility.narrator && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Editor(s)
                      </label>
                      <input
                        type="text"
                        value={metadata.editors || ""}
                        onChange={(e) =>
                          setMetadata({ ...metadata, editors: e.target.value })
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                        placeholder="For edited books"
                      />
                    </div>
                  )}
                </div>

                {fieldVisibility.narrator && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Editor(s)
                    </label>
                    <input
                      type="text"
                      value={metadata.editors || ""}
                      onChange={(e) =>
                        setMetadata({ ...metadata, editors: e.target.value })
                      }
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                      placeholder="For edited books"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Translator(s)
                  </label>
                  <input
                    type="text"
                    value={metadata.translators || ""}
                    onChange={(e) =>
                      setMetadata({
                        ...metadata,
                        translators: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                    placeholder="For translated works"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={metadata.description || ""}
                    onChange={(e) =>
                      setMetadata({ ...metadata, description: e.target.value })
                    }
                    rows={4}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20 resize-none"
                    placeholder="Brief description of the book..."
                  />
                </div>
              </>
            )}

            {activeTab === "identifiers" && (
              <>
                <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quick Identifier Lookup
                  </label>
                  <div className="flex gap-2 flex-col sm:flex-row">
                    <input
                      type="text"
                      value={identifierLookup}
                      onChange={(e) => setIdentifierLookup(e.target.value)}
                      placeholder={
                        itemType === "article"
                          ? "Enter DOI to auto-fill"
                          : itemType === "audiobook"
                          ? "Enter ISBN or ASIN..."
                          : "Enter ISBN to auto-fill"
                      }
                      className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleIdentifierFetch()
                      }
                    />
                    <button
                      onClick={handleIdentifierFetch}
                      disabled={isLoading || !identifierLookup.trim()}
                      className="cursor-pointer px-5 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                    >
                      {isLoading ? "Fetching..." : "Fetch Data"}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {fieldVisibility.isbn && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        ISBN
                      </label>
                      <input
                        type="text"
                        value={
                          (getIdentifier(metadata, "isbn") as string) || ""
                        }
                        onChange={(e) =>
                          handleIdentifierChange("isbn", e.target.value)
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                        placeholder="978-0-123456-78-9"
                      />
                    </div>
                  )}

                  {fieldVisibility.asin && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        ASIN
                      </label>
                      <input
                        type="text"
                        value={
                          (getIdentifier(metadata, "asin") as string) || ""
                        }
                        onChange={(e) =>
                          handleIdentifierChange("asin", e.target.value)
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                        placeholder="B08XYZ1234"
                      />
                    </div>
                  )}

                  {fieldVisibility.audibleAsin && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Audible ASIN
                      </label>
                      <input
                        type="text"
                        value={
                          (getIdentifier(metadata, "audibleAsin") as string) ||
                          ""
                        }
                        onChange={(e) =>
                          handleIdentifierChange("audibleAsin", e.target.value)
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                        placeholder="Audible-specific ASIN"
                      />
                    </div>
                  )}

                  {fieldVisibility.doi && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        DOI
                      </label>
                      <input
                        type="text"
                        value={(getIdentifier(metadata, "doi") as string) || ""}
                        onChange={(e) =>
                          handleIdentifierChange("doi", e.target.value)
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                        placeholder="10.1234/example"
                      />
                    </div>
                  )}

                  {fieldVisibility.issn && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        ISSN
                      </label>
                      <input
                        type="text"
                        value={
                          (getIdentifier(metadata, "issn") as string) || ""
                        }
                        onChange={(e) =>
                          handleIdentifierChange("issn", e.target.value)
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                        placeholder="1234-5678"
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === "publication" && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {fieldVisibility.publisher && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Publisher
                      </label>
                      <input
                        type="text"
                        value={metadata.publisher || ""}
                        onChange={(e) =>
                          setMetadata({
                            ...metadata,
                            publisher: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                        placeholder="Publisher name"
                      />
                    </div>
                  )}

                  {fieldVisibility.audioPublisher && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Audio Publisher
                      </label>
                      <input
                        type="text"
                        value={metadata.audiobook?.audioPublisher || ""}
                        onChange={(e) =>
                          handleAudiobookFieldChange(
                            "audioPublisher",
                            e.target.value
                          )
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                        placeholder="e.g., Audible Studios"
                      />
                    </div>
                  )}

                  {fieldVisibility.placeOfPublication && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Place of Publication
                      </label>
                      <input
                        type="text"
                        value={metadata.placeOfPublication || ""}
                        onChange={(e) =>
                          setMetadata({
                            ...metadata,
                            placeOfPublication: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                        placeholder="e.g., New York, NY"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Published Date
                    </label>
                    <input
                      type="text"
                      value={metadata.publishedDate || ""}
                      onChange={(e) =>
                        setMetadata({
                          ...metadata,
                          publishedDate: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                      placeholder="e.g., 2023 or March 2023"
                    />
                  </div>

                  {fieldVisibility.edition && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Edition
                      </label>
                      <input
                        type="text"
                        value={metadata.edition || ""}
                        onChange={(e) =>
                          setMetadata({ ...metadata, edition: e.target.value })
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                        placeholder="e.g., 2nd edition, Revised"
                      />
                    </div>
                  )}

                  {fieldVisibility.abridged && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Abridged
                      </label>
                      <select
                        value={metadata.audiobook?.abridged ? "true" : "false"}
                        onChange={(e) =>
                          handleAudiobookFieldChange(
                            "abridged",
                            e.target.value === "true"
                          )
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                      >
                        <option value="false">Unabridged</option>
                        <option value="true">Abridged</option>
                      </select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {fieldVisibility.pageCount && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Page Count
                      </label>
                      <input
                        type="number"
                        value={metadata.pageCount || ""}
                        onChange={(e) =>
                          setMetadata({
                            ...metadata,
                            pageCount: parseInt(e.target.value) || undefined,
                          })
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                        placeholder="320"
                      />
                    </div>
                  )}

                  {fieldVisibility.pageRange && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Pages
                      </label>
                      <input
                        type="text"
                        value={metadata.pageRange || ""}
                        onChange={(e) =>
                          setMetadata({
                            ...metadata,
                            pageRange: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                        placeholder="e.g., 123-145"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Language
                    </label>
                    <input
                      type="text"
                      value={metadata.language || ""}
                      onChange={(e) =>
                        setMetadata({ ...metadata, language: e.target.value })
                      }
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                      placeholder="English"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Original Language
                    </label>
                    <input
                      type="text"
                      value={metadata.originalLanguage || ""}
                      onChange={(e) =>
                        setMetadata({
                          ...metadata,
                          originalLanguage: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                      placeholder="For translations"
                    />
                  </div>
                </div>

                {/* Article-specific fields */}
                {itemType === "article" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Volume Number
                      </label>
                      <input
                        type="text"
                        value={metadata.volumeNumber || ""}
                        onChange={(e) =>
                          setMetadata({
                            ...metadata,
                            volumeNumber: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                        placeholder="Volume number"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Issue Number
                      </label>
                      <input
                        type="text"
                        value={metadata.issueNumber || ""}
                        onChange={(e) =>
                          setMetadata({
                            ...metadata,
                            issueNumber: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                        placeholder="Issue number"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Categories
                  </label>
                  <input
                    type="text"
                    value={(metadata.categories || []).join(", ")}
                    onChange={(e) =>
                      setMetadata({
                        ...metadata,
                        categories: e.target.value
                          .split(",")
                          .map((cat) => cat.trim())
                          .filter(Boolean),
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                    placeholder="Fiction, Science Fiction, Classic (comma-separated)"
                  />
                </div>
              </>
            )}

            {activeTab === "digital" && (
              <>
                {/* Audiobook-specific media details */}
                {itemType === "audiobook" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Duration
                        </label>
                        <input
                          type="text"
                          value={formatDuration(metadata.audiobook?.duration)}
                          onChange={(e) => {
                            const seconds = parseDuration(e.target.value);
                            handleAudiobookFieldChange("duration", seconds);
                          }}
                          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                          placeholder="e.g., 8h 30m"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Audio Format
                        </label>
                        <select
                          value={metadata.audiobook?.format || ""}
                          onChange={(e) =>
                            handleAudiobookFieldChange("format", e.target.value)
                          }
                          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                        >
                          <option value="">Select format...</option>
                          <option value="mp3">MP3</option>
                          <option value="m4a">M4A</option>
                          <option value="m4b">M4B</option>
                          <option value="audible">Audible</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Production Company
                      </label>
                      <input
                        type="text"
                        value={metadata.audiobook?.productionCompany || ""}
                        onChange={(e) =>
                          handleAudiobookFieldChange(
                            "productionCompany",
                            e.target.value
                          )
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                        placeholder="e.g., Penguin Audio"
                      />
                    </div>
                  </div>
                )}

                {/* Series information for books and audiobooks */}
                {(itemType === "book" || itemType === "audiobook") && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Series
                        </label>
                        <input
                          type="text"
                          value={metadata.series || ""}
                          onChange={(e) =>
                            setMetadata({ ...metadata, series: e.target.value })
                          }
                          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                          placeholder="e.g., Harry Potter"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Series Number
                        </label>
                        <input
                          type="text"
                          value={metadata.seriesNumber || ""}
                          onChange={(e) =>
                            setMetadata({
                              ...metadata,
                              seriesNumber: e.target.value,
                            })
                          }
                          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                          placeholder="e.g., 1 or Book 1"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Volume
                        </label>
                        <input
                          type="text"
                          value={metadata.volume || ""}
                          onChange={(e) =>
                            setMetadata({ ...metadata, volume: e.target.value })
                          }
                          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                          placeholder="For multi-volume works"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Number of Volumes
                        </label>
                        <input
                          type="number"
                          value={metadata.numberOfVolumes || ""}
                          onChange={(e) =>
                            setMetadata({
                              ...metadata,
                              numberOfVolumes:
                                parseInt(e.target.value) || undefined,
                            })
                          }
                          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                          placeholder="Total volumes in set"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    URL
                  </label>
                  <input
                    type="url"
                    value={metadata.url || ""}
                    onChange={(e) =>
                      setMetadata({ ...metadata, url: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                    placeholder="https://example.com/book"
                  />
                </div>

                {metadata.url && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Access Date
                    </label>
                    <input
                      type="date"
                      value={metadata.accessDate || ""}
                      onChange={(e) =>
                        setMetadata({ ...metadata, accessDate: e.target.value })
                      }
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                    />
                  </div>
                )}
              </>
            )}

            {activeTab === "user" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Your Rating
                  </label>
                  <select
                    value={metadata.userRating || ""}
                    onChange={(e) =>
                      setMetadata({
                        ...metadata,
                        userRating: parseInt(e.target.value) || undefined,
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                  >
                    <option value="">No rating</option>
                    <option value="1">★ 1 star</option>
                    <option value="2">★★ 2 stars</option>
                    <option value="3">★★★ 3 stars</option>
                    <option value="4">★★★★ 4 stars</option>
                    <option value="5">★★★★★ 5 stars</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Your Notes
                  </label>
                  <textarea
                    value={metadata.userNotes || ""}
                    onChange={(e) =>
                      setMetadata({ ...metadata, userNotes: e.target.value })
                    }
                    rows={4}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20 resize-none"
                    placeholder="Personal notes about this book..."
                  />
                </div>
              </>
            )}

            {activeTab === "collections" && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  Assign to Collections
                </h3>
                <div className="space-y-2 max-h-72 md:max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-3">
                  {collections.length === 0 ? (
                    <p className="text-sm text-gray-500 italic p-4 text-center">
                      No collections created yet. Create collections from the
                      sidebar to organize your books.
                    </p>
                  ) : (
                    collections.map((collection) => (
                      <label
                        key={collection.id}
                        className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedCollections.has(collection.id)}
                          onChange={() => toggleCollection(collection.id)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="text-sm text-gray-900">
                          {collection.parentId && "↳ "}
                          {collection.name}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 md:px-6 py-4 border-t border-gray-200 flex flex-col-reverse sm:flex-row sm:items-center gap-3 sm:justify-end bg-white flex-shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2 text-gray-700 hover:text-gray-900 font-medium rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            {isLoading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
