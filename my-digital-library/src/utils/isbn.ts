// src/utils/isbn.ts - Enhanced ISBN utilities for academic references
import {
  BookMetadata,
  StructuredCreator,
  CreatorRole,
  ZoteroCreator,
} from "../types";
import { ReferenceFormatter } from "./referenceFormatter";
import { HarvardCiteThemRight } from "./harvardCiteThemRight";
import { getIdentifier } from "./metadataHelpers";

//
// === ISBN VALIDATION & FORMATTING UTILITIES ===
//
// Functions in this section are solely for processing ISBN strings,
// including cleaning, validating, and formatting them.
//

/**
 * Removes all non-digit characters from an ISBN, such as hyphens, spaces, and the "ISBN:" prefix.
 * @param isbn The raw ISBN string to clean.
 * @returns A string containing only the digits of the ISBN.
 */
export const cleanISBN = (isbn: string): string => {
  return isbn.replace(/[^\d]/g, "");
};

/**
 * Validates if an ISBN has the correct length, either 10 or 13 digits.
 * @param isbn The ISBN string to validate.
 * @returns True if the ISBN is a valid length, otherwise false.
 */
export const validateISBN = (isbn: string): boolean => {
  const cleaned = cleanISBN(isbn);
  return cleaned.length === 10 || cleaned.length === 13;
};

/**
 * Formats a clean ISBN string by adding hyphens to make it more readable.
 * @param isbn The clean ISBN string to format.
 * @returns A hyphenated ISBN string, or the original string if the length is invalid.
 */
export const formatISBN = (isbn: string): string => {
  const cleaned = cleanISBN(isbn);

  if (cleaned.length === 10) {
    // ISBN-10 format: X-XXX-XXXXX-X
    return cleaned.replace(/(\d{1})(\d{3})(\d{5})(\d{1})/, "$1-$2-$3-$4");
  } else if (cleaned.length === 13) {
    // ISBN-13 format: XXX-X-XXX-XXXXX-X
    return cleaned.replace(
      /(\d{3})(\d{1})(\d{3})(\d{5})(\d{1})/,
      "$1-$2-$3-$4-$5"
    );
  }

  return cleaned; // Return as-is if not a valid length
};

//
// === METADATA FETCHING & PARSING LOGIC ===
//
// This section contains functions for fetching metadata from various APIs
// and extracting specific data points like publication information and DOIs.
//

/**
 * A helper function to check if a URL returns a valid image (not a blank placeholder).
 * This is used to verify cover image URLs from sources like Open Library.
 * @param url The URL of the image to check.
 * @returns A promise that resolves to true if the image exists, otherwise false.
 */
const checkImageExists = async (url: string) => {
  try {
    const response = await fetch(url, { method: "HEAD" }); // Checks for a successful response and an image content-type.
    return (
      response.ok && response.headers.get("content-type")?.startsWith("image")
    );
  } catch (e) {
    return false;
  }
};

/**
 * Extracts the place of publication from a publisher string, which often includes the location.
 * E.g., "Penguin Books, New York" would return "New York".
 * @param publisher The publisher string.
 * @returns The extracted city or location, or undefined if not found.
 */
const extractPlaceOfPublication = (publisher?: string): string | undefined => {
  if (!publisher) return undefined; // Matches patterns like ", City" or "(City)" at the end of the string.
  const patterns = [/,\s*([^,]+)$/, /\(([^)]+)\)$/];
  for (const pattern of patterns) {
    const match = publisher.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return undefined;
};

/**
 * Attempts to extract a Digital Object Identifier (DOI) from various Zotero fields.
 * DOIs can be found in `DOI`, `doi`, `extra`, or the `url` field.
 * @param book The book object from the Zotero API.
 * @returns The extracted DOI string, or undefined if not found.
 */
