// types.ts - Updated with favorite field, collection IDs, and highlighting support

// Define item types
export type ItemType = "book" | "audiobook" | "article";

// Define a type for the Zotero creator object
export interface ZoteroCreator {
  firstName?: string;
  lastName?: string;
  creatorType?: string; // 'author', 'editor', 'translator', etc.
}

export type CreatorRole =
  | "author"
  | "editor"
  | "translator"
  | "contributor";

export interface StructuredCreator {
  firstName: string; // "John"
  lastName: string; // "Smith"
  fullName: string; // "John Smith" (fallback if parts missing)
  role: CreatorRole;
}

// NEW: Highlighting types
export interface HighlightData {
  id: string;
  textContent: string;
  color?: string; // For future color support (default: yellow)
  createdAt: string;

  // Format-specific positioning data
  pdf?: {
    page: number;
    // Bounding rectangles for the highlighted text
    rects: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
    // Scale factor when highlight was created (for responsive scaling)
    scale: number;
  };

  epub?: {
    // CFI range for precise positioning in EPUB
    cfiRange: string;
    // Section href for context
    href: string;
  };
}

// NEW: Highlight service interface
export interface HighlightService {
  // Create highlight from current selection
  createHighlightFromSelection(): Promise<HighlightData | null>;

  // Render highlights on the document
  renderHighlights(highlights: HighlightData[]): void;

  // Remove specific highlight
  removeHighlight(highlightId: string): void;

  // Clear all highlights
  clearAllHighlights(): void;

  // Update highlight visibility
  setHighlightsVisible(visible: boolean): void;
}

export interface BookMetadata {
  // Item Type (NEW)
  itemType?: ItemType; // Determines which fields to show/use

  // Basic Information
  title: string;
  subtitle?: string; // For complete title representation
  author?: string;
  editors?: string; // For edited books
  translators?: string; // For translated works

  creators?: {
    authors?: StructuredCreator[];
    editors?: StructuredCreator[];
    translators?: StructuredCreator[];
  };

  // Publication Information
  isbn?: string; // For books/audiobooks
  publisher?: string; // For books, or journal publisher for articles
  publishedDate?: string;
  placeOfPublication?: string; // City/Location of publication
  edition?: string; // e.g., "2nd edition", "Revised edition"

  // Article-specific fields (NEW)
  journalTitle?: string; // Journal/Magazine/Newspaper name
  volumeNumber?: string; // Volume number for journal articles
  issueNumber?: string; // Issue number
  pageRange?: string; // e.g., "123-145"
  articleNumber?: string; // Some journals use article numbers instead of pages

  // Series/Volume Information (primarily for books)
  series?: string; // Book series name
  seriesNumber?: string; // Number in series
  volume?: string; // Volume number for multi-volume works

  // Digital/Online Information
  doi?: string; // Digital Object Identifier (primary for articles, optional for books)
  url?: string; // URL for online resources
  accessDate?: string; // When online resource was accessed

  // Physical Description
  pageCount?: number; // Total pages for books
  numberOfVolumes?: number; // For multi-volume sets

  // Content Description
  description?: string;
  categories?: string[];
  language?: string;
  originalLanguage?: string; // For translations

  // Cover Information
  coverFile?: string; // Local filename: "book.cover.jpg"
  coverUrl?: string; // Fallback external URL

  // User-specific Data
  userRating?: number; // 1-5 stars
  userNotes?: string;
  dateAdded: string;
  lastRead?: string;
  readingProgress?: number; // 0-100%

  // NEW: Favorite field (independent of rating)
  isFavorite?: boolean;

  // NEW: Collection associations
  collectionIds?: string[]; // Array of collection IDs this book belongs to

  // Position tracking for different formats
  lastReadPosition?: string | number; // CFI for EPUB, page number for PDF, seconds for audio
}

export interface Book {
  id: string;
  folderName: string;
  folderHandle: FileSystemDirectoryHandle;
  fileName: string;
  format: "pdf" | "epub" | "audio";
  itemType?: ItemType; // NEW: Type of item (book, audiobook, article)
  metadata: BookMetadata;
  url?: string; // Blob URL when needed
}

export interface ConflictResolution {
  type: "auto-number" | "custom-name" | "overwrite" | "cancel";
  customName?: string;
}

// UPDATED: BookNote interface with highlighting support
export interface BookNote {
  id: string;
  content: string; // User's note/comment
  quote?: string; // Selected text (PDF/EPUB only)
  reference: {
    type: "page" | "cfi" | "timestamp";
    value: string; // "Page 42" | "Chapter 3, para 5" | "15:32"
    raw: number | string; // 42 | CFI string | 923.5 seconds
  };
  createdAt: string;
  tags?: string[]; // Optional categorization

  // NEW: Optional highlight data
  highlight?: HighlightData;
}

export interface BookNotes {
  bookId: string; // Folder name (for file system reference)
  notes: BookNote[];
  lastUpdated: string;
}

// NEW: Highlight-related utility types
export type HighlightColor = "yellow" | "green" | "blue" | "pink" | "orange";

export interface HighlightPreferences {
  defaultColor: HighlightColor;
  visible: boolean;
  opacity: number; // 0-100
}

// NEW: Reference types for navigation
export interface Reference {
  type: "page" | "cfi" | "timestamp";
  value: string;
  raw: number | string;
}

// NEW: Text selection data
export interface TextSelection {
  text: string;
  reference: Reference;
  format: "pdf" | "epub" | "audio";
}
