// src/adapters/EPUBAdapter.ts
import { TTSAdapter, TTSLocator, TTSSentence } from "../services/TTSController";

export class EPUBAdapter implements TTSAdapter {
  private book: any;
  private rendition: any;
  private startHereCallback: ((locator: TTSLocator) => void) | null = null;
  private currentHighlight: string | null = null;

  constructor(book: any, rendition: any) {
    this.book = book;
    this.rendition = rendition;
    this.setupStartHereHandler();
  }

  getLocator(): TTSLocator | null {
    try {
      const location = this.rendition.currentLocation();
      if (!location?.start) return null;

      return {
        type: "epub",
        sentenceId: "", // Will be filled by sentence indexer
        href: location.start.href,
        cfi: location.start.cfi,
      };
    } catch (error) {
      console.warn("Failed to get EPUB locator:", error);
      return null;
    }
  }

  async goToLocator(locator: TTSLocator): Promise<void> {
    try {
      if (locator.cfi) {
        await this.rendition.display(locator.cfi);
      } else if (locator.href) {
        await this.rendition.display(locator.href);
      }
    } catch (error) {
      console.warn("Failed to navigate to locator:", error);
    }
  }

  highlightSentence(sentence: TTSSentence): void {
    try {
      // Clear previous highlight
      this.clearHighlight();

      if (sentence.cfi_start && sentence.cfi_end) {
        // Create range from start to end CFI
        const range = `${sentence.cfi_start},${sentence.cfi_end}`;
        this.rendition.annotations.add(
          "highlight",
          range,
          {},
          null,
          "tts-highlight",
          {
            "data-sentence-id": sentence.id,
            title: sentence.text.substring(0, 50) + "...",
          }
        );
        this.currentHighlight = range;
      }
    } catch (error) {
      console.warn("Failed to highlight sentence:", error);
    }
  }

  clearHighlight(): void {
    try {
      if (this.currentHighlight) {
        this.rendition.annotations.remove(this.currentHighlight, "highlight");
        this.currentHighlight = null;
      }

      // Also clear any orphaned highlights
      const views = this.rendition.views?.();
      views?.forEach?.((view: any) => {
        const doc = view?.document || view?.iframe?.contentDocument;
        const highlights = doc?.querySelectorAll?.(".tts-highlight");
        highlights?.forEach?.((el: any) => el.remove());
      });
    } catch (error) {
      console.warn("Failed to clear highlights:", error);
    }
  }

  onStartHere(callback: (locator: TTSLocator) => void): void {
    this.startHereCallback = callback;
  }

