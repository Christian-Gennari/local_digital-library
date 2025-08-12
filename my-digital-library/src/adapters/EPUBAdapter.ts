// src/adapters/EPUBAdapter.ts
import { TTSAdapter, TTSLocator, TTSSentence } from "../services/TTSController";

export class EPUBAdapter implements TTSAdapter {
  private rendition: any; // EPUB.js rendition
  private book: any; // EPUB.js book
  private currentHighlight: any = null;
  private startHereHandler: ((locator: TTSLocator) => void) | null = null;

  constructor(book: any, rendition: any) {
    this.book = book;
    this.rendition = rendition;
    this.setupStartHereHandler();
  }

  getLocator(): TTSLocator | null {
    if (!this.rendition) return null;

    const location = this.rendition.currentLocation();
    if (!location?.start) return null;

    return {
      type: "epub",
      sentenceId: "", // Will be filled by TTS Controller when mapping to sentence
      href: location.start.href,
      cfi: location.start.cfi,
    };
  }

  async goToLocator(locator: TTSLocator): Promise<void> {
    if (locator.type !== "epub" || !this.rendition) return;

    try {
      // Navigate to the location
      if (locator.cfi) {
        await this.rendition.display(locator.cfi);
      } else if (locator.href) {
        await this.rendition.display(locator.href);
      }

      // Small delay to ensure rendering is complete
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.warn("Failed to navigate to locator:", error);
    }
  }

  highlightSentence(sentence: TTSSentence): void {
    if (!this.rendition || !sentence.cfi_start || !sentence.cfi_end) return;

    try {
      // Clear previous highlight
      this.clearHighlight();

      // Create CFI range for the sentence
      const cfiRange = `${sentence.cfi_start},${sentence.cfi_end}`;

      // Add highlight with custom styling
      this.currentHighlight = this.rendition.annotations.highlight(
        cfiRange,
        {},
        (e: Event) => {
          // Optional: handle highlight click
        },
        "tts-highlight",
        {
          fill: "rgba(255, 255, 0, 0.3)",
          "fill-opacity": "0.3",
          "mix-blend-mode": "multiply",
        }
      );
    } catch (error) {
      console.warn("Failed to highlight sentence:", error);
    }
  }

  clearHighlight(): void {
    if (this.currentHighlight && this.rendition) {
      try {
        this.rendition.annotations.remove(this.currentHighlight, "highlight");
        this.currentHighlight = null;
      } catch (error) {
        console.warn("Failed to clear highlight:", error);
      }
    }
  }

  private setupStartHereHandler(): void {
    if (!this.rendition) return;

    // Set up double-tap/long-press handler on rendered content
    this.rendition.on("rendered", (section: any) => {
      const iframe = this.rendition.getContents()[0];
      if (!iframe?.document) return;

      // Remove existing handlers
      const existingHandler =
        iframe.document.querySelector("[data-tts-handler]");
      if (existingHandler) {
        existingHandler.removeAttribute("data-tts-handler");
      }

      // Add event handlers to the document body
      const body = iframe.document.body;
      if (!body) return;

      body.setAttribute("data-tts-handler", "true");

      let touchStartTime = 0;
      let touchStartPos = { x: 0, y: 0 };
      let tapCount = 0;
      let tapTimer: NodeJS.Timeout | null = null;

      // Touch handlers for mobile
      const handleTouchStart = (e: TouchEvent) => {
        touchStartTime = Date.now();
        touchStartPos = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
      };

      const handleTouchEnd = (e: TouchEvent) => {
        const touchEndTime = Date.now();
        const touchDuration = touchEndTime - touchStartTime;
        const touch = e.changedTouches[0];
        const deltaX = Math.abs(touch.clientX - touchStartPos.x);
        const deltaY = Math.abs(touch.clientY - touchStartPos.y);

        // Long press (500ms+)
        if (touchDuration > 500 && deltaX < 10 && deltaY < 10) {
          this.handleStartHere(
            e.target as Element,
            touch.clientX,
            touch.clientY
          );
          return;
        }

        // Double tap detection
        if (touchDuration < 300 && deltaX < 10 && deltaY < 10) {
          tapCount++;

          if (tapCount === 1) {
            tapTimer = setTimeout(() => {
              tapCount = 0;
            }, 300);
          } else if (tapCount === 2) {
            if (tapTimer) clearTimeout(tapTimer);
            tapCount = 0;
            this.handleStartHere(
              e.target as Element,
              touch.clientX,
              touch.clientY
            );
          }
        }
      };

      // Mouse handlers for desktop
      const handleDoubleClick = (e: MouseEvent) => {
        this.handleStartHere(e.target as Element, e.clientX, e.clientY);
      };

      // Attach event listeners
      body.addEventListener("touchstart", handleTouchStart, { passive: true });
      body.addEventListener("touchend", handleTouchEnd, { passive: true });
      body.addEventListener("dblclick", handleDoubleClick);

      // Store references for cleanup
      (body as any)._ttsHandlers = {
        touchstart: handleTouchStart,
        touchend: handleTouchEnd,
        dblclick: handleDoubleClick,
      };
    });
  }

  private handleStartHere(
    target: Element,
    clientX: number,
    clientY: number
  ): void {
    if (!this.rendition || !this.startHereHandler) return;

    try {
      const iframe = this.rendition.getContents()[0];
      if (!iframe?.document) return;

      // Find the text node at the click/tap position
      const range = this.getTextRangeAtPoint(iframe.document, clientX, clientY);
      if (!range) return;

      // Get CFI for the range
      const cfi = iframe.cfiFromRange(range);
      const location = this.rendition.currentLocation();

      if (cfi && location?.start?.href) {
        const locator: TTSLocator = {
          type: "epub",
          sentenceId: "", // Will be computed by sentence index
          href: location.start.href,
          cfi: cfi,
        };

        this.startHereHandler(locator);
      }
    } catch (error) {
      console.warn("Failed to handle start here:", error);
    }
  }

  private getTextRangeAtPoint(
    doc: Document,
    x: number,
    y: number
  ): Range | null {
    if ((doc as any).caretRangeFromPoint) {
      return (doc as any).caretRangeFromPoint(x, y);
    } else if ((doc as any).caretPositionFromPoint) {
      const pos = (doc as any).caretPositionFromPoint(x, y);
      if (pos) {
        const range = doc.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.setEnd(pos.offsetNode, pos.offset);
        return range;
      }
    }
    return null;
  }

  onStartHere(handler: (locator: TTSLocator) => void): void {
    this.startHereHandler = handler;
  }

  destroy(): void {
    this.clearHighlight();

    // Clean up event handlers
    if (this.rendition) {
      const iframe = this.rendition.getContents()[0];
      if (iframe?.document?.body) {
        const body = iframe.document.body;
        const handlers = (body as any)._ttsHandlers;
        if (handlers) {
          body.removeEventListener("touchstart", handlers.touchstart);
          body.removeEventListener("touchend", handlers.touchend);
          body.removeEventListener("dblclick", handlers.dblclick);
          delete (body as any)._ttsHandlers;
        }
      }
    }

    this.startHereHandler = null;
  }
}
