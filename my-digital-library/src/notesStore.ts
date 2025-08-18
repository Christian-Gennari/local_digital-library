// src/notesStore.ts
import { create } from "zustand";
import { BookNote, BookNotes, HighlightData } from "./types";
import { useStore } from "./store";
import { RemoteFS } from "./fsRemote";
import { parseNoteLinks } from "./utils/noteLinking";

interface NotesStore {
  notesCache: Map<string, BookNote[]>;

  getNotes: (bookId: string) => Promise<BookNote[]>;
  addNote: (bookId: string, note: Omit<BookNote, "id">) => Promise<string>;
  updateNote: (
    bookId: string,
    noteId: string,
    updates: Partial<BookNote>
  ) => Promise<void>;
  deleteNote: (bookId: string, noteId: string) => Promise<void>;
  exportNotes: (bookId: string, bookTitle: string) => Promise<void>;
  searchNotes: (bookId: string, query: string) => Promise<BookNote[]>;
  getNotesWithBookInfo: (bookId: string) => Promise<{
    bookId: string;
    bookTitle: string;
    bookAuthor?: string;
    bookCover?: string;
    bookFormat: string;
    notes: BookNote[];
    metadata: any;
  } | null>;

  // Highlight-specific methods
  getHighlights: (bookId: string) => Promise<HighlightData[]>;
  removeNoteWithHighlight: (bookId: string, noteId: string) => Promise<void>;
  updateNoteHighlight: (
    bookId: string,
    noteId: string,
    highlight: HighlightData
  ) => Promise<void>;

  // Alias for ReadingContext.applyPendingHighlight
  attachHighlightToNote: (args: {
    bookId: string;
    noteId: string;
    highlight: HighlightData;
  }) => Promise<void>;
}

const generateNoteId = () => crypto.randomUUID();

// ---------- Remote helpers (Express API) ----------
const loadNotesRemote = async (bookId: string): Promise<BookNote[]> => {
  const data = await RemoteFS.getNotes(bookId);
  return (data?.notes as BookNote[]) || [];
};

const saveNotesRemote = async (bookId: string, notes: BookNote[]) => {
  const payload: BookNotes = {
    bookId,
    notes,
    lastUpdated: new Date().toISOString(),
  };
  await RemoteFS.saveNotes(bookId, payload);
};

