// src/adapters/PDFAdapter.ts
import { TTSAdapter, TTSLocator, TTSSentence } from "../services/TTSController";

export class PDFAdapter implements TTSAdapter {
  private pdfDocument: any;
  private container: HTMLElement;
  private startHereCallback: ((locator: TTSLocator) => void) | null = null;
  private currentHighlight: HTMLElement | null = null;

  constructor(pdfDocument: any, container: HTMLElement) {
    this.pdfDocument = pdfDocument;
    this.container = container;
    this.setupStartHereHandler();
  }

  getLocator(): TTSLocator | null {
    try {
      // Find the currently visible page
      const visiblePage = this.getCurrentlyVisiblePage();
      if (!visiblePage) return null;

      return {
        type: "pdf",
        sentenceId: "", // Will be filled by sentence indexer
        page: visiblePage,
        char: 0, // Could be enhanced to track character position
      };
    } catch (error) {
      console.warn("Failed to get PDF locator:", error);
      return null;
    }
  }

  async goToLocator(locator: TTSLocator): Promise<void> {
    try {
      if (locator.page) {
        await this.scrollToPage(locator.page);

        if (locator.char !== undefined) {
          await this.scrollToCharacter(locator.page, locator.char);
        }
      }
    } catch (error) {
      console.warn("Failed to navigate to locator:", error);
    }
  }

  highlightSentence(sentence: TTSSentence): void {
    try {
      // Clear previous highlight
      this.clearHighlight();

      if (sentence.page) {
        const textElements = this.getTextElementsForSentence(sentence);
        if (textElements.length > 0) {
          this.currentHighlight = this.createHighlightOverlay(textElements);
          this.container.appendChild(this.currentHighlight);
        }
      }
    } catch (error) {
      console.warn("Failed to highlight sentence:", error);
    }
  }

  clearHighlight(): void {
    try {
      if (this.currentHighlight) {
        this.currentHighlight.remove();
        this.currentHighlight = null;
      }

      // Also clear any orphaned highlights
      const highlights = this.container.querySelectorAll(".tts-pdf-highlight");
      highlights.forEach((el) => el.remove());
    } catch (error) {
      console.warn("Failed to clear highlights:", error);
    }
  }

  onStartHere(callback: (locator: TTSLocator) => void): void {
    this.startHereCallback = callback;
  }

