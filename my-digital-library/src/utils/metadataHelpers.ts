// utils/metadataHelpers.ts
// Helper functions for metadata migration and backward compatibility

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

  // Migrate ISBN from old field to new identifiers
  if (metadata.isbn && !migrated.identifiers.isbn) {
    migrated.identifiers.isbn = metadata.isbn;

    // Try to detect ISBN-10 vs ISBN-13
    const cleanIsbn = metadata.isbn.replace(/[-\s]/g, "");
    if (cleanIsbn.length === 10) {
      migrated.identifiers.isbn10 = metadata.isbn;
    } else if (cleanIsbn.length === 13) {
      migrated.identifiers.isbn13 = metadata.isbn;
    }
  }

  // Migrate DOI from old field to new identifiers
  if (metadata.doi && !migrated.identifiers.doi) {
    migrated.identifiers.doi = metadata.doi;
  }

  // Initialize audiobook metadata for audiobook items
  if (metadata.itemType === "audiobook" && !migrated.audiobook) {
    migrated.audiobook = {};
  }

  return migrated;
}

/**
 * Gets an identifier value, checking both old and new locations
 * Works with both full and partial BookMetadata
 */
export function getIdentifier<T extends Partial<BookMetadata>>(
  metadata: T,
  type: keyof Identifiers | "isbn" | "doi"
): string | string[] | undefined {
  // Check new identifiers structure first
  if (metadata.identifiers) {
    const value = metadata.identifiers[type as keyof Identifiers];
    if (value !== undefined && type !== "custom")
      return value as string | string[];
  }

  // Fall back to old fields for backward compatibility
  if (type === "isbn" && metadata.isbn) return metadata.isbn;
  if (type === "doi" && metadata.doi) return metadata.doi;

  return undefined;
}

/**
 * Sets an identifier value, updating both old and new locations for compatibility
 * Works with both full and partial BookMetadata
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

  // Set in new location
  if (value === undefined || value === "") {
    delete updated.identifiers[type as keyof Identifiers];
  } else {
    (updated.identifiers as any)[type] = value;
  }

  // Also update old fields for backward compatibility
  if (type === "isbn") {
    updated.isbn = Array.isArray(value) ? value[0] : value;
  } else if (type === "doi") {
    updated.doi = Array.isArray(value) ? value[0] : value;
  }

  return updated;
}

/**
 * Gets all identifiers for display
 * Works with both full and partial BookMetadata
 */
export function getAllIdentifiers<T extends Partial<BookMetadata>>(
  metadata: T
): Array<{
  type: string;
  label: string;
  value: string;
}> {
  const identifiers: Array<{ type: string; label: string; value: string }> = [];

  // Check new identifiers structure
  if (metadata.identifiers) {
    const labelMap: Record<string, string> = {
      isbn: "ISBN",
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

  // Check old fields if no new identifiers found
  if (identifiers.length === 0) {
    if (metadata.isbn) {
      identifiers.push({ type: "isbn", label: "ISBN", value: metadata.isbn });
    }
    if (metadata.doi) {
      identifiers.push({ type: "doi", label: "DOI", value: metadata.doi });
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
export function parseDuration(duration: string): number {
  const regex = /(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?/;
  const match = duration.match(regex);

  if (!match) return 0;

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