export const useNotesStore = create<NotesStore>((set, get) => ({
  notesCache: new Map(),

  getNotes: async (bookId: string) => {
    // cache
    const cached = get().notesCache.get(bookId);
    if (cached) return cached;

    const { books } = useStore.getState();
    const book = books.find((b) => b.id === bookId);
    if (!book) return [];

    try {
      const notes = await loadNotesRemote(bookId);

      const newCache = new Map(get().notesCache);
      newCache.set(bookId, notes);
      set({ notesCache: newCache });

      return notes;
    } catch (e) {
      console.error("Failed to load notes:", e);
      return [];
    }
  },

  // Returns new note ID (used to attach a highlight immediately after)
  addNote: async (bookId, noteData) => {
    const { books } = useStore.getState();
    const book = books.find((b) => b.id === bookId);
    if (!book) throw new Error("Book not found");

    const noteId = generateNoteId();
    const linkedConcepts = parseNoteLinks(noteData.content);

    const newNote: BookNote = {
      ...noteData,
      id: noteId,
      linkedConcepts,
      backlinks: [],
    };

    const currentNotes = await get().getNotes(bookId);
    const updatedNotes = [...currentNotes, newNote];

    await saveNotesRemote(bookId, updatedNotes);

    // Clear concept cache when adding new note
    sessionStorage.removeItem("concept-cache");

    const newCache = new Map(get().notesCache);
    newCache.set(bookId, updatedNotes);
    set({ notesCache: newCache });

    return noteId;
  },

  // Update updateNote method
  updateNote: async (bookId, noteId, updates) => {
    const { books } = useStore.getState();
    const book = books.find((b) => b.id === bookId);
    if (!book) throw new Error("Book not found");

    const currentNotes = await get().getNotes(bookId);

    let finalUpdates = { ...updates };
    if (updates.content !== undefined) {
      finalUpdates.linkedConcepts = parseNoteLinks(updates.content);
    }

    const updatedNotes = currentNotes.map((n) =>
      n.id === noteId ? { ...n, ...finalUpdates } : n
    );

    await saveNotesRemote(bookId, updatedNotes);

    // Clear concept cache when updating note
    sessionStorage.removeItem("concept-cache");

    const newCache = new Map(get().notesCache);
    newCache.set(bookId, updatedNotes);
    set({ notesCache: newCache });
  },

  deleteNote: async (bookId, noteId) => {
    const { books } = useStore.getState();
    const book = books.find((b) => b.id === bookId);
    if (!book) throw new Error("Book not found");

    const currentNotes = await get().getNotes(bookId);
    const updatedNotes = currentNotes.filter((n) => n.id !== noteId);

    await saveNotesRemote(bookId, updatedNotes);

    const newCache = new Map(get().notesCache);
    newCache.set(bookId, updatedNotes);
    set({ notesCache: newCache });
  },

  exportNotes: async (bookId, fallbackTitle) => {
    const { books } = useStore.getState();
    const book = books.find((b) => b.id === bookId);
    if (!book) return;

    try {
      const notes = await get().getNotes(bookId);

      // Get metadata + format for export header
      const metadata = await RemoteFS.getMetadata(bookId);
      const format = book.format;

      const title = (metadata?.title || fallbackTitle || "Notes").replace(
        /[<>:"/\\|?*]/g,
        ""
      );

      const lines: string[] = [];
      lines.push(`# ${metadata?.title || fallbackTitle || "Notes"}`);
      if (metadata?.author) lines.push(`Author: ${metadata.author}`);
      if (metadata?.publishedDate)
        lines.push(`Published: ${metadata.publishedDate}`);
      lines.push("");

      notes.forEach((n) => {
        const parts: string[] = [];
        // Header
        parts.push(`- ${n.content || "(empty note)"}  `);

        // Quote (for pdf/epub)
        if (n.quote) {
          parts.push(`   "${n.quote}"`);
        }

        // Reference
        if (n.reference) {
          const ref =
            n.reference.type === "page"
              ? `Page ${n.reference.raw}`
              : n.reference.type === "cfi"
              ? `EPUB loc ${String(n.reference.raw).slice(0, 80)}…`
              : `Timestamp ${n.reference.value}`;
          parts.push(`   ↳ ${ref}`);
        }

        // Highlight
        if (n.highlight) {
          if (format === "pdf" && n.highlight.pdf) {
            parts.push(`   [HIGHLIGHT] Page ${n.highlight.pdf.page}`);
          } else if (format === "epub" && n.highlight.epub) {
            parts.push(
              `   [HIGHLIGHT] ${n.highlight.epub.href || "Unknown location"}`
            );
          }
          if ((n.highlight as any).color) {
            parts.push(`   Color: ${(n.highlight as any).color}`);
          }
        }

        lines.push(parts.join("\n"));
      });

      const blob = new Blob([lines.join("\n")], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}-notes.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to export notes:", e);
      alert("Failed to export notes");
    }
  },

  getNotesWithBookInfo: async (bookId: string) => {
    const { books } = useStore.getState();
    const book = books.find((b) => b.id === bookId);
    if (!book) return null;

    const notes = await get().getNotes(bookId);
    const metadata = await RemoteFS.getMetadata(bookId);

    return {
      bookId,
      bookTitle: metadata?.title || "Unknown Title",
      bookAuthor: metadata?.author,
      bookCover: metadata?.coverFile,
      bookFormat: book.format,
      notes,
      metadata,
    };
  },

  searchNotes: async (bookId: string, query: string) => {
    const notes = await get().getNotes(bookId);
    const q = query.toLowerCase();
    return notes.filter((n) => {
      const inContent = n.content?.toLowerCase().includes(q);
      const inQuote = n.quote?.toLowerCase().includes(q);
      const inRef = n.reference?.value?.toLowerCase().includes(q);
      const inHl = n.highlight?.textContent
        ? n.highlight.textContent.toLowerCase().includes(q)
        : false;
      return !!(inContent || inQuote || inRef || inHl);
    });
  },

  getHighlights: async (bookId: string) => {
    const notes = await get().getNotes(bookId);
    return notes
      .map((n) => n.highlight)
      .filter((h): h is HighlightData => !!h && (!!h.pdf || !!h.epub));
  },

  removeNoteWithHighlight: async (bookId: string, noteId: string) => {
    await get().deleteNote(bookId, noteId);
  },

  updateNoteHighlight: async (bookId, noteId, highlight) => {
    await get().updateNote(bookId, noteId, { highlight });
  },

  attachHighlightToNote: async ({ bookId, noteId, highlight }) => {
    await get().updateNoteHighlight(bookId, noteId, highlight);
  },
}));