  private setupStartHereHandler(): void {
    let lastTap = 0;

    this.container.addEventListener("click", (event: MouseEvent) => {
      const now = Date.now();
      const timeDelta = now - lastTap;

      if (timeDelta < 300 && timeDelta > 0) {
        // Double tap detected
        this.handleDoubleClick(event);
      }

      lastTap = now;
    });

    // Mobile long press support
    let pressTimer: NodeJS.Timeout | null = null;
    this.container.addEventListener("touchstart", (event: TouchEvent) => {
      pressTimer = setTimeout(() => {
        this.handleLongPress(event);
      }, 500);
    });

    this.container.addEventListener("touchend", () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    });
  }

  private handleDoubleClick(event: MouseEvent): void {
    try {
      const target = event.target as Element;
      if (!target) return;

      // Get the clicked text
      const clickedText = target.textContent?.substring(0, 100) || "";
      console.log(
        "🎯 PDF Click target:",
        target.tagName,
        clickedText.substring(0, 50)
      );

      // Find the page number
      const pageElement = target.closest(
        ".pdf-page, .page, [data-page-number]"
      );
      const pageNum =
        pageElement?.getAttribute("data-page-number") ||
        pageElement?.getAttribute("data-page") ||
        this.getCurrentPageNumber();

      if (!pageNum) {
        console.warn("Could not determine page number");
        return;
      }

      // Try to get character position
      let charPosition = 0;
      const textLayer = target.closest(".textLayer");
      if (textLayer) {
        // Calculate approximate character position
        const allTextNodes = textLayer.querySelectorAll("span");
        let totalChars = 0;

        for (const span of allTextNodes) {
          if (span === target || span.contains(target)) {
            charPosition = totalChars;
            break;
          }
          totalChars += (span.textContent || "").length;
        }
      }

      console.log(
        "📍 PDF double-click at page",
        pageNum,
        "char position",
        charPosition
      );

      if (this.startHereCallback) {
        const locator: any = {
          type: "pdf" as const,
          sentenceId: "",
          page: parseInt(pageNum),
          char: charPosition,
          clickedText: clickedText.trim(), // Add clicked text for PDF too
        };

        console.log("📍 Sending PDF locator with text:", {
          page: locator.page,
          char: locator.char,
          clickedText: locator.clickedText.substring(0, 50) + "...",
        });

        this.startHereCallback(locator);
      }
    } catch (error) {
      console.warn("Failed to handle PDF double click:", error);
    }
  }

  private handleLongPress(event: TouchEvent): void {
    try {
      const touch = event.touches[0];
      if (!touch) return;

      const element = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!element) return;

      // Get the clicked text
      const clickedText = element.textContent?.substring(0, 100) || "";
      console.log("👆 PDF Touch target:", clickedText.substring(0, 50));

      // Find the page number
      const pageElement = element.closest(
        ".pdf-page, .page, [data-page-number]"
      );
      const pageNum =
        pageElement?.getAttribute("data-page-number") ||
        pageElement?.getAttribute("data-page") ||
        this.getCurrentPageNumber();

      if (!pageNum) {
        console.warn("Could not determine page number");
        return;
      }

      // Try to get character position
      let charPosition = 0;
      const textLayer = element.closest(".textLayer");
      if (textLayer) {
        const allTextNodes = textLayer.querySelectorAll("span");
        let totalChars = 0;

        for (const span of allTextNodes) {
          if (span === element || span.contains(element)) {
            charPosition = totalChars;
            break;
          }
          totalChars += (span.textContent || "").length;
        }
      }

      console.log(
        "📍 PDF long press at page",
        pageNum,
        "char position",
        charPosition
      );

      if (this.startHereCallback) {
        const locator: any = {
          type: "pdf" as const,
          sentenceId: "",
          page: parseInt(pageNum),
          char: charPosition,
          clickedText: clickedText.trim(),
        };

        console.log("📍 Sending PDF touch locator with text:", {
          page: locator.page,
          char: locator.char,
          clickedText: locator.clickedText.substring(0, 50) + "...",
        });

        this.startHereCallback(locator);
      }
    } catch (error) {
      console.warn("Failed to handle PDF long press:", error);
    }
  }

  private getCurrentlyVisiblePage(): number | null {
    try {
      const pages = this.container.querySelectorAll("[data-page-number]");

      for (const page of pages) {
        const rect = page.getBoundingClientRect();
        const containerRect = this.container.getBoundingClientRect();

        // Check if page is significantly visible
        if (
          rect.top < containerRect.bottom &&
          rect.bottom > containerRect.top
        ) {
          const pageNumber = page.getAttribute("data-page-number");
          return pageNumber ? parseInt(pageNumber) : null;
        }
      }

      return null;
    } catch (error) {
      console.warn("Failed to get visible page:", error);
      return null;
    }
  }

  private async scrollToPage(page: number): Promise<void> {
    try {
      const pageElement = this.container.querySelector(
        `[data-page-number="${page}"]`
      );
      if (pageElement) {
        pageElement.scrollIntoView({ behavior: "smooth", block: "start" });

        // Wait a bit for scroll to complete
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } catch (error) {
      console.warn("Failed to scroll to page:", error);
    }
  }

  private async scrollToCharacter(
    page: number,
    charOffset: number
  ): Promise<void> {
    try {
      const textLayer = this.container.querySelector(
        `[data-page-number="${page}"] .textLayer`
      );
      if (!textLayer) return;

      // Find the text element containing the character offset
      const textElements = Array.from(textLayer.children);
      let currentOffset = 0;

      for (const element of textElements) {
        const text = element.textContent || "";
        if (currentOffset + text.length >= charOffset) {
          // Found the element, scroll to it
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          break;
        }
        currentOffset += text.length;
      }
    } catch (error) {
      console.warn("Failed to scroll to character:", error);
    }
  }

  private getCharacterOffsetFromClick(
    event: MouseEvent,
    textLayer: Element
  ): number {
    try {
      let offset = 0;
      const textElements = Array.from(textLayer.children);

      for (const element of textElements) {
        const rect = element.getBoundingClientRect();

        // Check if click is within this element's bounds
        if (
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
        ) {
          // Rough approximation of character position within element
          const relativeX = event.clientX - rect.left;
          const elementWidth = rect.width;
          const text = element.textContent || "";
          const charInElement = Math.floor(
            (relativeX / elementWidth) * text.length
          );

          return offset + charInElement;
        }

        offset += (element.textContent || "").length;
      }

      return offset;
    } catch (error) {
      console.warn("Failed to get character offset from click:", error);
      return 0;
    }
  }

  private getTextElementsForSentence(sentence: TTSSentence): Element[] {
    try {
      console.log("🔍 Finding text elements for sentence:", {
        id: sentence.id,
        page: sentence.page,
        charStart: sentence.char_start,
        charEnd: sentence.char_end,
        text: sentence.text.substring(0, 50) + "...",
      });

      const textLayer = this.container.querySelector(
        `[data-page-number="${sentence.page}"] .textLayer`
      );

      if (!textLayer) {
        console.warn("❌ No text layer found for page", sentence.page);
        return [];
      }

      const textElements: Element[] = [];
      const children = Array.from(textLayer.children);
      let currentChar = 0;

      console.log("📝 Scanning", children.length, "text elements");

      for (let i = 0; i < children.length; i++) {
        const element = children[i];
        const text = element.textContent || "";
        const nodeStart = currentChar;
        const nodeEnd = currentChar + text.length;

        // Check if this text element overlaps with our sentence
        const overlaps =
          nodeEnd > sentence.char_start && nodeStart < sentence.char_end;

        if (overlaps) {
          console.log("✅ Found overlapping element:", {
            index: i,
            nodeStart,
            nodeEnd,
            text: text.substring(0, 30) + "...",
            sentenceRange: `${sentence.char_start}-${sentence.char_end}`,
          });
          textElements.push(element);
        }

        currentChar = nodeEnd + 1; // +1 for space between elements
      }

      console.log("🎯 Found", textElements.length, "matching text elements");
      return textElements;
    } catch (error) {
      console.error("❌ Error finding text elements for sentence:", error);
      return [];
    }
  }

  private createHighlightOverlay(textElements: Element[]): HTMLElement {
    const overlay = document.createElement("div");
    overlay.className = "tts-pdf-highlight";
    overlay.style.cssText = `
      position: absolute;
      background-color: rgba(255, 255, 0, 0.3);
      pointer-events: none;
      z-index: 100;
      border-radius: 2px;
      transition: opacity 0.2s ease;
    `;

    // Calculate bounding box of all text elements
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (const element of textElements) {
      const rect = element.getBoundingClientRect();
      const containerRect = this.container.getBoundingClientRect();

      // Convert to container-relative coordinates
      const relativeTop =
        rect.top - containerRect.top + this.container.scrollTop;
      const relativeLeft =
        rect.left - containerRect.left + this.container.scrollLeft;

      minX = Math.min(minX, relativeLeft);
      minY = Math.min(minY, relativeTop);
      maxX = Math.max(maxX, relativeLeft + rect.width);
      maxY = Math.max(maxY, relativeTop + rect.height);
    }

    if (minX !== Infinity) {
      overlay.style.left = `${minX}px`;
      overlay.style.top = `${minY}px`;
      overlay.style.width = `${maxX - minX}px`;
      overlay.style.height = `${maxY - minY}px`;
    }

    return overlay;
  }

  // Method to get page text for sentence indexing
  async getPageText(pageNumber: number): Promise<string | null> {
    try {
      const page = await this.pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();

      // Combine all text items
      const text = textContent.items
        .map((item: any) => item.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      return text;
    } catch (error) {
      console.warn(`Failed to get text for page ${pageNumber}:`, error);
      return null;
    }
  }

  destroy(): void {
    this.clearHighlight();
    this.startHereCallback = null;
  }

  private getCurrentPageNumber(): string {
    // Try to get from PDF.js viewer if available
    if ((window as any).PDFViewerApplication) {
      return String((window as any).PDFViewerApplication.page || 1);
    }

    // Try to find visible page in the container
    const visiblePage = this.container.querySelector(
      ".page:not([hidden]), .pdf-page:not([hidden]), [data-page-number]:not([hidden])"
    );
    if (visiblePage) {
      const pageNum =
        visiblePage.getAttribute("data-page-number") ||
        visiblePage.getAttribute("data-page") ||
        visiblePage.id?.replace(/\D/g, ""); // Extract number from id like "page1"
      if (pageNum) return pageNum;
    }

    // Try to find the page in viewport
    const pages = this.container.querySelectorAll(
      ".page, .pdf-page, [data-page-number]"
    );
    for (const page of pages) {
      const rect = page.getBoundingClientRect();
      const containerRect = this.container.getBoundingClientRect();

      // Check if page is in viewport
      if (rect.top >= containerRect.top && rect.top <= containerRect.bottom) {
        const pageNum =
          page.getAttribute("data-page-number") ||
          page.getAttribute("data-page") ||
          page.id?.replace(/\D/g, "");
        if (pageNum) return pageNum;
      }
    }

    // Last resort: try to get from PDFDocument
    if (this.pdfDocument) {
      // If you have access to current page through PDF.js
      return "1"; // Default to first page
    }

    console.warn("Could not determine current page number, defaulting to 1");
    return "1";
  }
}
