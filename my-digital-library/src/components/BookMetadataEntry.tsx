// src/components/BookMetadataEntry.tsx
import { useState, useRef, useEffect, useCallback } from "react";
import { BookMetadata } from "../types";
import { cleanISBN, fetchBookDataFromISBN } from "../utils/isbn";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface Props {
  fileName: string;
  onSave: (metadata: BookMetadata, coverFile?: File) => void;
  onSkip: () => void;
}

export function BookMetadataEntry({ fileName, onSave, onSkip }: Props) {
  const [metadata, setMetadata] = useState<Partial<BookMetadata>>({
    title: fileName.replace(/\.[^/.]+$/, ""),
  });
  const [isbnLookup, setIsbnLookup] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [manualCoverFile, setManualCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<
    "basic" | "publication" | "digital" | "user"
  >("basic");

  const panelRef = useRef<HTMLDivElement>(null);

  const handleISBNFetch = async () => {
    if (!isbnLookup.trim()) return;

    setIsLoading(true);
    try {
      const cleaned = cleanISBN(isbnLookup.trim());
      const bookData = await fetchBookDataFromISBN(cleaned);

      if (bookData) {
        setMetadata((prev) => ({ ...prev, ...bookData }));
        if (bookData.coverUrl) setCoverPreview(bookData.coverUrl);
      } else {
        alert("No book found with that ISBN. Please enter manually.");
      }
    } catch {
      alert("Error fetching book data. Please try again.");
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
      isbn: metadata.isbn,
      publisher: metadata.publisher,
      publishedDate: metadata.publishedDate,
      placeOfPublication: metadata.placeOfPublication,
      edition: metadata.edition,
      series: metadata.series,
      seriesNumber: metadata.seriesNumber,
      volume: metadata.volume,
      doi: metadata.doi,
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
        className="absolute inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 w-full md:max-w-4xl md:-translate-x-1/2 md:-translate-y-1/2 bg-white shadow-2xl md:rounded-xl pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] max-h-[95vh] flex flex-col"
      >
        {/* Grabber (mobile) */}
        <div className="md:hidden pt-2">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2
              id="entry-title"
              className="text-xl md:text-2xl font-bold text-gray-900"
            >
              Add Book Metadata
            </h2>
            <p className="text-sm text-gray-600 mt-1 truncate">
              Fill in the book details for "
              <span className="font-medium">{fileName}</span>"
            </p>
          </div>
          <button
            onClick={onSkip}
            className="p-2 rounded-lg hover:bg-slate-100"
            aria-label="Close"
          >
            <XMarkIcon className="h-6 w-6 text-slate-600" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 md:p-6 overflow-y-auto">
          {/* ISBN Lookup Section */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Identifier Lookup
            </label>
            <div className="flex items-center gap-2 flex-col sm:flex-row">
              <input
                type="text"
                value={isbnLookup}
                onChange={(e) => setIsbnLookup(e.target.value)}
                placeholder="Enter ISBN to auto-fill"
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                onKeyDown={(e) => e.key === "Enter" && handleISBNFetch()}
              />
              <button
                onClick={handleISBNFetch}
                disabled={isLoading || !isbnLookup.trim()}
                className="cursor-pointer px-5 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium transition-colors"
              >
                {isLoading ? "Fetching..." : "Fetch Data"}
              </button>
            </div>
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

          {/* Tabs */}
          <div className="border-b border-gray-200 mb-6 overflow-x-auto">
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
                Digital/Series
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
            </nav>
          </div>

          {/* Tab Content */}
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
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                      ISBN
                    </label>
                    <input
                      type="text"
                      value={metadata.isbn || ""}
                      onChange={(e) =>
                        setMetadata({ ...metadata, isbn: e.target.value })
                      }
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                      placeholder="978-0-123456-78-9"
                    />
                  </div>
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

            {activeTab === "publication" && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Publisher
                    </label>
                    <input
                      type="text"
                      value={metadata.publisher || ""}
                      onChange={(e) =>
                        setMetadata({ ...metadata, publisher: e.target.value })
                      }
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                      placeholder="Publisher name"
                    />
                  </div>
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
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    DOI
                  </label>
                  <input
                    type="text"
                    value={metadata.doi || ""}
                    onChange={(e) =>
                      setMetadata({ ...metadata, doi: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
                    placeholder="10.1234/example.doi"
                  />
                </div>

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
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 md:px-6 py-4 border-t border-gray-200 flex justify-between items-center gap-3 sticky bottom-0 bg-white">
          <button
            onClick={onSkip}
            className="px-6 py-2 text-gray-700 hover:text-gray-900 font-medium rounded-lg transition-colors cursor-pointer"
          >
            Skip
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 font-medium transition-colors cursor-pointer"
          >
            Save Metadata
          </button>
        </div>
      </div>
    </div>
  );
}
