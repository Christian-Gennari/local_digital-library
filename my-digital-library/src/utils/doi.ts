import { BookMetadata, StructuredCreator } from "../types";

/**
 * Clean DOI by removing common prefixes and normalizing format
 */
export const cleanDOI = (doi: string): string => {
  // Remove common DOI prefixes
  let cleaned = doi.replace(/^(https?:\/\/)?(dx\.)?doi\.org\//, "");
  cleaned = cleaned.replace(/^doi:?\s*/i, "");
  cleaned = cleaned.trim();
  return cleaned;
};

/**
 * Validate DOI format
 */
export const validateDOI = (doi: string): boolean => {
  const cleaned = cleanDOI(doi);
  // Basic DOI pattern: 10.xxxx/yyyy
  const doiPattern = /^10\.\d{4,}\/[-._;()\/:A-Za-z0-9]+$/;
  return doiPattern.test(cleaned);
};

/**
 * Fetch article metadata from DOI using CrossRef API
 */
export const fetchArticleDataFromDOI = async (
  doi: string
): Promise<Partial<BookMetadata> | null> => {
  const cleanedDOI = cleanDOI(doi);

  if (!validateDOI(cleanedDOI)) {
    throw new Error("Invalid DOI format");
  }

  try {
    // Use CrossRef API for article metadata
    const response = await fetch(
      `https://api.crossref.org/works/${cleanedDOI}`,
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      console.error(`CrossRef API responded with status: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const article = data.message;

    // Extract authors
    const structuredAuthors: StructuredCreator[] =
      article.author?.map((author: any) => {
        const firstName = author.given || "";
        const lastName = author.family || "";
        const fullName = `${firstName} ${lastName}`.trim() || author.name;
        return {
          firstName,
          lastName,
          fullName,
          role: "author",
        } as StructuredCreator;
      }) || [];
    const authors = structuredAuthors
      .map((a) => a.fullName)
      .filter(Boolean)
      .join(", ");

    // Extract publication date
    let publishedDate = "";
    if (article["published-print"]) {
      const dateParts = article["published-print"]["date-parts"][0];
      publishedDate = dateParts.join("-");
    } else if (article["published-online"]) {
      const dateParts = article["published-online"]["date-parts"][0];
      publishedDate = dateParts.join("-");
    }

    // Build metadata object
    const metadata: Partial<BookMetadata> = {
      itemType: "article",
      title: article.title?.[0] || "Unknown Title",
      subtitle: article.subtitle?.[0],
      author: authors || undefined,
      journalTitle: article["container-title"]?.[0],
      volumeNumber: article.volume,
      issueNumber: article.issue,
      pageRange: article.page,
      articleNumber: article["article-number"],
      publisher: article.publisher,
      publishedDate: publishedDate,
      identifiers: {
        doi: cleanedDOI,
      },
      url: article.URL,
      description: article.abstract,
      creators: structuredAuthors.length
        ? { authors: structuredAuthors }
        : undefined,
    };

    // Remove undefined values
    Object.keys(metadata).forEach((key) => {
      if (metadata[key as keyof BookMetadata] === undefined) {
        delete metadata[key as keyof BookMetadata];
      }
    });

    return metadata;
  } catch (error) {
    console.error("Failed to fetch article data:", error);
    return null;
  }
};
