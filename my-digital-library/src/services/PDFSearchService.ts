// src/services/PDFSearchService.ts
import { pdfjs } from "react-pdf";

export interface PDFSearchMatch {
  text: string;
  pageNumber: number;
  pageIndex: number; // 0-based
  excerpt: string;
  matchIndex: number; // Index within the page
  charIndex: number; // Character position in page text
  textItems: TextItemMapping[]; // Store the text items that make up this match
}

interface TextItemMapping {
  itemIndex: number;
  startChar: number; // Start character position within the item
  endChar: number; // End character position within the item
}

interface PDFTextItem {
  str: string;
  dir: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
}

export class PDFSearchService {
  private matches: PDFSearchMatch[] = [];
  private currentMatchIndex = 0;
  private currentQuery = "";
  private highlightElements: HTMLElement[] = [];
  private pdfDocument: any;
  private containerRef: React.RefObject<HTMLDivElement | null>;
  private onPageChange?: (page: number) => void;
  private pageTextContentCache: Map<number, any> = new Map();

  constructor(
    pdfDocument: any,
    containerRef: React.RefObject<HTMLDivElement | null>,
    onPageChange?: (page: number) => void
  ) {
    this.pdfDocument = pdfDocument;
    this.containerRef = containerRef;
    this.onPageChange = onPageChange;
  }

  /**
   * Main search method
   */
  async search(query: string): Promise<PDFSearchMatch[]> {
    if (!query || query.trim().length < 2) {
      this.clear();
      return [];
    }

    this.currentQuery = query;
    this.clearHighlights();
    this.matches = [];
    this.pageTextContentCache.clear();

    const numPages = this.pdfDocument.numPages;

    // Search through all pages
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const pageMatches = await this.searchInPageUsingPDFjs(pageNum, query);
      this.matches.push(...pageMatches);
    }

    this.currentMatchIndex = 0;

    // Navigate to first match if found
    if (this.matches.length > 0) {
      await this.navigateToMatch(0);
    }