const extractDOI = (book: any): string | undefined => {
  if (book.DOI) return book.DOI;
  if (book.doi) return book.doi;
  if (book.extra) {
    const doiMatch = book.extra.match(/DOI:\s*(.+?)(?:\s|$)/i);
    if (doiMatch) return doiMatch[1];
  }
  if (book.url) {
    const doiUrlMatch = book.url.match(/doi\.org\/(.+)/);
    if (doiUrlMatch) return doiUrlMatch[1];
  }
  return undefined;
};

/**
 * Fetches comprehensive book metadata using an ISBN from a Zotero translation server,
 * and supplements it with data from Open Library (for cover art) and Google Books.
 * @param isbn The ISBN string to search for.
 * @returns A promise that resolves to a partial BookMetadata object or null if data fetching fails.
 */
export const fetchBookDataFromISBN = async (
  isbn: string
): Promise<Partial<BookMetadata> | null> => {
  const cleanedISBN = cleanISBN(isbn);
  if (!validateISBN(cleanedISBN)) {
    throw new Error("Invalid ISBN format. Please enter a 10 or 13 digit ISBN.");
  }

  try {
    // 1. Fetch primary metadata from the Zotero translation server
    const response = await fetch(
      `https://zotero-translation-server.onrender.com/search`,
      {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: cleanedISBN,
      }
    );
    if (!response.ok) {
      console.error(`Server responded with status: ${response.status}`);
      return null;
    }
    const data = await response.json();
    let coverUrl = null; // 2. Attempt to fetch a cover image from Open Library first

    const openLibraryCoverUrl = `https://covers.openlibrary.org/b/isbn/${cleanedISBN}-L.jpg`;
    if (await checkImageExists(openLibraryCoverUrl)) {
      coverUrl = openLibraryCoverUrl;
    } else {
      // 3. If Open Library fails, fall back to the Google Books API
      console.log(
        "Open Library cover not found, falling back to Google Books."
      );
      const googleResponse = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanedISBN}`
      );
      const googleData = await googleResponse.json();

      if (googleData.items && googleData.items[0]) {
        const imageLinks = googleData.items[0].volumeInfo.imageLinks;
        coverUrl = imageLinks?.thumbnail || imageLinks?.smallThumbnail || null; // Supplement the Zotero data with additional fields from Google Books

        if (data && data[0]) {
          const googleBook = googleData.items[0].volumeInfo;
          const book = data[0];
          book.pageCount =
            book.pageCount || book.numPages || googleBook.pageCount;
          book.categories = book.categories || googleBook.categories;
          book.language = book.language || googleBook.language;
          book.description =
            book.description || book.abstractNote || googleBook.description;
        }
      }
    } // 4. Process the combined data to build the final metadata object

    if (data && data[0]) {
      const book = data[0];
      const authors: string[] = [];
      const editors: string[] = [];
      const translators: string[] = [];
      const structuredAuthors: StructuredCreator[] = [];
      const structuredEditors: StructuredCreator[] = [];
      const structuredTranslators: StructuredCreator[] = [];

      if (book.creators) {
        book.creators.forEach((creator: ZoteroCreator) => {
          const firstName = creator.firstName || "";
          const lastName = creator.lastName || "";
          const fullName =
            firstName && lastName
              ? `${firstName} ${lastName}`
              : creator.lastName || (creator as any).name || firstName;
          if (!fullName) return;
          const role: CreatorRole =
            (creator.creatorType as CreatorRole) || "contributor";

          const structured: StructuredCreator = {
            firstName,
            lastName,
            fullName,
            role,
          };

          switch (role) {
            case "author":
              authors.push(fullName);
              structuredAuthors.push(structured);
              break;
            case "editor":
              editors.push(fullName);
              structuredEditors.push(structured);
              break;
            case "translator":
              translators.push(fullName);
              structuredTranslators.push(structured);
              break;
            default:
              authors.push(fullName);
              structuredAuthors.push(structured);
          }
        });
      }

      const placeOfPublication =
        book.place || extractPlaceOfPublication(book.publisher);
      const metadata: Partial<BookMetadata> = {
        title: book.title || "Unknown Title",
        subtitle: book.subtitle,
        author: authors.length > 0 ? authors.join(", ") : undefined,
        editors: editors.length > 0 ? editors.join(", ") : undefined,
        translators:
          translators.length > 0 ? translators.join(", ") : undefined,
        identifiers: {
          ...(cleanedISBN.length === 10
            ? { isbn10: formatISBN(cleanedISBN) }
            : {}),
          ...(cleanedISBN.length === 13
            ? { isbn13: formatISBN(cleanedISBN) }
            : {}),
          ...(extractDOI(book) ? { doi: extractDOI(book) } : {}),
        },
        publisher: book.publisher,
        publishedDate: book.date || book.publicationDate,
        placeOfPublication: placeOfPublication,
        edition: book.edition,
        series: book.series || book.seriesTitle,
        seriesNumber: book.seriesNumber,
        volume: book.volume,
        numberOfVolumes: book.numberOfVolumes,
        url: book.url,
        accessDate: book.accessDate
          ? new Date(book.accessDate).toISOString()
          : undefined,
        pageCount: book.pageCount || book.numPages,
        description: book.description || book.abstractNote,
        categories:
          book.categories || book.tags?.map((tag: any) => tag.tag || tag),
        language: book.language,
        coverUrl: coverUrl,
      };

      const creatorMeta: NonNullable<BookMetadata["creators"]> = {};
      if (structuredAuthors.length) creatorMeta.authors = structuredAuthors;
      if (structuredEditors.length) creatorMeta.editors = structuredEditors;
      if (structuredTranslators.length)
        creatorMeta.translators = structuredTranslators;
      if (Object.keys(creatorMeta).length) {
        metadata.creators = creatorMeta;
      }

      // Remove undefined values to keep the object clean

      Object.keys(metadata).forEach((key) => {
        if (metadata[key as keyof BookMetadata] === undefined) {
          delete metadata[key as keyof BookMetadata];
        }
      });

      return metadata;
    }
  } catch (error) {
    console.error("Failed to fetch book data:", error);
  }
  return null;
};

//
// === CITATION GENERATION LOGIC ===
//
// These functions are responsible for taking a metadata object and formatting
// it into different academic citation styles (e.g., APA, MLA, Chicago).
//

/**
 * Generates an academic citation string for a given book or article.
 * @param metadata The metadata object to cite.
 * @param format The desired citation format ("apa", "mla", or "chicago").
 * @returns The formatted citation string with HTML for styling.
 */
export const generateCitation = (
  metadata: BookMetadata,
  style: "apa" | "mla" | "chicago" | "harvard" = "apa",
  kind: "book" | "article" = "book"
): string => {
  if (style === "harvard") {
    return kind === "article"
      ? HarvardCiteThemRight.generateArticle(metadata)
      : HarvardCiteThemRight.generateBook(metadata);
  }

  const year = metadata.publishedDate
    ? new Date(metadata.publishedDate).getFullYear()
    : "n.d.";

  if (kind === "article") {
    return generateArticleCitation(metadata, style);
  }

  const authors =
    ReferenceFormatter.joinCreators(
      ReferenceFormatter.getCreators(metadata, "authors"),
      style
    ) ||
    metadata.author ||
    "Unknown Author";

  switch (style) {
    case "apa": {
      let apa = authors;
      apa += ` (${year}).`;
      apa += ` <i>${metadata.title}</i>`;
      if (metadata.subtitle) apa += `: ${metadata.subtitle}`;
      apa += ".";
      if (metadata.edition && metadata.edition !== "1")
        apa += ` (${metadata.edition}).`;
      if (metadata.publisher) {
        apa += ` ${metadata.publisher}.`;
      }
      const doi = getIdentifier(metadata, "doi") as string;
      if (doi) {
        apa += ` https://doi.org/${doi}`;
      } else if (metadata.url) {
        apa += ` ${metadata.url}`;
      }
      return apa;
    }
    case "mla": {
      let mla = authors;
      mla += mla.endsWith(".") ? " " : ". ";
      mla += `<i>${metadata.title}`;
      if (metadata.subtitle) mla += `: ${metadata.subtitle}`;
      mla += "</i>.";
      if (metadata.edition && metadata.edition !== "1")
        mla += ` ${metadata.edition},`;
      if (metadata.publisher) mla += ` ${metadata.publisher},`;
      mla += ` ${year}.`;
      return mla;
    }
    case "chicago": {
      let chicago = authors;
      chicago += chicago.endsWith(".") ? " " : ". ";
      chicago += `<i>${metadata.title}`;
      if (metadata.subtitle) chicago += `: ${metadata.subtitle}`;
      chicago += "</i>.";
      if (metadata.edition && metadata.edition !== "1")
        chicago += ` ${metadata.edition}.`;
      if (metadata.placeOfPublication && metadata.publisher) {
        chicago += ` ${metadata.placeOfPublication}: ${metadata.publisher},`;
      } else if (metadata.publisher) {
        chicago += ` ${metadata.publisher},`;
      }
      chicago += ` ${year}.`;
      return chicago;
    }
    default:
      return "";
  }
};

