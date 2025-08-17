// src/store.ts
import { create } from "zustand";
import type { Book, BookMetadata, ConflictResolution, ItemType } from "./types";
import { fetchBookDataFromISBN } from "./utils/isbn";
import { fetchArticleDataFromDOI } from "./utils/doi";
import { getIdentifier } from "./utils/metadataHelpers";
import { useCollectionsStore } from "./collectionsStore";
import { RemoteFS } from "./fsRemote";

// -------------------- Shared helpers --------------------
const sanitizeFolderName = (name: string): string => {
  return name
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
};

const generateFolderName = (metadata: BookMetadata): string => {
  const itemType = (metadata.itemType || "book").toUpperCase();
  const title = sanitizeFolderName(metadata.title || "Untitled");
  const author = metadata.author ? sanitizeFolderName(metadata.author) : null;

  // Format: "ITEMTYPE - TITLE - AUTHOR" or "ITEMTYPE - TITLE" if no author
  if (author) {
    return `${itemType} - ${title} - ${author}`;
  }
  return `${itemType} - ${title}`;
};

const getFileFormat = (fileName: string): "pdf" | "epub" | "audio" | null => {
  const ext = fileName.toLowerCase();
  if (ext.endsWith(".pdf")) return "pdf";
  if (ext.endsWith(".epub")) return "epub";
  if (ext.match(/\.(mp3|wav|m4a|m4b|aac|flac|ogg)$/)) return "audio";
  return null;
};

// Decide item type based on filename + metadata
const getFileFormatAndType = (
  fileName: string,
  metadata?: Partial<BookMetadata>
): { format: "pdf" | "epub" | "audio" | null; itemType: ItemType } => {
  const ext = fileName.toLowerCase();

  if (ext.match(/\.(mp3|wav|m4a|m4b|aac|flac|ogg)$/)) {
    return { format: "audio", itemType: "audiobook" };
  }
  if (ext.endsWith(".epub")) {
    return { format: "epub", itemType: "book" };
  }
  if (ext.endsWith(".pdf")) {
    if (metadata?.itemType)
      return { format: "pdf", itemType: metadata.itemType };
    const doi = getIdentifier(metadata || {}, "doi");
    const isbn = getIdentifier(metadata || {}, "isbn");
    if (doi && !isbn) return { format: "pdf", itemType: "article" };
    return { format: "pdf", itemType: "book" };
  }
  return { format: null, itemType: "book" };
};

const createDefaultMetadata = (fileName: string): BookMetadata => {
  const { itemType } = getFileFormatAndType(fileName);
  return {
    title: fileName.replace(/\.[^/.]+$/, ""),
    dateAdded: new Date().toISOString(),
    readingProgress: 0,
    itemType,
  };
};

// -------------------- Store --------------------
interface Store {
  selectedBook: Book | null;
  books: Book[];
  currentBook: Book | null;
  pendingBook: File | null;
  showMetadataModal: boolean;
  isLoading: boolean;

  setSelectedBook: (book: Book | null) => void;
  selectLibraryFolder: () => Promise<void>;
  loadBooksFromFolder: () => Promise<void>;
  addBookToFolder: (file: File) => Promise<void>;
  savePendingBookWithMetadata: (
    metadata: BookMetadata,
    coverFile?: File
  ) => Promise<void>;
  skipMetadataForPendingBook: () => Promise<void>;
  updateBookMetadata: (
    bookId: string,
    metadata: Partial<BookMetadata>
  ) => Promise<void>;
  fetchMetadataByISBN: (
    bookId: string,
    isbn: string
  ) => Promise<BookMetadata | null>;
  fetchMetadataByDOI: (
    bookId: string,
    doi: string
  ) => Promise<BookMetadata | null>;
  saveManualCoverForBook: (bookId: string, coverFile: File) => Promise<void>;
  setCurrentBook: (book: Book | null) => void;
  openBook: (book: Book) => Promise<void>;
  migrateExistingBooks: () => Promise<void>;
  removeBook: (bookId: string) => Promise<void>;
}

