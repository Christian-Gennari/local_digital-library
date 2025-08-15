import { BookMetadata } from "../types";
import { ReferenceFormatter } from "./referenceFormatter";
import { getIdentifier } from "./metadataHelpers";

export class HarvardCiteThemRight {
  static generateBook(metadata: BookMetadata): string {
    const authors =
      ReferenceFormatter.joinCreators(
        ReferenceFormatter.getCreators(metadata, "authors"),
        "harvard"
      ) ||
      metadata.author ||
      "Unknown Author";

    const year = metadata.publishedDate
      ? new Date(metadata.publishedDate).getFullYear()
      : "n.d.";

    let citation = `${authors} (${year}) <i>${metadata.title}`;
    if (metadata.subtitle) citation += `: ${metadata.subtitle}`;
    citation += `</i>.`;
    if (metadata.edition && metadata.edition !== "1")
      citation += ` ${metadata.edition}.`;
    if (metadata.placeOfPublication || metadata.publisher) {
      citation += " ";
      if (metadata.placeOfPublication) citation += metadata.placeOfPublication;
      if (metadata.publisher) {
        if (metadata.placeOfPublication) citation += `: ${metadata.publisher}.`;
        else citation += `${metadata.publisher}.`;
      } else {
        citation += ".";
      }
    }
    return citation.trim();
  }

  static generateArticle(metadata: BookMetadata): string {
    const authors =
      ReferenceFormatter.joinCreators(
        ReferenceFormatter.getCreators(metadata, "authors"),
        "harvard"
      ) ||
      metadata.author ||
      "Unknown Author";

    const year = metadata.publishedDate
      ? new Date(metadata.publishedDate).getFullYear()
      : "n.d.";

    let citation = `${authors} (${year}) '${metadata.title}'`;
    if (metadata.journalTitle) citation += `, <i>${metadata.journalTitle}</i>`;
    if (metadata.volumeNumber) {
      citation += `, ${metadata.volumeNumber}`;
      if (metadata.issueNumber) citation += `(${metadata.issueNumber})`;
    }
    if (metadata.pageRange) citation += `, ${metadata.pageRange}.`;
    else if (metadata.articleNumber) citation += `, ${metadata.articleNumber}.`;
    else citation += ".";

    const doi = getIdentifier(metadata, "doi");
    if (doi) citation += ` https://doi.org/${doi}`;
    else if (metadata.url) citation += ` ${metadata.url}`;

    if (metadata.accessDate) {
      const date = new Date(metadata.accessDate);
      const day = date.getDate();
      const month = date.toLocaleString("en-GB", { month: "long" });
      const yearAcc = date.getFullYear();
      citation += ` (Accessed ${day} ${month} ${yearAcc}).`;
    }
    return citation.trim();
  }
}
