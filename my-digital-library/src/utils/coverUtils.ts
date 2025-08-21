// src/utils/coverUtils.ts
import { Book } from "../types";

// Create a shared cache for cover image URLs
const coverUrlCache = new Map<string, string>();

/**
 * Gets the cover image source for a book with caching
 * Constructs URLs for server-hosted cover files or falls back to online URLs
 */
export const getCoverImageSrc = async (book: Book): Promise<string | null> => {
  // Check the cache first
  if (coverUrlCache.has(book.id)) {
    return coverUrlCache.get(book.id)!;
  }

  // Construct URL for cover file on the server
  if (book.metadata.coverFile) {
    const coverUrl = `/files/${encodeURIComponent(
      book.id
    )}/${encodeURIComponent(book.metadata.coverFile)}`;
    coverUrlCache.set(book.id, coverUrl);
    return coverUrl;
  }

  // Fallback to online URL if no cover file
  let url = book.metadata.coverUrl || null;

  // Force HTTPS for external URLs
  if (url && url.startsWith("http://")) {
    url = url.replace("http://", "https://");
  }

  return url;
};

/**
 * Clears the cover URL cache for a specific book
 */
export const clearCoverCache = (bookId: string): void => {
  coverUrlCache.delete(bookId);
};

/**
 * Clears the entire cover URL cache
 */
export const clearAllCoverCache = (): void => {
  coverUrlCache.clear();
};