export const useStore = create<Store>((set, get) => ({
  selectedBook: null,
  books: [],
  currentBook: null,
  pendingBook: null,
  showMetadataModal: false,
  isLoading: false,

  setSelectedBook: (book) => set({ selectedBook: book }),

  // In remote mode, just loads books
  selectLibraryFolder: async () => {
    await get().loadBooksFromFolder();
  },

  loadBooksFromFolder: async () => {
    set({ isLoading: true });
    try {
      const remoteBooks = await RemoteFS.listBooks();
      const books: Book[] = remoteBooks.map((rb) => {
        const derived = getFileFormatAndType(
          rb.fileName,
          rb.metadata || undefined
        );
        return {
          id: rb.id,
          folderName: rb.folderName,
          fileName: rb.fileName,
          format: rb.format,
          itemType: (rb.metadata?.itemType as ItemType) || derived.itemType,
          metadata: rb.metadata || createDefaultMetadata(rb.fileName),
        };
      });
      set({ books, isLoading: false });
    } catch (error) {
      console.error("Failed to load books:", error);
      set({ isLoading: false });
    }
  },

  addBookToFolder: async (file) => {
    const format = getFileFormat(file.name);
    if (!format) {
      alert("Unsupported file format. Please use PDF, EPUB, or audio files.");
      return;
    }
    set({ pendingBook: file, showMetadataModal: true });
  },

  // Remote mode upload
  savePendingBookWithMetadata: async (metadata, coverFile) => {
    const { pendingBook } = get();
    if (!pendingBook) return;

    set({ isLoading: true });
    try {
      const resp = await RemoteFS.uploadBook(pendingBook, metadata, {
        mode: "auto-number", // server will auto-number on conflict
        coverFile,
      });
      const newBook: Book = {
        id: resp.book.id,
        folderName: resp.book.folderName,
        fileName: resp.book.fileName,
        format: resp.book.format,
        itemType: (resp.book.metadata?.itemType as ItemType) || "book",
        metadata:
          resp.book.metadata || createDefaultMetadata(resp.book.fileName),
      };
      set((s) => ({
        books: [newBook, ...s.books],
        pendingBook: null,
        showMetadataModal: false,
        isLoading: false,
      }));
    } catch (e) {
      console.error("Failed to save (remote):", e);
      set({ isLoading: false });
      alert("Failed to save book");
    }
  },

  skipMetadataForPendingBook: async () => {
    const { pendingBook } = get();
    if (!pendingBook) return;
    const defaultMetadata = createDefaultMetadata(pendingBook.name);
    await get().savePendingBookWithMetadata(defaultMetadata);
  },

  updateBookMetadata: async (bookId, metadataUpdate) => {
    const { books, currentBook, selectedBook } = get();
    const book = books.find((b) => b.id === bookId);
    if (!book) return;

    // Persist remotely
    await RemoteFS.saveMetadata(bookId, {
      ...book.metadata,
      ...metadataUpdate,
    });

    // Build the updated book (for the list)
    const updatedBook: Book = {
      ...book,
      itemType: (metadataUpdate.itemType as ItemType) || book.itemType,
      metadata: { ...book.metadata, ...metadataUpdate },
    };

    // IMPORTANT: Preserve transient fields on the currently open book (like url)
    const updatedCurrent =
      currentBook?.id === bookId
        ? {
            ...currentBook, // keep url, etc.
            itemType: updatedBook.itemType,
            metadata: updatedBook.metadata,
          }
        : currentBook;

    const updatedSelected =
      selectedBook?.id === bookId
        ? {
            ...selectedBook,
            itemType: updatedBook.itemType,
            metadata: updatedBook.metadata,
          }
        : selectedBook;

    set({
      books: books.map((b) => (b.id === bookId ? updatedBook : b)),
      currentBook: updatedCurrent,
      selectedBook: updatedSelected,
    });
  },

  // Remote-aware: tries to upload cover into server
  fetchMetadataByISBN: async (
    bookId: string,
    isbn: string
  ): Promise<BookMetadata | null> => {
    try {
      const { books } = get();
      const book = books.find((b) => b.id === bookId);
      if (!book) return null;

      const bookData = await fetchBookDataFromISBN(isbn);
      if (!bookData) return null;

      const updatedMetadata: BookMetadata = {
        ...book.metadata,
        title: bookData.title || book.metadata.title,
        author: bookData.author || book.metadata.author,
        publisher: bookData.publisher || book.metadata.publisher,
        publishedDate: bookData.publishedDate || book.metadata.publishedDate,
        description: bookData.description || book.metadata.description,
        pageCount: bookData.pageCount || book.metadata.pageCount,
        categories:
          bookData.categories && bookData.categories.length > 0
            ? bookData.categories
            : book.metadata.categories,
        language: bookData.language || book.metadata.language,
        // extended
        subtitle: bookData.subtitle || book.metadata.subtitle,
        editors: bookData.editors || book.metadata.editors,
        translators: bookData.translators || book.metadata.translators,
        placeOfPublication:
          bookData.placeOfPublication || book.metadata.placeOfPublication,
        edition: bookData.edition || book.metadata.edition,
        series: bookData.series || book.metadata.series,
        seriesNumber: bookData.seriesNumber || book.metadata.seriesNumber,
        volume: bookData.volume || book.metadata.volume,
        numberOfVolumes:
          bookData.numberOfVolumes || book.metadata.numberOfVolumes,
        identifiers: bookData.identifiers || book.metadata.identifiers,
        url: bookData.url || book.metadata.url,
        accessDate: bookData.accessDate || book.metadata.accessDate,
        originalLanguage:
          bookData.originalLanguage || book.metadata.originalLanguage,
      };

      // Try to fetch & upload cover to server so it becomes /files/.../cover.*
      if (bookData.coverUrl) {
        try {
          const resp = await fetch(bookData.coverUrl);
          if (resp.ok) {
            const blob = await resp.blob();
            const nameGuess = (blob.type && blob.type.split("/")[1]) || "jpg";
            const file = new File([blob], `cover.${nameGuess}`, {
              type: blob.type || "image/jpeg",
            });
            const u = await RemoteFS.uploadCover(bookId, file);
            updatedMetadata.coverFile = u.coverFile;
            updatedMetadata.coverUrl = undefined;
          } else {
            updatedMetadata.coverUrl = bookData.coverUrl; // fallback
          }
        } catch {
          updatedMetadata.coverUrl = bookData.coverUrl; // fallback if CORS/other issue
        }
      }
      await RemoteFS.saveMetadata(bookId, updatedMetadata);

      // Update the store
      set({
        books: get().books.map((b) =>
          b.id === bookId ? { ...b, metadata: updatedMetadata } : b
        ),
        currentBook:
          get().currentBook?.id === bookId
            ? { ...get().currentBook!, metadata: updatedMetadata }
            : get().currentBook,
        selectedBook:
          get().selectedBook?.id === bookId
            ? { ...get().selectedBook!, metadata: updatedMetadata }
            : get().selectedBook,
      });

      return updatedMetadata;
    } catch (error) {
      console.error("Error fetching ISBN metadata:", error);
      throw error;
    }
  },

  fetchMetadataByDOI: async (
    bookId: string,
    doi: string
  ): Promise<BookMetadata | null> => {
    try {
      const { books } = get();
      const book = books.find((b) => b.id === bookId);
      if (!book) return null;

      const articleData = await fetchArticleDataFromDOI(doi);
      if (!articleData) return null;

      const updatedMetadata: BookMetadata = {
        ...book.metadata,
        itemType: "article",
        title: articleData.title || book.metadata.title,
        subtitle: articleData.subtitle || book.metadata.subtitle,
        author: articleData.author || book.metadata.author,
        journalTitle: articleData.journalTitle || book.metadata.journalTitle,
        volumeNumber: articleData.volumeNumber || book.metadata.volumeNumber,
        issueNumber: articleData.issueNumber || book.metadata.issueNumber,
        pageRange: articleData.pageRange || book.metadata.pageRange,
        articleNumber: articleData.articleNumber || book.metadata.articleNumber,
        publisher: articleData.publisher || book.metadata.publisher,
        publishedDate: articleData.publishedDate || book.metadata.publishedDate,
        identifiers: articleData.identifiers || book.metadata.identifiers,
        url: articleData.url || book.metadata.url,
        description: articleData.description || book.metadata.description,
      };

      await RemoteFS.saveMetadata(bookId, updatedMetadata);

      set({
        books: get().books.map((b) =>
          b.id === bookId
            ? { ...b, itemType: "article", metadata: updatedMetadata }
            : b
        ),
        currentBook:
          get().currentBook?.id === bookId
            ? {
                ...get().currentBook!,
                itemType: "article",
                metadata: updatedMetadata,
              }
            : get().currentBook,
        selectedBook:
          get().selectedBook?.id === bookId
            ? {
                ...get().selectedBook!,
                itemType: "article",
                metadata: updatedMetadata,
              }
            : get().selectedBook,
      });

      return updatedMetadata;
    } catch (error) {
      console.error("Error fetching DOI metadata:", error);
      throw error;
    }
  },

  saveManualCoverForBook: async (bookId, coverFile) => {
    const { books } = get();
    const book = books.find((b) => b.id === bookId);
    if (!book) return;

    const resp = await RemoteFS.uploadCover(bookId, coverFile);
    await get().updateBookMetadata(bookId, {
      coverFile: resp.coverFile,
      coverUrl: undefined,
    });
  },

  openBook: async (book) => {
    try {
      const url = RemoteFS.fileUrl(book as any);
      await get().updateBookMetadata(book.id, {
        lastRead: new Date().toISOString(),
      });
      set({ currentBook: { ...book, url } });
    } catch (err) {
      console.error("Failed to open book:", err);
    }
  },

  setCurrentBook: (book) => set({ currentBook: book }),

  // Keeps parity with older metadata by deriving itemType where missing
  migrateExistingBooks: async () => {
    const { books, updateBookMetadata } = get();
    for (const book of books) {
      if (!book.metadata.itemType) {
        let itemType: ItemType = "book";
        if (book.format === "audio") itemType = "audiobook";
        else if (book.format === "pdf") {
          const doi = getIdentifier(book.metadata, "doi");
          const isbn = getIdentifier(book.metadata, "isbn");
          if (doi && !isbn) itemType = "article";
        }
        await updateBookMetadata(book.id, { itemType });
      }
    }
  },

  removeBook: async (bookId: string) => {
    const { books } = get();
    const book = books.find((b) => b.id === bookId);
    if (!book) return;

    await RemoteFS.deleteBook(bookId);

    // remove from collections, if you maintain them here
    const { removeBookFromCollection, collections } =
      useCollectionsStore.getState();
    collections.forEach((c) => {
      if (c.bookIds.includes(bookId)) removeBookFromCollection(c.id, bookId);
    });

    set({
      books: books.filter((b) => b.id !== bookId),
      selectedBook:
        get().selectedBook?.id === bookId ? null : get().selectedBook,
      currentBook: get().currentBook?.id === bookId ? null : get().currentBook,
    });
  },
}));