  private setupStartHereHandler(): void {
    console.log("🎯 Setting up EPUB start-here handler");

    this.rendition.on("rendered", (section: any) => {
      console.log("📖 EPUB section rendered:", section.href);
      console.log("🔧 Setting up event handlers for section...");

      // Get the iframe document
      const iframe = section.document.defaultView?.frameElement;
      const doc = iframe?.contentDocument || section.document;

      if (!doc) {
        console.warn("❌ Could not access iframe document for", section.href);
        return;
      }

      console.log("✅ Got document for section:", section.href);

      let lastTap = 0;
      let pressTimer: NodeJS.Timeout | null = null;

      // Remove existing handlers to avoid duplicates
      const existingClickHandler = (doc as any)._ttsClickHandler;
      const existingTouchHandler = (doc as any)._ttsTouchHandler;

      if (existingClickHandler) {
        doc.removeEventListener("click", existingClickHandler);
        console.log("🧹 Removed existing click handler");
      }
      if (existingTouchHandler) {
        doc.removeEventListener("touchstart", existingTouchHandler);
        console.log("🧹 Removed existing touch handler");
      }

      // Double-tap handler for desktop
      const clickHandler = (event: MouseEvent) => {
        console.log("🖱️ EPUB click detected on:", event.target);
        const now = Date.now();
        const timeDelta = now - lastTap;

        console.log("⏱️ Time delta:", timeDelta, "ms");

        if (timeDelta < 300 && timeDelta > 0) {
          console.log("🖱️ EPUB double-tap detected! Processing...");
          event.preventDefault();
          event.stopPropagation();
          this.handleDoubleClick(event, section);
        } else {
          console.log("🖱️ Single click, waiting for potential double-tap...");
        }

        lastTap = now;
      };

      // Long press handler for mobile
      const touchStartHandler = (event: TouchEvent) => {
        console.log("👆 EPUB touch start detected");
        pressTimer = setTimeout(() => {
          console.log("👆 EPUB long press detected! Processing...");
          this.handleLongPress(event, section);
        }, 500);
      };

      const touchEndHandler = () => {
        if (pressTimer) {
          console.log("👆 Touch ended, clearing long press timer");
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      };

      // Add event listeners
      doc.addEventListener("click", clickHandler, { passive: false });
      doc.addEventListener("touchstart", touchStartHandler, { passive: true });
      doc.addEventListener("touchend", touchEndHandler, { passive: true });

      // Store references for cleanup
      (doc as any)._ttsClickHandler = clickHandler;
      (doc as any)._ttsTouchHandler = touchStartHandler;

      console.log(
        "✅ EPUB handlers attached to iframe for section:",
        section.href
      );

      // Test the document is accessible
      try {
        const testElement = doc.querySelector("body");
        console.log("🧪 Test body element found:", !!testElement);
      } catch (error) {
        console.error("❌ Error accessing iframe document:", error);
      }
    });

    console.log("🎯 EPUB rendered event listener attached");
  }

  private handleDoubleClick(event: MouseEvent, section: any): void {
    try {
      const target = event.target as Element;
      if (!target) return;

      // Find the nearest text element
      let textElement = target;
      while (textElement && textElement.nodeType !== Node.TEXT_NODE) {
        textElement = textElement.parentElement || textElement;
      }

      // Create range and get CFI
      const range = section.document.createRange();
      if (textElement.nodeType === Node.TEXT_NODE) {
        range.selectNode(textElement);
      } else {
        range.selectNodeContents(textElement);
      }

      const cfi = section.cfiFromRange(range);

      if (this.startHereCallback) {
        this.startHereCallback({
          type: "epub",
          sentenceId: "", // Will be determined by sentence indexer
          href: section.href,
          cfi: cfi,
        });
      }
    } catch (error) {
      console.warn("Failed to handle double click:", error);
    }
  }

  private handleLongPress(event: TouchEvent, section: any): void {
    // Similar to double click but for touch events
    const touch = event.touches[0];
    if (!touch) return;

    const element = section.document.elementFromPoint(
      touch.clientX,
      touch.clientY
    );
    if (!element) return;

    try {
      const range = section.document.createRange();
      range.selectNodeContents(element);
      const cfi = section.cfiFromRange(range);

      if (this.startHereCallback) {
        this.startHereCallback({
          type: "epub",
          sentenceId: "",
          href: section.href,
          cfi: cfi,
        });
      }
    } catch (error) {
      console.warn("Failed to handle long press:", error);
    }
  }

  // Method to get chapter content for sentence indexing
  async getChapterContent(href: string): Promise<{ html: string } | null> {
    try {
      const section = this.book.spine.get(href);
      if (!section) return null;

      await section.load(this.book.load.bind(this.book));
      const html = section.document.documentElement.outerHTML;

      return { html };
    } catch (error) {
      console.warn("Failed to get chapter content:", error);
      return null;
    }
  }

  // Method to compute CFI for sentence indexing
  computeCFIForSentence(href: string, charOffset: number): string {
    try {
      const section = this.book.spine.get(href);
      if (!section?.document) {
        return `epubcfi(/6/14[${href}]!/4/2/2[char-${charOffset}])`;
      }

      // This is a simplified approach - you might need more sophisticated CFI calculation
      // based on your specific EPUB structure
      const textNodes: Node[] = [];
      const walker = section.document.createTreeWalker(
        section.document.body,
        NodeFilter.SHOW_TEXT
      );

      let node;
      while ((node = walker.nextNode())) {
        textNodes.push(node);
      }

      let currentOffset = 0;
      for (const textNode of textNodes) {
        const text = textNode.textContent || "";
        if (currentOffset + text.length >= charOffset) {
          // Found the node containing our character offset
          const range = section.document.createRange();
          range.setStart(textNode, charOffset - currentOffset);
          range.setEnd(textNode, charOffset - currentOffset);

          return section.cfiFromRange(range);
        }
        currentOffset += text.length;
      }

      // Fallback
      return `epubcfi(/6/14[${href}]!/4/2/2[char-${charOffset}])`;
    } catch (error) {
      console.warn("Failed to compute CFI:", error);
      return `epubcfi(/6/14[${href}]!/4/2/2[char-${charOffset}])`;
    }
  }

  destroy(): void {
    this.clearHighlight();
    this.startHereCallback = null;
  }
}
