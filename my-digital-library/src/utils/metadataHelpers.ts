// utils/metadataHelpers.ts
// Helper functions for metadata operations

import { BookMetadata, Identifiers, ItemType } from "../types";

/**
 * Migrates old metadata format to new format with identifiers
 * Works with both full and partial BookMetadata
 */
export function migrateMetadata<T extends Partial<BookMetadata>>(
  metadata: T
): T {
  const migrated = { ...metadata };

  // Initialize identifiers if not present
  if (!migrated.identifiers) {
    migrated.identifiers = {};
  }

  // Type assertion to handle legacy fields that might exist in stored data
  const legacyData = metadata as any;

  // Migrate old ISBN if it exists
  if (
    legacyData.isbn &&
    !migrated.identifiers.isbn10 &&
    !migrated.identifiers.isbn13
  ) {
    const cleanIsbn = String(legacyData.isbn).replace(/[-\s]/g, "");
    if (cleanIsbn.length === 10) {
      migrated.identifiers.isbn10 = legacyData.isbn;
    } else if (cleanIsbn.length === 13) {
      migrated.identifiers.isbn13 = legacyData.isbn;
    }
    delete (migrated as any).isbn;
  }

  // Migrate old DOI if it exists
  if (legacyData.doi && !migrated.identifiers.doi) {
    migrated.identifiers.doi = legacyData.doi;
    delete (migrated as any).doi;
  }

  // Initialize audiobook metadata for audiobook items
  if (metadata.itemType === "audiobook" && !migrated.audiobook) {
    migrated.audiobook = {};
  }

  return migrated;
}

/**
 * Gets an identifier value from the new structure
 */
export function getIdentifier<T extends Partial<BookMetadata>>(
  metadata: T,
  type: keyof Identifiers | "isbn" | "doi"
): string | string[] | undefined {
  // Special handling for generic ISBN request - return whichever exists
  if (type === "isbn") {
    if (metadata.identifiers?.isbn13) return metadata.identifiers.isbn13;
    if (metadata.identifiers?.isbn10) return metadata.identifiers.isbn10;
    return undefined;
  }

  // Check new identifiers structure
  if (metadata.identifiers) {
    const value = metadata.identifiers[type as keyof Identifiers];
    if (value !== undefined && type !== "custom")
      return value as string | string[];
  }

  return undefined;
}

/**
 * Sets an identifier value in the new structure
 */
export function setIdentifier<T extends Partial<BookMetadata>>(
  metadata: T,
  type: keyof Identifiers | "isbn" | "doi",
  value: string | string[] | undefined
): T {
  const updated = { ...metadata };

  // Ensure identifiers object exists
  if (!updated.identifiers) {
    updated.identifiers = {};
  }

  // Handle ISBN - auto-detect type
  if (type === "isbn" && value) {
    const cleanValue = String(Array.isArray(value) ? value[0] : value).replace(
      /[-\s]/g,
      ""
    );
    if (cleanValue.length === 10) {
      updated.identifiers.isbn10 = Array.isArray(value) ? value[0] : value;
      delete updated.identifiers.isbn13; // Remove other type if exists
    } else if (cleanValue.length === 13) {
      updated.identifiers.isbn13 = Array.isArray(value) ? value[0] : value;
      delete updated.identifiers.isbn10; // Remove other type if exists
    }
    return updated;
  }

  // Set or delete the identifier
  if (value === undefined || value === "") {
    delete updated.identifiers[type as keyof Identifiers];
  } else {
    (updated.identifiers as any)[type] = value;
  }

  return updated;
}

/**
 * Gets all identifiers for display
 */
export function getAllIdentifiers<T extends Partial<BookMetadata>>(
  metadata: T
): Array<{
  type: string;
  label: string;
  value: string;
}> {
  const identifiers: Array<{ type: string; label: string; value: string }> = [];

  // Only check new identifiers structure
  if (metadata.identifiers) {
    const labelMap: Record<string, string> = {
      isbn10: "ISBN-10",
      isbn13: "ISBN-13",
      asin: "ASIN",
      audibleAsin: "Audible ASIN",
      doi: "DOI",
      issn: "ISSN",
      oclc: "OCLC",
      lccn: "LCCN",
      googleBooksId: "Google Books ID",
      goodreadsId: "Goodreads ID",
      openLibraryId: "Open Library ID",
    };

    for (const [key, value] of Object.entries(metadata.identifiers)) {
      // Skip the generic isbn field if it somehow exists
      if (key === "isbn") continue;

      if (value && key !== "custom") {
        const label =
          labelMap[key] || key.charAt(0).toUpperCase() + key.slice(1);
        if (Array.isArray(value)) {
          value.forEach((v, i) => {
            identifiers.push({
              type: key,
              label: value.length > 1 ? `${label} ${i + 1}` : label,
              value: v,
            });
          });
        } else {
          identifiers.push({ type: key, label, value: value as string });
        }
      }
    }

    // Handle custom identifiers
    if (metadata.identifiers.custom) {
      for (const [key, value] of Object.entries(metadata.identifiers.custom)) {
        identifiers.push({
          type: `custom.${key}`,
          label: key,
          value,
        });
      }
    }
  }

  return identifiers;
}

