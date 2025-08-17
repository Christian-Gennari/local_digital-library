// src/components/BookDetailsSidebar.tsx
import { useState, useEffect, useCallback } from "react";
import { ReferenceGenerator } from "./ReferenceGenerator";
import { useStore } from "../store";
import { BookMetadataEditor } from "./BookMetadataEditor";
import { ConfirmationModal } from "./ConfirmationModal";
import { Book } from "../types";
import { getAllIdentifiers, formatDuration } from "../utils/metadataHelpers";
import {
  PencilSquareIcon,
  BookOpenIcon,
  DocumentIcon,
  PlayIcon,
  CalendarIcon,
  ClockIcon,
  TagIcon,
  LanguageIcon,
  BuildingOfficeIcon,
  DocumentTextIcon,
  AcademicCapIcon,
  UserGroupIcon,
  BookmarkIcon,
  IdentificationIcon,
  MapPinIcon,
  FolderIcon,
  LinkIcon,
  TrashIcon,
  CheckIcon,
  MicrophoneIcon,
  SpeakerWaveIcon,
} from "@heroicons/react/24/outline";
import { getCoverImageSrc } from "../utils/coverUtils";

export function BookDetailsSidebar() {
  const { selectedBook, openBook, removeBook } = useStore();
  const [showReferenceGenerator, setShowReferenceGenerator] = useState(false);
  const [coverSrc, setCoverSrc] = useState<string | null>(null);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [expandedSections, setExpandedSections] = useState<{
    [key: string]: boolean;
  }>({
    identifiers: false,
    basic: true,
    media: false,
    publication: false,
    series: false,
    digital: false,
    personal: false,
  });

  const itemType = selectedBook?.metadata.itemType || "book";

  useEffect(() => {
    if (selectedBook) {
      loadCoverImage();
    } else {
      setCoverSrc(null);
    }
  }, [selectedBook]);
  const loadCoverImage = async () => {
    if (!selectedBook) return;

    const coverUrl = await getCoverImageSrc(selectedBook);
    setCoverSrc(coverUrl);
  };

  const getIconForFormat = (format: string) => {
    switch (format) {
      case "pdf":
        return (
          <DocumentIcon className="h-16 w-16 sm:h-24 sm:w-24 text-gray-400" />
        );
      case "epub":
        return (
          <BookOpenIcon className="h-16 w-16 sm:h-24 sm:w-24 text-gray-400" />
        );
      case "audio":
        return <PlayIcon className="h-16 w-16 sm:h-24 sm:w-24 text-gray-400" />;
      default:
        return (
          <BookOpenIcon className="h-16 w-16 sm:h-24 sm:w-24 text-gray-400" />
        );
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const copyToClipboard = useCallback(async (value: string, key: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {
      // noop
    }
  }, []);

  if (!selectedBook) {
    return (
      <div className="w-full sm:w-80 bg-gray-50 border-l border-gray-200 p-6 flex items-center justify-center">
        <p className="text-gray-500 text-center">
          Select a book to view details
        </p>
      </div>
    );
  }

  const handleDeleteBook = async () => {
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

  return (
    <div className="w-full sm:w-80 bg-gray-50 border-l border-gray-200 flex flex-col h-full">
      {/* Sticky Header with Cover */}
      <div className="p-4 sm:p-6 bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-start gap-4 mb-3">
          <div className="flex-shrink-0 w-20 h-28 sm:w-24 sm:h-36 bg-gray-100 rounded-lg overflow-hidden shadow">
            {coverSrc ? (
              <img
                src={coverSrc}
                alt={selectedBook.metadata.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-200">
                {getIconForFormat(selectedBook.format)}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Item Type Badge */}
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mb-2 ${
                itemType === "audiobook"
                  ? "bg-purple-100 text-purple-800"
                  : itemType === "article"
                  ? "bg-green-100 text-green-800"
                  : "bg-blue-100 text-blue-800"
              }`}
            >
              {itemType === "audiobook"
                ? "🎧 Audiobook"
                : itemType === "article"
                ? "📄 Article"
                : "📚 Book"}
            </span>

            <h3 className="font-bold text-gray-900 text-base sm:text-lg leading-tight mb-1 line-clamp-2">
              {selectedBook.metadata.title}
            </h3>
            {selectedBook.metadata.subtitle && (
              <p className="text-xs sm:text-sm text-gray-600 italic mb-1 line-clamp-1">
                {selectedBook.metadata.subtitle}
              </p>
            )}
            {(selectedBook.metadata.author ||
              selectedBook.metadata.editors) && (
              <p className="text-xs sm:text-sm text-gray-600">
                {selectedBook.metadata.author
                  ? `by ${selectedBook.metadata.author}`
                  : `Edited by ${selectedBook.metadata.editors}`}
              </p>
            )}

            {/* Narrator for audiobooks */}
            {itemType === "audiobook" &&
              selectedBook.metadata.audiobook?.narrator && (
                <p className="text-xs sm:text-sm text-gray-600 mt-1">
                  Narrated by {selectedBook.metadata.audiobook.narrator}
                </p>
              )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => openBook(selectedBook)}
            className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all font-medium text-sm cursor-pointer"
          >
            Open Book
          </button>

          <div className="flex gap-2">
            <button
              onClick={() => setIsEditingMetadata(true)}
              className="p-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
              title="Edit metadata"
              aria-label="Edit metadata"
            >
              <PencilSquareIcon className="h-5 w-5" />
            </button>
            <button
              onClick={() => setShowReferenceGenerator(true)}
              className="p-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
              title="Generate reference"
              aria-label="Generate reference"
            >
              <AcademicCapIcon className="h-5 w-5" />
            </button>
            <button
              onClick={() => setBookToDelete(selectedBook)}
              className="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors cursor-pointer"
              title="Delete book"
              aria-label="Delete book"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Reading Progress */}
        {(selectedBook.metadata.readingProgress ?? 0) > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-xs sm:text-sm text-gray-600 mb-1">
              <span>Reading Progress</span>
              <span>{selectedBook.metadata.readingProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${selectedBook.metadata.readingProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* User Rating */}
        {selectedBook.metadata.userRating && (
          <div className="mt-3">
            <p className="text-xs sm:text-sm text-gray-600 mb-1">Your Rating</p>
            <div className="flex">
              {[...Array(5)].map((_, i) => (
                <span
                  key={i}
                  className={`text-lg sm:text-xl ${
                    i < selectedBook.metadata.userRating!
                      ? "text-yellow-400"
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

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-gray-50 hide-scrollbar">
        {/* Description */}
        {selectedBook.metadata.description && (
          <div>
            <p className="text-[10px] sm:text-xs text-gray-500 font-semibold mb-2 uppercase tracking-wide">
              Description
            </p>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <p
                className={`text-sm text-gray-700 leading-relaxed ${
                  !isDescriptionExpanded ? "line-clamp-8" : ""
                }`}
              >
                {selectedBook.metadata.description}
              </p>
              {selectedBook.metadata.description.length > 200 && (
                <button
                  onClick={() =>
                    setIsDescriptionExpanded(!isDescriptionExpanded)
                  }
                  className="mt-3 text-blue-600 hover:text-blue-500 transition-all text-xs font-semibold cursor-pointer"
                >
                  {isDescriptionExpanded ? "Read less" : "Read more"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Accordion Sections */}
        <div className="space-y-4">
          {/* Identifiers Section */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <button
              onClick={() => toggleSection("identifiers")}
              className="w-full flex items-center justify-between text-left p-4 cursor-pointer"
              aria-expanded={expandedSections.identifiers}
              aria-controls="section-identifiers"
            >
              <h4 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">
                Identifiers
              </h4>
              <svg
                className={`h-4 w-4 text-gray-500 transform transition-transform ${
                  expandedSections.identifiers ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {expandedSections.identifiers && (
              <div
                id="section-identifiers"
                className="p-4 pt-4 border-t border-gray-200 space-y-3"
              >
                {getAllIdentifiers(selectedBook.metadata).map((identifier) => (
                  <div
                    key={`${identifier.type}-${identifier.value}`}
                    className="flex items-start gap-3"
                  >
                    <DocumentTextIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500">
                        {identifier.label}
                      </p>
                      <p className="text-sm text-gray-900 break-all">
                        {identifier.value}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        copyToClipboard(identifier.value, identifier.type)
                      }
                      className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700 cursor-pointer"
                      title={`Copy ${identifier.label}`}
                    >
                      {copiedKey === identifier.type ? (
                        <CheckIcon className="w-4 h-4 text-green-600" />
                      ) : (
                        "Copy"
                      )}
                    </button>
                  </div>
                ))}

                {getAllIdentifiers(selectedBook.metadata).length === 0 && (
                  <p className="text-sm text-gray-500 italic">
                    No identifiers available
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Media Details Section (for audiobooks) */}
          {itemType === "audiobook" && selectedBook.metadata.audiobook && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <button
                onClick={() => toggleSection("media")}
                className="w-full flex items-center justify-between text-left p-4 cursor-pointer"
                aria-expanded={expandedSections.media}
                aria-controls="section-media"
              >
                <h4 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">
                  Media Details
                </h4>
                <svg
                  className={`h-4 w-4 text-gray-500 transform transition-transform ${
                    expandedSections.media ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {expandedSections.media && (
                <div
                  id="section-media"
                  className="p-4 pt-4 border-t border-gray-200 space-y-4"
                >
                  {selectedBook.metadata.audiobook.narrator && (
                    <div className="flex items-start gap-3">
                      <MicrophoneIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500">Narrator</p>
                        <p className="text-sm text-gray-900">
                          {selectedBook.metadata.audiobook.narrator}
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedBook.metadata.audiobook.duration && (
                    <div className="flex items-start gap-3">
                      <ClockIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500">Duration</p>
                        <p className="text-sm text-gray-900">
                          {formatDuration(
                            selectedBook.metadata.audiobook.duration
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedBook.metadata.audiobook.format && (
                    <div className="flex items-start gap-3">
                      <SpeakerWaveIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500">Format</p>
                        <p className="text-sm text-gray-900">
                          {selectedBook.metadata.audiobook.format.toUpperCase()}
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedBook.metadata.audiobook.abridged !== undefined && (
                    <div className="flex items-start gap-3">
                      <BookOpenIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500">Version</p>
                        <p className="text-sm text-gray-900">
                          {selectedBook.metadata.audiobook.abridged
                            ? "Abridged"
                            : "Unabridged"}
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedBook.metadata.audiobook.audioPublisher && (
                    <div className="flex items-start gap-3">
                      <BuildingOfficeIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500">Audio Publisher</p>
                        <p className="text-sm text-gray-900">
                          {selectedBook.metadata.audiobook.audioPublisher}
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedBook.metadata.audiobook.productionCompany && (
                    <div className="flex items-start gap-3">
                      <BuildingOfficeIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500">
                          Production Company
                        </p>
                        <p className="text-sm text-gray-900">
                          {selectedBook.metadata.audiobook.productionCompany}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Basic Information */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <button
              onClick={() => toggleSection("basic")}
              className="w-full flex items-center justify-between text-left p-4 cursor-pointer"
              aria-expanded={expandedSections.basic}
              aria-controls="section-basic"
            >
              <h4 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">
                Basic Information
              </h4>
              <svg
                className={`h-4 w-4 text-gray-500 transform transition-transform ${
                  expandedSections.basic ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {expandedSections.basic && (
              <div
                id="section-basic"
                className="p-4 pt-4 border-t border-gray-200 space-y-4"
              >
                {/* Article-only fields */}
                {itemType === "article" && (
                  <>
                    {selectedBook.metadata.journalTitle && (
                      <div className="flex items-start gap-3">
                        <BookOpenIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Journal</p>
                          <p className="text-sm text-gray-900">
                            {selectedBook.metadata.journalTitle}
                          </p>
                        </div>
                      </div>
                    )}

                    {(selectedBook.metadata.volumeNumber ||
                      selectedBook.metadata.issueNumber) && (
                      <div className="flex items-start gap-3">
                        <DocumentIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Volume/Issue</p>
                          <p className="text-sm text-gray-900">
                            {selectedBook.metadata.volumeNumber &&
                              `Vol. ${selectedBook.metadata.volumeNumber}`}
                            {selectedBook.metadata.volumeNumber &&
                              selectedBook.metadata.issueNumber &&
                              ", "}
                            {selectedBook.metadata.issueNumber &&
                              `Issue ${selectedBook.metadata.issueNumber}`}
                          </p>
                        </div>
                      </div>
                    )}

                    {selectedBook.metadata.pageRange && (
                      <div className="flex items-start gap-3">
                        <DocumentTextIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Pages</p>
                          <p className="text-sm text-gray-900">
                            {selectedBook.metadata.pageRange}
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {selectedBook.metadata.language && (
                  <div className="flex items-start gap-3">
                    <LanguageIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500">Language</p>
                      <p className="text-sm text-gray-900">
                        {selectedBook.metadata.language}
                        {selectedBook.metadata.originalLanguage && (
                          <span className="text-gray-500 text-xs ml-1">
                            (Original: {selectedBook.metadata.originalLanguage})
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {selectedBook.metadata.translators && (
                  <div className="flex items-start gap-3">
                    <UserGroupIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500">Translator(s)</p>
                      <p className="text-sm text-gray-900">
                        {selectedBook.metadata.translators}
                      </p>
                    </div>
                  </div>
                )}

                {selectedBook.metadata.pageCount && (
                  <div className="flex items-start gap-3">
                    <DocumentIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500">Pages</p>
                      <p className="text-sm text-gray-900">
                        {selectedBook.metadata.pageCount}
                        {selectedBook.metadata.numberOfVolumes && (
                          <span className="text-gray-500 text-xs ml-1">
                            ({selectedBook.metadata.numberOfVolumes} volumes)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {selectedBook.metadata.categories &&
                  selectedBook.metadata.categories.length > 0 && (
                    <div className="flex items-start gap-3">
                      <TagIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Categories</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedBook.metadata.categories.map(
                            (category, index) => (
                              <span
                                key={index}
                                className="text-xs font-medium bg-gray-100 text-gray-700 px-2.5 py-0.5 rounded-full"
                              >
                                {category}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            )}
          </div>

          {/* Publication Details */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <button
              onClick={() => toggleSection("publication")}
              className="w-full flex items-center justify-between text-left p-4 cursor-pointer"
              aria-expanded={expandedSections.publication}
              aria-controls="section-publication"
            >
              <h4 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">
                Publication Details
              </h4>
              <svg
                className={`h-4 w-4 text-gray-500 transform transition-transform ${
                  expandedSections.publication ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {expandedSections.publication && (
              <div
                id="section-publication"
                className="p-4 pt-4 border-t border-gray-200 space-y-4"
              >
                {selectedBook.metadata.publisher && (
                  <div className="flex items-start gap-3">
                    <BuildingOfficeIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500">Publisher</p>
                      <p className="text-sm text-gray-900">
                        {selectedBook.metadata.publisher}
                      </p>
                    </div>
                  </div>
                )}

                {selectedBook.metadata.placeOfPublication && (
                  <div className="flex items-start gap-3">
                    <MapPinIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500">
                        Place of Publication
                      </p>
                      <p className="text-sm text-gray-900">
                        {selectedBook.metadata.placeOfPublication}
                      </p>
                    </div>
                  </div>
                )}

                {selectedBook.metadata.publishedDate && (
                  <div className="flex items-start gap-3">
                    <CalendarIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500">Published</p>
                      <p className="text-sm text-gray-900">
                        {selectedBook.metadata.publishedDate}
                      </p>
                    </div>
                  </div>
                )}

                {selectedBook.metadata.edition && (
                  <div className="flex items-start gap-3">
                    <AcademicCapIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500">Edition</p>
                      <p className="text-sm text-gray-900">
                        {selectedBook.metadata.edition}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Series Information */}
          {(selectedBook.metadata.series || selectedBook.metadata.volume) && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <button
                onClick={() => toggleSection("series")}
                className="w-full flex items-center justify-between text-left p-4 cursor-pointer"
                aria-expanded={expandedSections.series}
                aria-controls="section-series"
              >
                <h4 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">
                  Series Information
                </h4>
                <svg
                  className={`h-4 w-4 text-gray-500 transform transition-transform ${
                    expandedSections.series ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {expandedSections.series && (
                <div
                  id="section-series"
                  className="p-4 pt-4 border-t border-gray-200 space-y-4"
                >
                  {selectedBook.metadata.series && (
                    <div className="flex items-start gap-3">
                      <FolderIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500">Series</p>
                        <p className="text-sm text-gray-900">
                          {selectedBook.metadata.series}
                          {selectedBook.metadata.seriesNumber && (
                            <span className="text-gray-500 ml-1">
                              #{selectedBook.metadata.seriesNumber}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedBook.metadata.volume && (
                    <div className="flex items-start gap-3">
                      <BookmarkIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500">Volume</p>
                        <p className="text-sm text-gray-900">
                          {selectedBook.metadata.volume}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Digital Information */}
          {selectedBook.metadata.url && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <button
                onClick={() => toggleSection("digital")}
                className="w-full flex items-center justify-between text-left p-4 cursor-pointer"
                aria-expanded={expandedSections.digital}
                aria-controls="section-digital"
              >
                <h4 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">
                  Digital Information
                </h4>
                <svg
                  className={`h-4 w-4 text-gray-500 transform transition-transform ${
                    expandedSections.digital ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {expandedSections.digital && (
                <div
                  id="section-digital"
                  className="p-4 pt-4 border-t border-gray-200 space-y-4"
                >
                  {selectedBook.metadata.url && (
                    <div className="flex items-start gap-3">
                      <LinkIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-500">URL</p>
                        <a
                          href={selectedBook.metadata.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline break-all"
                        >
                          {selectedBook.metadata.url}
                        </a>
                        {selectedBook.metadata.accessDate && (
                          <p className="text-xs text-gray-500 mt-1">
                            Accessed:{" "}
                            {formatDate(selectedBook.metadata.accessDate)}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Miscellaneous */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <button
              onClick={() => toggleSection("personal")}
              className="w-full flex items-center justify-between text-left p-4 cursor-pointer"
              aria-expanded={expandedSections.personal}
              aria-controls="section-personal"
            >
              <h4 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">
                Miscellaneous
              </h4>
              <svg
                className={`h-4 w-4 text-gray-500 transform transition-transform ${
                  expandedSections.personal ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {expandedSections.personal && (
              <div
                id="section-personal"
                className="p-4 pt-4 border-t border-gray-200 space-y-4"
              >
                <div className="flex items-start gap-3">
                  <CalendarIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-500">Added to Library</p>
                    <p className="text-sm text-gray-900">
                      {formatDate(selectedBook.metadata.dateAdded)}
                    </p>
                  </div>
                </div>

                {selectedBook.metadata.lastRead && (
                  <div className="flex items-start gap-3">
                    <ClockIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500">Last Read</p>
                      <p className="text-sm text-gray-900">
                        {formatDate(selectedBook.metadata.lastRead)}
                      </p>
                    </div>
                  </div>
                )}

                {selectedBook.metadata.userNotes && (
                  <div>
                    <p className="text-xs text-gray-500 font-semibold mb-2 uppercase tracking-wide">
                      Your Notes
                    </p>
                    <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-200">
                      {selectedBook.metadata.userNotes}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metadata Editor Modal */}
      {isEditingMetadata && (
        <BookMetadataEditor
          book={selectedBook}
          onClose={() => setIsEditingMetadata(false)}
        />
      )}

      {/* Reference Generator Modal */}
      {showReferenceGenerator && (
        <ReferenceGenerator
          book={selectedBook}
          onClose={() => setShowReferenceGenerator(false)}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmationModal
        isOpen={bookToDelete !== null}
        title="Delete Book"
        message={`Are you sure you want to delete "${bookToDelete?.metadata.title}"? This will permanently remove the book file and all associated notes from your library.`}
        confirmText={isDeleting ? "Deleting..." : "Delete"}
        cancelText="Cancel"
        onConfirm={handleDeleteBook}
        onCancel={cancelDeleteBook}
        isDestructive={true}
      />
    </div>
  );
}
