// src/components/BookMetadataEntry.tsx
import { useState, useRef, useEffect, useCallback } from "react";
import { BookMetadata, ItemType } from "../types";
import { cleanISBN, fetchBookDataFromISBN } from "../utils/isbn";
import { fetchArticleDataFromDOI } from "../utils/doi";
import { useStore } from "../store";
import CoverPreview from "./CoverPreview";
import { TagInput } from "./CategoriesInput";
import { useAudioDuration } from "../hooks/useAudioDuration";
import {
  getFieldVisibility,
  getIdentifier,
  setIdentifier,
  formatDuration,
  parseDuration,
  migrateMetadata,
} from "../utils/metadataHelpers";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface Props {
  fileName: string;
  onSave: (metadata: BookMetadata, coverFile?: File) => void;
  onSkip: () => void;
}

export function BookMetadataEntry({ fileName, onSave, onSkip }: Props) {
  // Detect initial item type from filename
  const getInitialItemType = (filename: string): ItemType => {
    const ext = filename.toLowerCase();
    if (ext.match(/\.(mp3|wav|m4a|m4b|aac|flac|ogg)$/)) {
      return "audiobook";
    }
    // Default to book for PDFs and EPUBs (can be changed by user)
    return "book";
  };

  const [itemType, setItemType] = useState<ItemType>(
    getInitialItemType(fileName)
  );
  const [metadata, setMetadata] = useState<Partial<BookMetadata>>({
    title: fileName.replace(/\.[^/.]+$/, ""),
    itemType: itemType,
    identifiers: {},
    audiobook: itemType === "audiobook" ? {} : undefined,
  });
  const [identifierLookup, setIdentifierLookup] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [manualCoverFile, setManualCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<
    "basic" | "identifiers" | "publication" | "digital" | "user"
  >("basic");

  // Get field visibility based on item type
  const fieldVisibility = getFieldVisibility(itemType);

  const panelRef = useRef<HTMLDivElement>(null);

  // Get the pending file from store for duration and format detection
  const pendingFile = useStore.getState().pendingBook;
  const {
    duration: detectedDuration,
    format: detectedFormat,
    isLoading: isDurationLoading,
    error: durationError,
  } = useAudioDuration(pendingFile, itemType);

  // Update metadata when duration or format is detected
  useEffect(() => {
    if (itemType === "audiobook") {
      if (detectedDuration !== null) {
        handleAudiobookFieldChange("duration", detectedDuration);
      }
      if (detectedFormat !== null) {
        handleAudiobookFieldChange("format", detectedFormat);
      }
    }
  }, [detectedDuration, detectedFormat, itemType]);

  // Update metadata when item type changes
  useEffect(() => {
    setMetadata((prev) => ({
      ...prev,
      itemType: itemType,
      audiobook: itemType === "audiobook" ? prev.audiobook || {} : undefined,
    }));
  }, [itemType]);

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

  const handleIdentifierFetch = async () => {
    if (!identifierLookup.trim()) return;

    setIsLoading(true);
    try {
      let bookData: any = null;

      if (itemType === "article") {
        bookData = await fetchArticleDataFromDOI(identifierLookup.trim());
      } else {
        const cleaned = cleanISBN(identifierLookup.trim());
        bookData = await fetchBookDataFromISBN(cleaned);
      }

      if (bookData) {
        // Migrate the fetched data to new format
        const migratedData = migrateMetadata(bookData);
        setMetadata((prev) => ({
          ...prev,
          ...migratedData,
          itemType: itemType,
        }));
        if (bookData.coverUrl) setCoverPreview(bookData.coverUrl);
      } else {
        alert(
          itemType === "article"
            ? "No article found with that DOI. Please enter manually."
            : "No book found with that ISBN. Please enter manually."
        );
      }
    } catch {
      alert("Error fetching data. Please try again.");
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
      reader.onload = (e) => setCoverPreview(e.target?.result as string);
      reader.readAsDataURL(file);

      setMetadata((prev) => ({ ...prev, coverUrl: undefined }));
    }
  };

  const handleRemoveCover = () => {
    setManualCoverFile(null);
    setCoverPreview(null);
    setMetadata((prev) => ({ ...prev, coverUrl: undefined }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = () => {
    const completeMetadata: BookMetadata = {
      title: metadata.title || fileName.replace(/\.[^/.]+$/, ""),
      subtitle: metadata.subtitle,
      author: metadata.author,
      editors: metadata.editors,
      translators: metadata.translators,
      itemType: itemType,
      identifiers: metadata.identifiers,
      audiobook: metadata.audiobook,
      publisher: metadata.publisher,
      publishedDate: metadata.publishedDate,
      placeOfPublication: metadata.placeOfPublication,
      edition: metadata.edition,
      journalTitle: metadata.journalTitle,
      volumeNumber: metadata.volumeNumber,
      issueNumber: metadata.issueNumber,
      pageRange: metadata.pageRange,
      articleNumber: metadata.articleNumber,
      series: metadata.series,
      seriesNumber: metadata.seriesNumber,
      volume: metadata.volume,
      url: metadata.url,
      accessDate: metadata.accessDate,
      description: metadata.description,
      pageCount: metadata.pageCount,
      numberOfVolumes: metadata.numberOfVolumes,
      categories: metadata.categories || [],
      language: metadata.language,
      originalLanguage: metadata.originalLanguage,
      coverFile: metadata.coverFile,
      coverUrl: metadata.coverUrl,
      userRating: metadata.userRating,
      userNotes: metadata.userNotes,
      dateAdded: new Date().toISOString(),
    };

    onSave(completeMetadata, manualCoverFile || undefined);
  };

  // a11y: ESC to close, simple focus trap within the panel
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
      if (e.key === "Tab" && panelRef.current) {
        const nodes = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onSkip]
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
        onClick={onSkip}
        aria-label="Close"
      />

      {/* Panel: mobile bottom sheet, desktop centered dialog */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="entry-title"
        className="absolute inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 w-full md:max-w-4xl md:-translate-x-1/2 md:-translate-y-1/2 theme-bg-primary shadow-2xl md:rounded-xl pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] max-h-[95vh] flex flex-col"
      >
        {/* Grabber (mobile) */}
        <div className="md:hidden pt-2">
          <div className="mx-auto h-1.5 w-12 rounded-full theme-bg-tertiary" />
        </div>

        {/* Header */}
        <div className="rounded-lg px-6 py-4 border-b theme-border flex items-center justify-between sticky top-0 theme-bg-primary z-10">
          <div>
            <h2
              id="entry-title"
              className="text-xl md:text-2xl font-bold theme-text-primary"
            >
              Add Book Metadata
            </h2>
            <p className="text-sm theme-text-secondary mt-1 truncate">
              Fill in the details for "
              <span className="font-medium">{fileName}</span>"
            </p>
          </div>
          <button
            onClick={onSkip}
            className="p-2 rounded-lg hover\:theme-bg-tertiary"
            aria-label="Close"
          >
            <XMarkIcon className="h-6 w-6 theme-text-secondary" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 md:p-6 overflow-y-auto">
          {/* Item Type Selector */}
          <div className="mb-6">
            <label className="block text-sm font-medium theme-text-secondary mb-2">
              Item Type
            </label>
            <select
              value={itemType}
              onChange={(e) => setItemType(e.target.value as ItemType)}
              className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
            >
              <option value="book">Book</option>
              <option value="audiobook">Audiobook</option>
              <option value="article">Article</option>
            </select>
          </div>

          {/* Cover Image Section */}
          <CoverPreview
            coverPreview={coverPreview}
            onCoverSelect={handleManualCoverSelect}
            onRemoveCover={handleRemoveCover}
          />

          {/* Tabs */}
          <div className="border-b theme-border mb-6 overflow-x-auto hide-scrollbar">
            <nav className="-mb-px flex space-x-6 min-w-max" aria-label="Tabs">
              <button
                onClick={() => setActiveTab("basic")}
                className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === "basic"
                    ? "border-slate-600 theme-text-primary"
                    : "border-transparent theme-text-secondary hover:theme-text-secondary hover:theme-border"
                }`}
              >
                Basic Info
              </button>
              <button
                onClick={() => setActiveTab("identifiers")}
                className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === "identifiers"
                    ? "border-slate-600 theme-text-primary"
                    : "border-transparent theme-text-secondary hover:theme-text-secondary hover:theme-border"
                }`}
              >
                Identifiers
              </button>
              <button
                onClick={() => setActiveTab("publication")}
                className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === "publication"
                    ? "border-slate-600 theme-text-primary"
                    : "border-transparent theme-text-secondary hover:theme-text-secondary hover:theme-border"
                }`}
              >
                Publication
              </button>
              <button
                onClick={() => setActiveTab("digital")}
                className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === "digital"
                    ? "border-slate-600 theme-text-primary"
                    : "border-transparent theme-text-secondary hover:theme-text-secondary hover:theme-border"
                }`}
              >
                {itemType === "audiobook" ? "Media Details" : "Digital/Series"}
              </button>
              <button
                onClick={() => setActiveTab("user")}
                className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === "user"
                    ? "border-slate-600 theme-text-primary"
                    : "border-transparent theme-text-secondary hover:theme-text-secondary hover:theme-border"
                }`}
              >
                Personal
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="space-y-6">
            {activeTab === "basic" && (
              <>
                <div>
                  <label className="block text-sm font-medium theme-text-secondary mb-2">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={metadata.title || ""}
                    onChange={(e) =>
                      setMetadata({ ...metadata, title: e.target.value })
                    }
                    className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                    placeholder="Book title"
                  />
                </div>

                {itemType === "article" && (
                  <div>
                    <label className="block text-sm font-medium theme-text-secondary mb-2">
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
                      className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                      placeholder="Journal or publication name"
                    />
                  </div>
                )}

                {(itemType === "book" || itemType === "audiobook") && (
                  <div>
                    <label className="block text-sm font-medium theme-text-secondary mb-2">
                      Subtitle
                    </label>
                    <input
                      type="text"
                      value={metadata.subtitle || ""}
                      onChange={(e) =>
                        setMetadata({ ...metadata, subtitle: e.target.value })
                      }
                      className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                      placeholder="Book subtitle (if any)"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium theme-text-secondary mb-2">
                      Author(s)
                    </label>
                    <input
                      type="text"
                      value={metadata.author || ""}
                      onChange={(e) =>
                        setMetadata({ ...metadata, author: e.target.value })
                      }
                      className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                      placeholder="e.g., John Doe, Jane Smith"
                    />
                  </div>
                  {fieldVisibility.narrator && (
                    <div>
                      <label className="block text-sm font-medium theme-text-secondary mb-2">
                        Narrator(s)
                      </label>
                      <input
                        type="text"
                        value={metadata.audiobook?.narrator || ""}
                        onChange={(e) =>
                          handleAudiobookFieldChange("narrator", e.target.value)
                        }
                        className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                        placeholder="e.g., Stephen Fry"
                      />
                    </div>
                  )}
                  {!fieldVisibility.narrator && (
                    <div>
                      <label className="block text-sm font-medium theme-text-secondary mb-2">
                        Editor(s)
                      </label>
                      <input
                        type="text"
                        value={metadata.editors || ""}
                        onChange={(e) =>
                          setMetadata({ ...metadata, editors: e.target.value })
                        }
                        className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                        placeholder="For edited books"
                      />
                    </div>
                  )}
                </div>

                {fieldVisibility.narrator && (
                  <div>
                    <label className="block text-sm font-medium theme-text-secondary mb-2">
                      Editor(s)
                    </label>
                    <input
                      type="text"
                      value={metadata.editors || ""}
                      onChange={(e) =>
                        setMetadata({ ...metadata, editors: e.target.value })
                      }
                      className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                      placeholder="For edited books"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium theme-text-secondary mb-2">
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
                    className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                    placeholder="For translated works"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium theme-text-secondary mb-2">
                    Description
                  </label>
                  <textarea
                    value={metadata.description || ""}
                    onChange={(e) =>
                      setMetadata({ ...metadata, description: e.target.value })
                    }
                    rows={4}
                    className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20 resize-none"
                    placeholder="Brief description..."
                  />
                </div>
              </>
            )}

            {activeTab === "identifiers" && (
              <>
                <div className="theme-bg-secondary rounded-lg p-4 mb-6 border theme-border">
                  <label className="block text-sm font-medium theme-text-secondary mb-2">
                    Quick Identifier Lookup
                  </label>
                  <div className="flex items-center gap-2 flex-col sm:flex-row">
                    <input
                      type="text"
                      value={identifierLookup}
                      onChange={(e) => setIdentifierLookup(e.target.value)}
                      placeholder={
                        itemType === "article"
                          ? "Enter DOI to auto-fill"
                          : "Enter ISBN to auto-fill"
                      }
                      className="flex-1 rounded-lg border theme-border px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleIdentifierFetch()
                      }
                    />
                    <button
                      onClick={handleIdentifierFetch}
                      disabled={isLoading || !identifierLookup.trim()}
                      className="cursor-pointer px-5 py-2 theme-btn-primary rounded-lg hover:theme-btn-primary disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                    >
                      {isLoading ? "Fetching..." : "Fetch Data"}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {fieldVisibility.isbn && (
                    <div>
                      <label className="block text-sm font-medium theme-text-secondary mb-2">
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
                        className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                        placeholder="978-0-123456-78-9"
                      />
                    </div>
                  )}

                  {fieldVisibility.asin && (
                    <div>
                      <label className="block text-sm font-medium theme-text-secondary mb-2">
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
                        className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                        placeholder="B08XYZ1234"
                      />
                    </div>
                  )}

                  {fieldVisibility.audibleAsin && (
                    <div>
                      <label className="block text-sm font-medium theme-text-secondary mb-2">
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
                        className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                        placeholder="Audible-specific ASIN"
                      />
                    </div>
                  )}

                  {fieldVisibility.doi && (
                    <div>
                      <label className="block text-sm font-medium theme-text-secondary mb-2">
                        DOI
                      </label>
                      <input
                        type="text"
                        value={(getIdentifier(metadata, "doi") as string) || ""}
                        onChange={(e) =>
                          handleIdentifierChange("doi", e.target.value)
                        }
                        className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                        placeholder="10.1234/example"
                      />
                    </div>
                  )}

                  {fieldVisibility.issn && (
                    <div>
                      <label className="block text-sm font-medium theme-text-secondary mb-2">
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
                        className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
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
                      <label className="block text-sm font-medium theme-text-secondary mb-2">
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
                        className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                        placeholder="Publisher name"
                      />
                    </div>
                  )}

                  {fieldVisibility.audioPublisher && (
                    <div>
                      <label className="block text-sm font-medium theme-text-secondary mb-2">
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
                        className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                        placeholder="e.g., Audible Studios"
                      />
                    </div>
                  )}

                  {fieldVisibility.placeOfPublication && (
                    <div>
                      <label className="block text-sm font-medium theme-text-secondary mb-2">
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
                        className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                        placeholder="e.g., New York, NY"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium theme-text-secondary mb-2">
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
                      className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                      placeholder="e.g., 2023 or March 2023"
                    />
                  </div>

                  {fieldVisibility.edition && (
                    <div>
                      <label className="block text-sm font-medium theme-text-secondary mb-2">
                        Edition
                      </label>
                      <input
                        type="text"
                        value={metadata.edition || ""}
                        onChange={(e) =>
                          setMetadata({ ...metadata, edition: e.target.value })
                        }
                        className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                        placeholder="e.g., 2nd edition, Revised"
                      />
                    </div>
                  )}

                  {fieldVisibility.abridged && (
                    <div>
                      <label className="block text-sm font-medium theme-text-secondary mb-2">
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
                        className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
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
                      <label className="block text-sm font-medium theme-text-secondary mb-2">
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
                        className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                        placeholder="320"
                      />
                    </div>
                  )}

                  {fieldVisibility.pageRange && (
                    <div>
                      <label className="block text-sm font-medium theme-text-secondary mb-2">
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
                        className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                        placeholder="e.g., 123-145"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium theme-text-secondary mb-2">
                      Language
                    </label>
                    <input
                      type="text"
                      value={metadata.language || ""}
                      onChange={(e) =>
                        setMetadata({ ...metadata, language: e.target.value })
                      }
                      className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                      placeholder="English"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium theme-text-secondary mb-2">
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
                      className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                      placeholder="For translations"
                    />
                  </div>
                </div>

                {/* Article-specific fields */}
                {itemType === "article" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium theme-text-secondary mb-2">
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
                        className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                        placeholder="Volume number"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium theme-text-secondary mb-2">
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
                        className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                        placeholder="Issue number"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium theme-text-secondary mb-2">
                    Categories
                  </label>
                  <TagInput
                    value={metadata.categories}
                    onChange={(categories) =>
                      setMetadata({ ...metadata, categories })
                    }
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
                        <label className="block text-sm font-medium theme-text-secondary mb-2">
                          Duration
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={
                              metadata.audiobook?.duration
                                ? formatDuration(metadata.audiobook.duration)
                                : isDurationLoading
                                ? "Detecting..."
                                : durationError
                                ? "Detection failed"
                                : "Not detected"
                            }
                            readOnly
                            className={`flex-1 rounded-lg border theme-border theme-bg-secondary px-4 py-3 text-sm ${
                              durationError
                                ? "text-red-500"
                                : "theme-text-secondary"
                            }`}
                            placeholder="Auto-detected"
                            title={durationError || undefined}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const input = prompt(
                                durationError
                                  ? `Detection failed: ${durationError}\n\nEnter duration manually (e.g., 8h 25m):`
                                  : "Enter duration (e.g., 8h 25m):"
                              );
                              if (input) {
                                const seconds = parseDuration(input);
                                if (seconds) {
                                  handleAudiobookFieldChange(
                                    "duration",
                                    seconds
                                  );
                                }
                              }
                            }}
                            className="px-3 py-2 text-sm theme-bg-secondary hover:theme-bg-tertiary rounded-lg"
                          >
                            Edit
                          </button>
                        </div>
                        {durationError && (
                          <p className="text-xs text-red-500 mt-1">
                            {durationError}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium theme-text-secondary mb-2">
                          Audio Format
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={
                              metadata.audiobook?.format || detectedFormat || ""
                            }
                            onChange={(e) =>
                              handleAudiobookFieldChange(
                                "format",
                                e.target.value
                              )
                            }
                            className="flex-1 rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                          >
                            <option value="">Select format...</option>
                            <option value="mp3">MP3</option>
                            <option value="m4a">M4A</option>
                            <option value="m4b">M4B</option>
                            <option value="aac">AAC</option>
                            <option value="flac">FLAC</option>
                            <option value="ogg">OGG/Opus</option>
                            <option value="wav">WAV</option>
                            <option value="other">Other</option>
                          </select>
                          {detectedFormat && (
                            <span className="px-3 py-3 text-xs theme-text-muted">
                              Auto-detected: {detectedFormat.toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium theme-text-secondary mb-2">
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
                        className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
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
                        <label className="block text-sm font-medium theme-text-secondary mb-2">
                          Series
                        </label>
                        <input
                          type="text"
                          value={metadata.series || ""}
                          onChange={(e) =>
                            setMetadata({ ...metadata, series: e.target.value })
                          }
                          className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                          placeholder="e.g., Harry Potter"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium theme-text-secondary mb-2">
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
                          className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                          placeholder="e.g., 1 or Book 1"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium theme-text-secondary mb-2">
                          Volume
                        </label>
                        <input
                          type="text"
                          value={metadata.volume || ""}
                          onChange={(e) =>
                            setMetadata({ ...metadata, volume: e.target.value })
                          }
                          className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                          placeholder="For multi-volume works"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium theme-text-secondary mb-2">
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
                          className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                          placeholder="Total volumes in set"
                        />
                      </div>
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-sm font-medium theme-text-secondary mb-2">
                    URL
                  </label>
                  <input
                    type="url"
                    value={metadata.url || ""}
                    onChange={(e) =>
                      setMetadata({ ...metadata, url: e.target.value })
                    }
                    className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                    placeholder="https://example.com/book"
                  />
                </div>
                {metadata.url && (
                  <div>
                    <label className="block text-sm font-medium theme-text-secondary mb-2">
                      Access Date
                    </label>
                    <input
                      type="date"
                      value={metadata.accessDate || ""}
                      onChange={(e) =>
                        setMetadata({ ...metadata, accessDate: e.target.value })
                      }
                      className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                    />
                  </div>
                )}
              </>
            )}

            {activeTab === "user" && (
              <>
                <div>
                  <label className="block text-sm font-medium theme-text-secondary mb-2">
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
                    className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
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
                  <label className="block text-sm font-medium theme-text-secondary mb-2">
                    Your Notes
                  </label>
                  <textarea
                    value={metadata.userNotes || ""}
                    onChange={(e) =>
                      setMetadata({ ...metadata, userNotes: e.target.value })
                    }
                    rows={4}
                    className="w-full rounded-lg border theme-border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20 resize-none"
                    placeholder="Personal notes about this book..."
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="rounded-lg px-4 md:px-6 py-4 border-t theme-border flex justify-between items-center gap-3 bottom-0 theme-bg-primary">
          <button
            onClick={onSkip}
            className="px-6 py-2 theme-text-secondary hover\:theme-text-primary font-medium rounded-lg transition-colors cursor-pointer"
          >
            Skip
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 theme-btn-primary rounded-lg hover:theme-btn-primary font-medium transition-colors cursor-pointer"
          >
            Save Metadata
          </button>
        </div>
      </div>
    </div>
  );
}