/**
 * Determines which fields should be shown for a given item type
 */
export interface FieldVisibility {
  // Basic fields
  narrator: boolean;
  editors: boolean;
  translators: boolean;

  // Identifiers
  isbn: boolean;
  isbn10: boolean;
  isbn13: boolean;
  asin: boolean;
  audibleAsin: boolean;
  doi: boolean;
  issn: boolean;

  // Publication fields
  publisher: boolean;
  audioPublisher: boolean;
  placeOfPublication: boolean;
  edition: boolean;
  abridged: boolean;

  // Article fields
  journalTitle: boolean;
  volumeNumber: boolean;
  issueNumber: boolean;
  pageRange: boolean;
  articleNumber: boolean;

  // Physical/Media fields
  pageCount: boolean;
  duration: boolean;
  format: boolean;

  // Series fields
  series: boolean;
  seriesNumber: boolean;
  volume: boolean;
  numberOfVolumes: boolean;
}

export function getFieldVisibility(itemType: ItemType): FieldVisibility {
  const base: FieldVisibility = {
    // All fields default to false
    narrator: false,
    editors: false,
    translators: false,
    isbn: false,
    isbn10: false,
    isbn13: false,
    asin: false,
    audibleAsin: false,
    doi: false,
    issn: false,
    publisher: false,
    audioPublisher: false,
    placeOfPublication: false,
    edition: false,
    abridged: false,
    journalTitle: false,
    volumeNumber: false,
    issueNumber: false,
    pageRange: false,
    articleNumber: false,
    pageCount: false,
    duration: false,
    format: false,
    series: false,
    seriesNumber: false,
    volume: false,
    numberOfVolumes: false,
  };

  switch (itemType) {
    case "book":
      return {
        ...base,
        editors: true,
        translators: true,
        isbn: true,
        isbn10: true,
        isbn13: true,
        asin: true,
        doi: true, // Some academic books have DOIs
        publisher: true,
        placeOfPublication: true,
        edition: true,
        pageCount: true,
        series: true,
        seriesNumber: true,
        volume: true,
        numberOfVolumes: true,
      };

    case "audiobook":
      return {
        ...base,
        narrator: true,
        translators: true,
        isbn: true, // Many audiobooks also have ISBNs
        isbn10: true,
        isbn13: true,
        asin: true,
        audibleAsin: true,
        publisher: true,
        audioPublisher: true,
        edition: true,
        abridged: true,
        duration: true,
        format: true,
        series: true,
        seriesNumber: true,
      };

    case "article":
      return {
        ...base,
        editors: true, // For edited collections
        translators: true,
        doi: true,
        issn: true,
        publisher: true, // Journal publisher
        journalTitle: true,
        volumeNumber: true,
        issueNumber: true,
        pageRange: true,
        articleNumber: true,
      };

    default:
      return base;
  }
}

/**
 * Format duration from seconds to human-readable string
 */
export function formatDuration(seconds?: number): string {
  if (!seconds) return "";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Parse duration string to seconds
 */
export function parseDuration(duration: string): number | undefined {
  // Return undefined for empty strings
  if (!duration || !duration.trim()) {
    return undefined;
  }

  // Match hours, minutes, and seconds
  const regex = /(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?/;
  const match = duration.match(regex);

  // Return undefined if no match or if the match is empty (no digits captured)
  if (!match || (!match[1] && !match[2] && !match[3])) {
    return undefined;
  }

  const hours = parseInt(match[1] || "0");
  const minutes = parseInt(match[2] || "0");
  const seconds = parseInt(match[3] || "0");

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Validate identifier formats
 */
export const validators = {
  isbn: (value: string): boolean => {
    const clean = value.replace(/[-\s]/g, "");
    return clean.length === 10 || clean.length === 13;
  },

  isbn10: (value: string): boolean => {
    const clean = value.replace(/[-\s]/g, "");
    if (clean.length !== 10) return false;

    // ISBN-10 check digit validation
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(clean[i]) * (10 - i);
    }
    const checkDigit = clean[9].toUpperCase();
    const expectedCheck = (11 - (sum % 11)) % 11;
    const expected = expectedCheck === 10 ? "X" : expectedCheck.toString();
    return checkDigit === expected;
  },

  isbn13: (value: string): boolean => {
    const clean = value.replace(/[-\s]/g, "");
    if (clean.length !== 13) return false;

    // ISBN-13 check digit validation
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(clean[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = parseInt(clean[12]);
    const expectedCheck = (10 - (sum % 10)) % 10;
    return checkDigit === expectedCheck;
  },

  asin: (value: string): boolean => {
    // ASIN is 10 characters, alphanumeric
    return /^[A-Z0-9]{10}$/.test(value.toUpperCase());
  },

  doi: (value: string): boolean => {
    // Basic DOI pattern
    return /^10\.\d{4,}\/[-._;()\/:A-Za-z0-9]+$/.test(value);
  },

  issn: (value: string): boolean => {
    const clean = value.replace(/[-\s]/g, "");
    return clean.length === 8 && /^\d{7}[\dX]$/.test(clean.toUpperCase());
  },
};
