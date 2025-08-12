// src/adapters/PDFAdapter.ts
import { TTSAdapter, TTSLocator, TTSSentence } from "../services/TTSController";

export class PDFAdapter implements TTSAdapter {
  private pdfDocument: any; // PDF.js document
  private pageContainer: HTMLElement;
  private currentPage: number = 1;
  private currentHighlight: HTMLElement | null = null;
  private startHereHandler: ((locator: TTSLocator) => void) | null = null;

  constructor(pdfDocument: any, pageContainer: HTMLElement) {
    this.pdfDocument = pdfDocument;
    this.pageContainer = pageContainer;
    this.setupStartHereHandler();
  }

  getLocator(): TTSLocator | null {
    return {
      type: "pdf",
      sentenceId: "", // Will be computed by sentence index
      page: this.currentPage,
      char: 0, // Could be enhanced to track character position
    };
  }

  async goToLocator(locator: TTSLocator): Promise<void> {
    if (locator.type !== "pdf" || !locator.page) return;

    try {
      // Update current page
      this.currentPage = locator.page;

      // Scroll to page (implementation depends on your PDF viewer)
      await this.scrollToPage(locator.page);

      // If character position is specified, try to scroll to it
      if (locator.char !== undefined) {
        await this.scrollToCharacter(locator.page, locator.char);
      }
    } catch (error) {
      console.warn("Failed to navigate to PDF locator:", error);
    }
  }

  highlightSentence(sentence: TTSSentence): void {
    if (
      !sentence.page ||
      sentence.char_start === undefined ||
      sentence.char_end === undefined
    )
      return;

    try {
      // Clear previous highlight
      this.clearHighlight();

      // Find text elements for the sentence
      const textElements = this.getTextElementsForSentence(sentence);
      if (textElements.length === 0) return;

      // Create highlight overlay
      this.currentHighlight = this.createHighlightOverlay(textElements);

      // Append to page container
      if (this.pageContainer && this.currentHighlight) {
        this.pageContainer.appendChild(this.currentHighlight);
      }
    } catch (error) {
      console.warn("Failed to highlight PDF sentence:", error);
    }
  }

  clearHighlight(): void {
    if (this.currentHighlight) {
      this.currentHighlight.remove();
      this.currentHighlight = null;
    }
  }

  private setupStartHereHandler(): void {
    if (!this.pageContainer) return;

    let tapCount = 0;
    let tapTimer: NodeJS.Timeout | null = null;

    // Double-tap handler
    const handleDoubleClick = (e: MouseEvent) => {
      this.handleStartHere(e);
    };

    // Touch handlers for mobile
    const handleTouchEnd = (e: TouchEvent) => {
      tapCount++;

      if (tapCount === 1) {
        tapTimer = setTimeout(() => {
          tapCount = 0;
        }, 300);
      } else if (tapCount === 2) {
        if (tapTimer) clearTimeout(tapTimer);
        tapCount = 0;

        // Convert touch to mouse-like event
        const touch = e.changedTouches[0];
        this.handleStartHere({
          clientX: touch.clientX,
          clientY: touch.clientY,
          target: e.target,
        } as any);
      }
    };

    this.pageContainer.addEventListener("dblclick", handleDoubleClick);
    this.pageContainer.addEventListener("touchend", handleTouchEnd);

    // Store for cleanup
    (this.pageContainer as any)._ttsHandlers = {
      dblclick: handleDoubleClick,
      touchend: handleTouchEnd,
    };
  }

  private handleStartHere(
    e: MouseEvent | { clientX: number; clientY: number; target: any }
  ): void {
    if (!this.startHereHandler) return;

    try {
      // Get character position from click coordinates
      const charPosition = this.getCharacterPositionFromPoint(
        e.clientX,
        e.clientY
      );

      const locator: TTSLocator = {
        type: "pdf",
        sentenceId: "", // Will be computed by sentence index
        page: this.currentPage,
        char: charPosition,
      };

      this.startHereHandler(locator);
    } catch (error) {
      console.warn("Failed to handle PDF start here:", error);
    }
  }

  private async scrollToPage(page: number): Promise<void> {
    // Implementation depends on your PDF viewer
    // This is a placeholder
    const pageElement = this.pageContainer.querySelector(
      `[data-page-number="${page}"]`
    );
    if (pageElement) {
      pageElement.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  private async scrollToCharacter(
    page: number,
    charOffset: number
  ): Promise<void> {
    // Implementation depends on your PDF text layer
    // This would need to map character offset to screen coordinates
    console.log(`Scrolling to character ${charOffset} on page ${page}`);
  }

  private getTextElementsForSentence(sentence: TTSSentence): Element[] {
    // Find PDF text layer elements that contain the sentence
    // This is a simplified implementation
    const textLayer = this.pageContainer.querySelector(
      `[data-page-number="${sentence.page}"] .textLayer`
    );
    if (!textLayer) return [];

    const textElements: Element[] = [];
    const walker = document.createTreeWalker(
      textLayer,
      NodeFilter.SHOW_TEXT,
      null
    );

    let currentChar = 0;
    let node: Node | null;

    while ((node = walker.nextNode())) {
      const text = node.textContent || "";
      const nodeStart = currentChar;
      const nodeEnd = currentChar + text.length;

      // Check if this text node overlaps with our sentence
      if (nodeEnd > sentence.char_start && nodeStart < sentence.char_end) {
        const element = node.parentElement;
        if (element) {
          textElements.push(element);
        }
      }

      currentChar = nodeEnd;
    }

    return textElements;
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
    `;

    // Calculate bounding box of all text elements
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    textElements.forEach((element) => {
      const rect = element.getBoundingClientRect();
      const containerRect = this.pageContainer.getBoundingClientRect();

      const relativeX = rect.left - containerRect.left;
      const relativeY = rect.top - containerRect.top;

      minX = Math.min(minX, relativeX);
      minY = Math.min(minY, relativeY);
      maxX = Math.max(maxX, relativeX + rect.width);
      maxY = Math.max(maxY, relativeY + rect.height);
    });

    overlay.style.left = `${minX}px`;
    overlay.style.top = `${minY}px`;
    overlay.style.width = `${maxX - minX}px`;
    overlay.style.height = `${maxY - minY}px`;

    return overlay;
  }

  private getCharacterPositionFromPoint(x: number, y: number): number {
    // Simplified implementation - maps screen coordinates to character offset
    // This would need more sophisticated implementation based on your PDF text layer
    const textLayer = this.pageContainer.querySelector(
      `[data-page-number="${this.currentPage}"] .textLayer`
    );
    if (!textLayer) return 0;

    const rect = textLayer.getBoundingClientRect();
    const relativeY = y - rect.top;
    const relativeX = x - rect.left;

    // Very rough approximation - you'd want more precise mapping
    const lineHeight = 16; // Approximate
    const charWidth = 8; // Approximate

    const line = Math.floor(relativeY / lineHeight);
    const charInLine = Math.floor(relativeX / charWidth);

    return line * 80 + charInLine; // Assuming ~80 chars per line
  }

  onStartHere(handler: (locator: TTSLocator) => void): void {
    this.startHereHandler = handler;
  }

  destroy(): void {
    this.clearHighlight();

    // Clean up event handlers
    if (this.pageContainer) {
      const handlers = (this.pageContainer as any)._ttsHandlers;
      if (handlers) {
        this.pageContainer.removeEventListener("dblclick", handlers.dblclick);
        this.pageContainer.removeEventListener("touchend", handlers.touchend);
        delete (this.pageContainer as any)._ttsHandlers;
      }
    }

    this.startHereHandler = null;
  }
}