    return this.matches;
  }

  /**
   * Search in a page using PDF.js text content with proper text reconstruction
   */
  private async searchInPageUsingPDFjs(
    pageNumber: number,
    query: string
  ): Promise<PDFSearchMatch[]> {
    try {
      const page = await this.pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();

      // Cache the text content for later use
      this.pageTextContentCache.set(pageNumber, textContent);

      // Extract and process text items
      const items = textContent.items as PDFTextItem[];

      // Group text items by their Y position (same line)
      const lines = this.groupTextItemsByLine(items);

      // Build searchable text from grouped lines (pass original items for index mapping)
      const { fullText, itemMappings } = this.buildSearchableText(lines, items);

      // Search for matches in the reconstructed text
      const matches = this.findMatchesInText(
        fullText,
        query,
        pageNumber,
        itemMappings
      );

      return matches;
    } catch (error) {
      console.warn(`Failed to search page ${pageNumber}:`, error);
      return [];
    }
  }

  /**
   * Group text items by their Y position to reconstruct lines
   */
  private groupTextItemsByLine(items: PDFTextItem[]): PDFTextItem[][] {
    if (items.length === 0) return [];

    // Sort items by Y position (transform[5]) then X position (transform[4])
    const sortedItems = [...items].sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5]; // Y coordinate (inverted)
      if (Math.abs(yDiff) > 2) return yDiff; // Tolerance for same line
      return a.transform[4] - b.transform[4]; // X coordinate
    });

    // Group items into lines based on Y position
    const lines: PDFTextItem[][] = [];
    let currentLine: PDFTextItem[] = [];
    let currentY = sortedItems[0]?.transform[5];

    for (const item of sortedItems) {
      const itemY = item.transform[5];

      // Check if this item is on the same line (within tolerance)
      if (Math.abs(itemY - currentY) <= 2) {
        currentLine.push(item);
      } else {
        // Start a new line
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }
        currentLine = [item];
        currentY = itemY;
      }
    }

    // Add the last line
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    return lines;
  }

  /**
   * Build searchable text from grouped lines with proper spacing
   */
  private buildSearchableText(
    lines: PDFTextItem[][],
    originalItems?: PDFTextItem[]
  ): {
    fullText: string;
    itemMappings: {
      itemIndex: number;
      startPos: number;
      endPos: number;
      text: string;
    }[];
  } {
    let fullText = "";
    const itemMappings: {
      itemIndex: number;
      startPos: number;
      endPos: number;
      text: string;
    }[] = [];

    // Create a map to find original index of each item
    const itemToOriginalIndex = new Map<PDFTextItem, number>();

    if (originalItems) {
      originalItems.forEach((item, index) => {
        itemToOriginalIndex.set(item, index);
      });
    }

    let sequentialIndex = 0;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];

      for (let i = 0; i < line.length; i++) {
        const item = line[i];
        const startPos = fullText.length;

        // Add the item text
        fullText += item.str;

        // Get the original index of this item, or use sequential index
        const originalIndex = originalItems
          ? itemToOriginalIndex.get(item) ?? sequentialIndex
          : sequentialIndex;

        // Store mapping with original index
        itemMappings.push({
          itemIndex: originalIndex,
          startPos,
          endPos: fullText.length,
          text: item.str,
        });

        sequentialIndex++;

        // Add space between words if needed
        if (i < line.length - 1) {
          const nextItem = line[i + 1];
          const currentX = item.transform[4];
          const currentWidth = item.width;
          const nextX = nextItem.transform[4];

          // Check if there's a gap between items (likely a space)
          const gap = nextX - (currentX + currentWidth);
          if (gap > 2) {
            // Threshold for space detection
            fullText += " ";
          }
        }
      }

      // Add line break between lines
      if (lineIdx < lines.length - 1) {
        fullText += " ";
      }
    }

    return { fullText, itemMappings };
  }

  /**
   * Find matches in the reconstructed text
   */
  private findMatchesInText(
    fullText: string,
    query: string,
    pageNumber: number,
    itemMappings: {
      itemIndex: number;
      startPos: number;
      endPos: number;
      text: string;
    }[]
  ): PDFSearchMatch[] {
    const matches: PDFSearchMatch[] = [];
    const queryLower = query.toLowerCase();
    const fullTextLower = fullText.toLowerCase();

    let searchPos = 0;
    let matchIndex = 0;

    while ((searchPos = fullTextLower.indexOf(queryLower, searchPos)) !== -1) {
      const matchEnd = searchPos + queryLower.length;

      // Find which text items contain this match
      const textItems: TextItemMapping[] = [];

      for (const mapping of itemMappings) {
        // Check if this item overlaps with the match
        if (mapping.endPos > searchPos && mapping.startPos < matchEnd) {
          const itemStartChar = Math.max(0, searchPos - mapping.startPos);
          const itemEndChar = Math.min(
            mapping.text.length,
            matchEnd - mapping.startPos
          );

          if (itemEndChar > itemStartChar) {
            textItems.push({
              itemIndex: mapping.itemIndex,
              startChar: itemStartChar,
              endChar: itemEndChar,
            });
          }
        }
      }

      // Extract excerpt
      const excerpt = this.extractExcerpt(fullText, searchPos, query.length);

      matches.push({
        text: query,
        pageNumber,
        pageIndex: pageNumber - 1,
        excerpt,
        matchIndex: matchIndex++,
        charIndex: searchPos,
        textItems,
      });

      searchPos += queryLower.length;
    }

    return matches;
  }

  /**
   * Extract text excerpt around match
   */
  private extractExcerpt(
    text: string,
    matchStart: number,
    matchLength: number
  ): string {
    const contextLength = 40;
    const start = Math.max(0, matchStart - contextLength);
    const end = Math.min(text.length, matchStart + matchLength + contextLength);

    let excerpt = text.substring(start, end);

    if (start > 0) excerpt = "..." + excerpt;
    if (end < text.length) excerpt = excerpt + "...";

    return excerpt.replace(/\s+/g, " ").trim();
  }

  /**
   * Navigate to a specific match
   */
  async navigateToMatch(index: number): Promise<void> {
    if (index < 0 || index >= this.matches.length) return;

    this.currentMatchIndex = index;
    const match = this.matches[index];

    // Navigate to page if needed
    const currentPage = this.getCurrentPageNumber();
    if (this.onPageChange && match.pageNumber !== currentPage) {
      this.onPageChange(match.pageNumber);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // Wait for page to render
    await this.waitForPageRender(match.pageNumber);

    // Clear and create new highlights
    this.clearHighlights();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Highlight using PDF.js text content mapping
    await this.highlightMatchUsingTextContent(match);

    // Scroll to match
    this.scrollToMatch(match);
  }

  /**
   * Highlight a match using PDF.js text content information
   */
  private async highlightMatchUsingTextContent(
    match: PDFSearchMatch
  ): Promise<void> {
    if (!this.containerRef.current) return;

    const pageElement = this.containerRef.current.querySelector(
      `[data-page-number="${match.pageNumber}"]`
    );

    if (!pageElement) return;

    const textLayer = pageElement.querySelector(
      ".react-pdf__Page__textContent"
    );
    if (!textLayer) return;

    // Get the cached text content for this page
    const textContent = this.pageTextContentCache.get(match.pageNumber);
    if (!textContent) return;

    const textSpans = Array.from(textLayer.querySelectorAll("span"));
    const pdfTextItems = textContent.items as PDFTextItem[];

    // Filter out empty text items (PDF.js doesn't create spans for them)
    const nonEmptyItems = pdfTextItems.filter((item) => item.str.trim() !== "");

    // Create a mapping between PDF text items and DOM spans
    const spanMapping = this.mapTextItemsToSpans(
      pdfTextItems,
      textSpans,
      nonEmptyItems
    );

    // Use the mapping to highlight the correct spans
    for (const textItem of match.textItems) {
      const spanIndices = spanMapping.get(textItem.itemIndex);

      if (spanIndices && spanIndices.length > 0) {
        // Use the first matching span (usually there's only one)
        const spanIndex = spanIndices[0];
        if (spanIndex < textSpans.length) {
          const span = textSpans[spanIndex] as HTMLElement;

          // Create highlight for this portion of the match
          const highlight = this.createHighlightForTextItem(
            span,
            textItem.startChar,
            textItem.endChar - textItem.startChar,
            pageElement as HTMLElement
          );

          if (highlight) {
            this.highlightElements.push(highlight);
            pageElement.appendChild(highlight);
          }
        }
      }
    }
  }

  /**
   * Map PDF text items to DOM spans based on text content
   */
  private mapTextItemsToSpans(
    pdfTextItems: PDFTextItem[],
    domSpans: Element[],
    nonEmptyItems?: PDFTextItem[]
  ): Map<number, number[]> {
    const mapping = new Map<number, number[]>();

    // Use provided non-empty items or filter them
    const filteredItems =
      nonEmptyItems || pdfTextItems.filter((item) => item.str.trim() !== "");

    // If the number of non-empty items matches the number of spans,
    // there's likely a direct correspondence
    const directMapping = filteredItems.length === domSpans.length;

    if (directMapping) {
      console.debug(
        `Direct mapping: ${filteredItems.length} non-empty items to ${domSpans.length} spans`
      );

      // Map each non-empty item to its corresponding span
      for (let i = 0; i < filteredItems.length; i++) {
        const item = filteredItems[i];
        const originalIndex = pdfTextItems.indexOf(item);

        // Verify text matches as a sanity check
        const spanText = (domSpans[i].textContent || "").trim();
        const itemText = item.str.trim();

        if (spanText === itemText) {
          mapping.set(originalIndex, [i]);
        } else {
          // Still map it but log the mismatch
          console.debug(
            `Text mismatch at position ${i}: PDF="${itemText}" DOM="${spanText}"`
          );
          mapping.set(originalIndex, [i]);
        }
      }
    } else {
      // Fall back to content-based matching
      console.debug(
        `Content matching: ${pdfTextItems.length} items (${filteredItems.length} non-empty) to ${domSpans.length} spans`
      );

      const usedSpans = new Set<number>();

      // First pass: exact matches for non-empty items
      for (const item of filteredItems) {
        const originalIndex = pdfTextItems.indexOf(item);
        const itemText = item.str.trim();

        for (let spanIdx = 0; spanIdx < domSpans.length; spanIdx++) {
          if (usedSpans.has(spanIdx)) continue;

          const spanText = (domSpans[spanIdx].textContent || "").trim();

          if (spanText === itemText) {
            mapping.set(originalIndex, [spanIdx]);
            usedSpans.add(spanIdx);
            break;
          }
        }
      }

      // Second pass: position-based fallback for unmapped items
      const unmappedItems = filteredItems.filter(
        (item) => !mapping.has(pdfTextItems.indexOf(item))
      );

      const unusedSpans = Array.from(
        { length: domSpans.length },
        (_, i) => i
      ).filter((i) => !usedSpans.has(i));

      // Map remaining items to remaining spans by position
      for (
        let i = 0;
        i < Math.min(unmappedItems.length, unusedSpans.length);
        i++
      ) {
        const item = unmappedItems[i];
        const originalIndex = pdfTextItems.indexOf(item);
        const spanIdx = unusedSpans[i];

        console.debug(
          `Position fallback: mapping item ${originalIndex} "${item.str}" to span ${spanIdx}`
        );
        mapping.set(originalIndex, [spanIdx]);
      }
    }

    return mapping;
  }

  /**
   * Create highlight element for a text item
   */
  private createHighlightForTextItem(
    span: HTMLElement,
    charOffset: number,
    length: number,
    pageElement: HTMLElement
  ): HTMLElement | null {
    const text = span.textContent || "";

    // If highlighting the entire span
    if (charOffset === 0 && length >= text.length) {
      return this.createFullSpanHighlight(span, pageElement);
    }

    // For partial highlights, try to use Range API
    const textNode = span.firstChild as Text;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
      return this.createFullSpanHighlight(span, pageElement);
    }

    try {
      const range = document.createRange();
      const startOffset = Math.min(charOffset, textNode.length);
      const endOffset = Math.min(charOffset + length, textNode.length);

      range.setStart(textNode, startOffset);
      range.setEnd(textNode, endOffset);

      const rect = range.getBoundingClientRect();
      const pageRect = pageElement.getBoundingClientRect();

      const highlight = document.createElement("div");
      highlight.className = "search-highlight search-highlight-current";
      highlight.style.cssText = `
        position: absolute;
        left: ${rect.left - pageRect.left}px;
        top: ${rect.top - pageRect.top}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        background-color: rgba(255, 235, 59, 0.4);
        pointer-events: none;
        mix-blend-mode: multiply;
        z-index: 1;
      `;

      return highlight;
    } catch (error) {
      console.warn("Error creating partial highlight:", error);
      return this.createFullSpanHighlight(span, pageElement);
    }
  }

  /**
   * Create highlight for entire span
   */
  private createFullSpanHighlight(
    span: HTMLElement,
    pageElement: HTMLElement
  ): HTMLElement {
    const spanRect = span.getBoundingClientRect();
    const pageRect = pageElement.getBoundingClientRect();

    const highlight = document.createElement("div");
    highlight.className = "search-highlight search-highlight-current";
    highlight.style.cssText = `
      position: absolute;
      left: ${spanRect.left - pageRect.left}px;
      top: ${spanRect.top - pageRect.top}px;
      width: ${spanRect.width}px;
      height: ${spanRect.height}px;
      background-color: rgba(255, 235, 59, 0.4);
      pointer-events: none;
      mix-blend-mode: multiply;
      z-index: 1;
    `;

    return highlight;
  }

  /**
   * Navigate to next match
   */
  next(): void {
    if (!this.matches.length) return;
    const nextIndex = (this.currentMatchIndex + 1) % this.matches.length;
    void this.navigateToMatch(nextIndex);
  }

  /**
   * Navigate to previous match
   */
  previous(): void {
    if (!this.matches.length) return;
    const prevIndex =
      (this.currentMatchIndex - 1 + this.matches.length) % this.matches.length;
    void this.navigateToMatch(prevIndex);
  }

  /**
   * Get current match number (1-based)
   */
  getCurrentMatch(): number {
    return this.matches.length ? this.currentMatchIndex + 1 : 0;
  }

  /**
   * Get total number of matches
   */
  getTotalMatches(): number {
    return this.matches.length;
  }

  /**
   * Clear search
   */
  clear(): void {
    this.clearHighlights();
    this.matches = [];
    this.currentMatchIndex = 0;
    this.currentQuery = "";
    this.pageTextContentCache.clear();
  }

  /**
   * Scroll to match
   */
  private scrollToMatch(match: PDFSearchMatch): void {
    if (!this.containerRef.current) return;

    setTimeout(() => {
      const currentHighlight = this.containerRef.current?.querySelector(
        ".search-highlight-current"
      );

      if (currentHighlight) {
        currentHighlight.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center",
        });
      } else {
        const pageElement = this.containerRef.current?.querySelector(
          `[data-page-number="${match.pageNumber}"]`
        );
        if (pageElement) {
          pageElement.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      }
    }, 150);
  }

  /**
   * Clear all highlights
   */
  private clearHighlights(): void {
    this.highlightElements.forEach((el) => el.remove());
    this.highlightElements = [];
  }

  /**
   * Wait for page to render
   */
  private async waitForPageRender(pageNumber: number): Promise<void> {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 60;

      const checkInterval = setInterval(() => {
        attempts++;

        if (!this.containerRef.current || attempts >= maxAttempts) {
          clearInterval(checkInterval);
          resolve();
          return;
        }

        const pageElement = this.containerRef.current.querySelector(
          `[data-page-number="${pageNumber}"]`
        );

        if (pageElement) {
          const textLayer = pageElement.querySelector(
            ".react-pdf__Page__textContent"
          );

          if (textLayer && textLayer.children.length > 0) {
            // Verify text spans match our cached content
            const textContent = this.pageTextContentCache.get(pageNumber);
            const expectedSpans = textContent?.items?.length || 0;
            const actualSpans = textLayer.children.length;

            // Wait until we have all expected spans
            if (actualSpans >= expectedSpans) {
              clearInterval(checkInterval);
              setTimeout(resolve, 100);
            }
          }
        }
      }, 50);
    });
  }

  /**
   * Get current page number
   */
  private getCurrentPageNumber(): number {
    if (!this.containerRef.current) return 0;

    const currentPageElement =
      this.containerRef.current.querySelector("[data-page-number]");
    if (currentPageElement) {
      return parseInt(
        currentPageElement.getAttribute("data-page-number") || "0"
      );
    }

    return 0;
  }

  /**
   * Update container reference
   */
  updateContainerRef(
    containerRef: React.RefObject<HTMLDivElement | null>
  ): void {
    this.containerRef = containerRef;
  }

  /**
   * Update PDF document
   */
  updatePdfDocument(pdfDocument: any): void {
    this.pdfDocument = pdfDocument;
    this.clear();
  }

  /**
   * Refresh highlights
   */
  refreshHighlights(): void {
    if (this.matches.length > 0 && this.currentMatchIndex >= 0) {
      this.clearHighlights();
      void this.highlightMatchUsingTextContent(
        this.matches[this.currentMatchIndex]
      );
    }
  }

  /**
   * Destroy service
   */
  destroy(): void {
    this.clear();
  }
}
