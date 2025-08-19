// src/components/NotesSidebar.tsx
import { useState, useEffect, useRef } from "react";
import { Book, BookNote } from "../types";
import { useNotesStore } from "../notesStore";
import { useReading } from "./ReadingContext";
// ADD THESE THREE IMPORTS:
import { SmartNoteTextarea } from "./SmartNoteTextarea";
import { LinkedConceptModal } from "./LinkedConceptModal";
import { renderNoteContent } from "../utils/noteLinking";

interface Props {
  book: Book;
  isOpen: boolean;
  onToggle: () => void;
  selectedText: string | null; // Keep this
  onNavigateToNote?: (reference: {
    type: "page" | "cfi" | "timestamp";
    value: string;
    raw: number | string;
  }) => void;
}

export function NotesSidebar({
  book,
  isOpen,
  onToggle,
  selectedText,
  onNavigateToNote,
}: Props) {
  const { getNotes, addNote, deleteNote, updateNote, exportNotes } =
    useNotesStore();

  const {
    currentReference,
    highlightsVisible,
    pendingHighlight,
    canCreateHighlight,
    createHighlightFromSelection,
    clearPendingHighlight,
    applyPendingHighlight,
    toggleHighlightsVisibility,
    removeNoteHighlight,
    refreshHighlights,
  } = useReading();

  const [notes, setNotes] = useState<BookNote[]>([]);
  const [noteContent, setNoteContent] = useState("");
  const [noteMode, setNoteMode] = useState<"quick" | "quote">("quick");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  // ADD THESE TWO NEW STATE VARIABLES:
  const [showConceptModal, setShowConceptModal] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");

  const [preservedSelectedText, setPreservedSelectedText] = useState<
    string | null
  >(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isQuoteAvailable = book.format !== "audio";

  const sortNotesByLocation = (arr: BookNote[]): BookNote[] => {
    return [...(arr || [])].sort((a, b) => {
      const aRaw = a.reference.raw;
      const bRaw = b.reference.raw;
      if (typeof aRaw === "number" && typeof bRaw === "number")
        return aRaw - bRaw;

      const aNum =
        typeof aRaw === "string" ? parseFloat(aRaw) : (aRaw as number);
      const bNum =
        typeof bRaw === "string" ? parseFloat(bRaw) : (bRaw as number);
      if (!Number.isNaN(aNum) && !Number.isNaN(bNum))
        return (aNum as number) - (bNum as number);

      return String(aRaw).localeCompare(String(bRaw));
    });
  };

  const getDisplayReference = (reference: typeof currentReference) => {
    if (!reference) return null;
    const displayValue = reference.value;
    if (book.format === "epub") {
      if (
        displayValue === "Starting Chapter" ||
        displayValue === "Unknown Chapter" ||
        displayValue === "Unknown Location"
      ) {
        return "Current Location";
      }
      return displayValue;
    }
    return displayValue;
  };

  useEffect(() => {
    loadNotes();
  }, [book.id]);

  useEffect(() => {
    if (isQuoteAvailable && selectedText && selectedText.trim()) {
      setPreservedSelectedText(selectedText.trim());
      setNoteMode("quote");
    }
  }, [selectedText, isQuoteAvailable]);

  const loadNotes = async () => {
    const bookNotes = await getNotes(book.id);
    setNotes(bookNotes);
  };

  const handleAddNote = async () => {
    if (!noteContent.trim()) return;
    if (!currentReference) {
      alert("Unable to determine current location. Please try again.");
      return;
    }
    try {
      let highlightData = null;
      if (noteMode === "quote" && preservedSelectedText && canCreateHighlight) {
        highlightData = await createHighlightFromSelection();
      }

      // Now we don't need to exclude linkedConcepts and backlinks
      const newNote: Omit<BookNote, "id"> = {
        content: noteContent.trim(),
        quote:
          noteMode === "quote" && preservedSelectedText && isQuoteAvailable
            ? preservedSelectedText
            : undefined,
        reference: currentReference,
        createdAt: new Date().toISOString(),
        tags: [],
        highlight: highlightData || undefined,
        // linkedConcepts and backlinks are optional, so we don't need to specify them
      };

      const noteId = await addNote(book.id, newNote);
      if (highlightData && noteId) applyPendingHighlight(noteId);

      setNoteContent("");
      setNoteMode("quick");
      setPreservedSelectedText(null);

      await loadNotes();
      await refreshHighlights();
    } catch (e) {
      console.error(e);
      clearPendingHighlight();
      alert("Failed to add note. Please try again.");
    }
  };

  const handleUpdateNote = async (
    noteId: string,
    updates: Partial<BookNote>
  ) => {
    await updateNote(book.id, noteId, updates);
    setEditingNoteId(null);
    setEditingContent(""); // ADD: Clear editing content
    await loadNotes();
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm("Delete this note?")) return;
    try {
      removeNoteHighlight(noteId);
      await deleteNote(book.id, noteId);
      await loadNotes();
      await refreshHighlights();
    } catch (e) {
      console.error(e);
      alert("Failed to delete note. Please try again.");
    }
  };

  const handleExportNotes = async () => {
    await exportNotes(book.id, book.metadata.title);
  };

  const handleNavigateToNote = (note: BookNote) => {
    onNavigateToNote?.(note.reference);
  };

  const filtered = sortNotesByLocation(
    notes.filter((n) =>
      searchTerm
        ? n.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
          n.quote?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          n.highlight?.textContent
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
        : true
    )
  );

  const displayReference = getDisplayReference(currentReference);

  if (!isOpen) {
    // Hidden as an overlay drawer; the opener is controlled by the parent.
    return null;
  }

  return (
    <div className="w-full h-full theme-bg-primary flex flex-col">
      {/* Header - KEEP EXACTLY AS IS */}
      <div className="border-b theme-border p-4 sticky top-0 theme-bg-primary z-10">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold theme-text-primary">Notes</h3>
          <div className="flex items-center gap-2">
            {canCreateHighlight && (
              <button
                onClick={toggleHighlightsVisibility}
                className={`p-2 rounded hover\:theme-bg-tertiary ${
                  highlightsVisible ? "text-amber-700" : "theme-text-secondary"
                }`}
                title={
                  highlightsVisible ? "Hide highlights" : "Show highlights"
                }
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>
            )}
            <button
              onClick={handleExportNotes}
              className="p-2 rounded hover\:theme-bg-tertiary theme-text-secondary"
              title="Export notes"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
            </button>
            <button
              onClick={onToggle}
              className="p-2 rounded hover\:theme-bg-tertiary theme-text-secondary"
              aria-label="Close notes"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Search - KEEP AS IS */}
        <input
          type="text"
          placeholder="Search notes…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 text-sm border theme-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 theme-bg-primary placeholder:theme-text-muted"
        />

        {/* Context - KEEP AS IS */}
        {displayReference && (
          <div className="mt-2 inline-flex items-center gap-2 rounded-full theme-bg-tertiary px-3 py-1 text-xs theme-text-secondary">
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
              />
            </svg>
            {displayReference}
          </div>
        )}
      </div>

      {/* Note composer - KEEP MOST AS IS, JUST CHANGE TEXTAREA */}
      <div className="border-b theme-border p-4">
        {isQuoteAvailable && (
          <div className="mb-3 flex rounded-lg theme-bg-tertiary p-1">
            <button
              onClick={() => setNoteMode("quick")}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-md ${
                noteMode === "quick"
                  ? "theme-bg-primary shadow-sm"
                  : "theme-text-secondary hover\:theme-text-primary"
              }`}
            >
              Quick Note
            </button>
            <button
              onClick={() => setNoteMode("quote")}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-md ${
                noteMode === "quote"
                  ? "theme-bg-primary shadow-sm"
                  : "theme-text-secondary hover\:theme-text-primary"
              }`}
            >
              Quote + Note
            </button>
          </div>
        )}

        {!isQuoteAvailable && (
          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs font-medium text-blue-800 mb-1">
              Audio Format
            </p>
            <p className="text-sm text-blue-900">
              Only quick notes are available for audiobooks.
            </p>
          </div>
        )}

        {isQuoteAvailable && noteMode === "quote" && preservedSelectedText && (
          <div className="mb-3 p-3 bg-amber-50 border-amber-200 border rounded-lg">
            <p className="text-xs font-medium text-amber-800 mb-2">
              Selected text:
            </p>
            <p className="text-sm italic text-amber-900">
              "{preservedSelectedText.slice(0, 200)}
              {preservedSelectedText.length > 200 ? "…" : ""}"
            </p>
            <button
              onClick={() => {
                setPreservedSelectedText(null);
                setNoteMode("quick");
                if (pendingHighlight) clearPendingHighlight();
              }}
              className="mt-2 text-xs theme-text-secondary hover\:theme-text-primary"
            >
              Clear selection
            </button>
          </div>
        )}

        {/* REPLACE TEXTAREA WITH SMART TEXTAREA */}
        <SmartNoteTextarea
          value={noteContent}
          onChange={setNoteContent}
          placeholder={
            noteMode === "quote"
              ? "Add a note about the selected text…"
              : "Write a quick note…"
          }
          rows={3}
          disabled={!currentReference}
        />

        <div className="mt-2 flex items-center justify-between">
          <div className="text-xs theme-text-secondary">
            {currentReference
              ? "Type [[ to link concepts"
              : "Navigate to a location to attach note."}
          </div>
          <button
            onClick={handleAddNote}
            className="px-3 py-2 rounded-lg theme-btn-primary text-sm font-medium hover:theme-btn-primary disabled:opacity-50 cursor-pointer"
            disabled={!noteContent.trim() || !currentReference}
          >
            Add note
          </button>
        </div>
      </div>

      {/* Notes list - KEEP MOSTLY AS IS */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {filtered.length === 0 ? (
          <div className="p-6 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center mx-auto rounded-full theme-bg-tertiary">
              <svg
                className="h-6 w-6 theme-text-muted"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium theme-text-primary mb-1">
              No notes yet
            </p>
            <p className="text-xs theme-text-secondary">
              {isQuoteAvailable
                ? "Start taking notes while reading!"
                : "Start taking notes while listening!"}
            </p>
          </div>
        ) : (
          filtered.map((note) => (
            <div
              key={note.id}
              className="theme-bg-secondary rounded-lg p-4 border theme-border hover\:theme-border transition-colors"
            >
              {note.quote && isQuoteAvailable && (
                <div className="mb-3 p-3 bg-amber-50 border-l-4 border-amber-400 rounded-md">
                  <p className="text-sm italic text-amber-900">
                    "{note.quote}"
                  </p>
                </div>
              )}

              {editingNoteId === note.id ? (
                <div className="space-y-2">
                  {/* REPLACE TEXTAREA WITH SMART TEXTAREA FOR EDITING */}
                  <SmartNoteTextarea
                    value={editingContent}
                    onChange={setEditingContent}
                    rows={3}
                  />
                  <div className="flex gap-3 text-xs">
                    <button
                      onClick={() =>
                        handleUpdateNote(note.id, { content: editingContent })
                      }
                      className="text-green-700 hover:text-green-900"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditingNoteId(null);
                        setEditingContent("");
                      }}
                      className="theme-text-secondary hover\:theme-text-primary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {/* REPLACE PLAIN TEXT WITH RENDERED CONTENT */}
                  <div className="text-sm theme-text-primary leading-relaxed mb-3">
                    {renderNoteContent(note.content, (concept) =>
                      setShowConceptModal(concept)
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs theme-text-secondary">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleNavigateToNote(note)}
                        className="p-1 rounded hover\:theme-bg-tertiary"
                        title="Go to this location"
                      >
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                          />
                        </svg>
                      </button>
                      <span>
                        {
                          book.format === "audio" &&
                          note.reference.type === "timestamp"
                            ? note.reference.value // Shows "15:32" format
                            : book.format === "pdf" &&
                              note.reference.type === "page"
                            ? note.reference.value // Shows "Page 42"
                            : book.format === "epub" &&
                              note.reference.type === "cfi"
                            ? note.reference.value // Shows chapter name
                            : new Date(note.createdAt).toLocaleString() // Fallback to creation date
                        }
                      </span>{" "}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingNoteId(note.id);
                          setEditingContent(note.content); // ADD: Set content for editing
                        }}
                        className="p-1 rounded hover\:theme-bg-tertiary"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        className="p-1 rounded text-red-600 hover:bg-red-100"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* ADD CONCEPT MODAL AT THE END */}
      {showConceptModal && (
        <LinkedConceptModal
          concept={showConceptModal}
          onClose={() => setShowConceptModal(null)}
        />
      )}
    </div>
  );
}
