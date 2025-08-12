// src/components/NotesSidebar.tsx
import { useState, useEffect, useRef } from "react";
import { Book, BookNote } from "../types";
import { useNotesStore } from "../notesStore";
import { useReading } from "./ReadingContext";

interface Props {
  book: Book;
  isOpen: boolean;
  onToggle: () => void;
  currentReference: {
    type: "page" | "cfi" | "timestamp";
    value: string;
    raw: number | string;
  } | null;
  selectedText: string | null;
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
  currentReference,
  selectedText,
  onNavigateToNote,
}: Props) {
  const { getNotes, addNote, deleteNote, updateNote, exportNotes } =
    useNotesStore();

  const {
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
    <div className="w-full h-full bg-white flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 p-4 sticky top-0 bg-white z-10">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-slate-900">Notes</h3>
          <div className="flex items-center gap-2">
            {canCreateHighlight && (
              <button
                onClick={toggleHighlightsVisibility}
                className={`p-2 rounded hover:bg-slate-100 ${
                  highlightsVisible ? "text-amber-700" : "text-slate-500"
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
              className="p-2 rounded hover:bg-slate-100 text-slate-600"
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
              className="p-2 rounded hover:bg-slate-100 text-slate-600"
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

        {/* Search */}
        <input
          type="text"
          placeholder="Search notes…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 bg-white placeholder-slate-400"
        />

        {/* Context (page/chapter/timestamp) */}
        {displayReference && (
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
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

      {/* Note composer */}
      <div className="border-b border-slate-200 p-4">
        {isQuoteAvailable && (
          <div className="mb-3 flex rounded-lg bg-slate-100 p-1">
            <button
              onClick={() => setNoteMode("quick")}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-md ${
                noteMode === "quick"
                  ? "bg-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Quick Note
            </button>
            <button
              onClick={() => setNoteMode("quote")}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-md ${
                noteMode === "quote"
                  ? "bg-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
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
              className="mt-2 text-xs text-slate-600 hover:text-slate-900"
            >
              Clear selection
            </button>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          onFocus={() => {}}
          rows={3}
          placeholder={
            noteMode === "quote"
              ? "Add a note about the selected text…"
              : "Write a quick note…"
          }
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 resize-none"
        />

        <div className="mt-2 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {currentReference ? "" : "Navigate to a location to attach note."}
          </div>
          <button
            onClick={handleAddNote}
            className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
            disabled={!noteContent.trim() || !currentReference}
          >
            Add note
          </button>
        </div>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {filtered.length === 0 ? (
          <div className="p-6 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center mx-auto rounded-full bg-slate-100">
              <svg
                className="h-6 w-6 text-slate-400"
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
            <p className="text-sm font-medium text-slate-900 mb-1">
              No notes yet
            </p>
            <p className="text-xs text-slate-500">
              {isQuoteAvailable
                ? "Start taking notes while reading!"
                : "Start taking notes while listening!"}
            </p>
          </div>
        ) : (
          filtered.map((note) => (
            <div
              key={note.id}
              className="bg-slate-50 rounded-lg p-4 border border-slate-200 hover:border-slate-300 transition-colors"
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
                  <textarea
                    defaultValue={note.content}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 resize-none bg-white"
                    rows={3}
                    onBlur={(e) =>
                      handleUpdateNote(note.id, { content: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        handleUpdateNote(note.id, {
                          content: (e.currentTarget as HTMLTextAreaElement)
                            .value,
                        });
                      }
                      if (e.key === "Escape") setEditingNoteId(null);
                    }}
                    autoFocus
                  />
                  <div className="flex gap-3 text-xs">
                    <button
                      onClick={() =>
                        handleUpdateNote(note.id, {
                          content: (
                            document.querySelector(
                              "textarea"
                            ) as HTMLTextAreaElement
                          )?.value,
                        })
                      }
                      className="text-green-700 hover:text-green-900"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingNoteId(null)}
                      className="text-slate-600 hover:text-slate-900"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-slate-900 leading-relaxed mb-3">
                    {note.content}
                  </p>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleNavigateToNote(note)}
                        className="p-1 rounded hover:bg-slate-100"
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
                      <span>{new Date(note.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingNoteId(note.id)}
                        className="p-1 rounded hover:bg-slate-100"
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
    </div>
  );
}