/**
 * Generates a citation specifically for articles based on the provided format.
 * @param article The article metadata object.
 * @param format The desired citation format.
 * @returns The formatted article citation string with HTML for styling.
 */
const generateArticleCitation = (
  article: BookMetadata,
  format: "apa" | "mla" | "chicago"
): string => {
  const year = article.publishedDate
    ? new Date(article.publishedDate).getFullYear()
    : "n.d.";
  const authors =
    ReferenceFormatter.joinCreators(
      ReferenceFormatter.getCreators(article, "authors"),
      format
    ) ||
    article.author ||
    "Unknown Author";

  const doi = getIdentifier(article, "doi") as string;

  switch (format) {
    case "apa":
      let apa = authors;
      apa += ` (${year}).`;
      apa += ` ${article.title}.`;
      if (article.journalTitle) {
        apa += ` <i>${article.journalTitle}</i>`; // Use <i> tag for italics
        if (article.volumeNumber) {
          apa += `, ${article.volumeNumber}`;
          if (article.issueNumber) {
            apa += `(${article.issueNumber})`;
          }
        }
        if (article.pageRange) {
          apa += `, ${article.pageRange}`;
        } else if (article.articleNumber) {
          apa += `, Article ${article.articleNumber}`;
        }
        apa += ".";
      }
      if (doi) {
        apa += ` https://doi.org/${doi}`;
      } else if (article.url) {
        apa += ` ${article.url}`;
      }
      return apa;
    case "mla":
      let mla = authors;
      mla += '. "';
      mla += article.title;
      mla += '." ';
      if (article.journalTitle) {
        mla += `<i>${article.journalTitle}</i>`; // Use <i> tag for italics
        if (article.volumeNumber) {
          mla += `, vol. ${article.volumeNumber}`;
        }
        if (article.issueNumber) {
          mla += `, no. ${article.issueNumber}`;
        }
        mla += `, ${year}`;
        if (article.pageRange) {
          mla += `, pp. ${article.pageRange}`;
        }
        mla += ".";
      }
      if (doi) {
        mla += ` doi:${doi}`;
      }
      return mla;
    case "chicago":
      let chicago = authors;
      chicago += '. "';
      chicago += article.title;
      chicago += '." ';
      if (article.journalTitle) {
        chicago += `<i>${article.journalTitle}</i>`; // Use <i> tag for italics
        if (article.volumeNumber) {
          chicago += ` ${article.volumeNumber}`;
        }
        if (article.issueNumber) {
          chicago += `, no. ${article.issueNumber}`;
        }
        chicago += ` (${year})`;
        if (article.pageRange) {
          chicago += `: ${article.pageRange}`;
        }
        chicago += ".";
      }
      if (doi) {
        chicago += ` https://doi.org/${doi}`;
      }
      return chicago;

    default:
      return "";
  }
};
