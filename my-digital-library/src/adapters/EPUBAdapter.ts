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
    console.log("🚀 goToLocator called with:", {
      cfi: locator.cfi,
      href: locator.href,
      hasCFI: !!locator.cfi,
      hasHref: !!locator.href,
    });

    try {
      // Check current location first
      const currentLocation = this.rendition.currentLocation();
      const currentCFI = currentLocation?.start?.cfi;
      const currentHref = currentLocation?.start?.href;

      console.log("📍 Current position:", { currentCFI, currentHref });

      // If we have a CFI and we're already at that exact position, don't navigate
      if (locator.cfi && currentCFI === locator.cfi) {
        console.log(
          "✅ Already at the correct CFI position, skipping navigation"
        );
        return;
      }

      // If we only have href and we're already in that chapter, don't navigate
      if (!locator.cfi && locator.href && currentHref === locator.href) {
        console.log(
          "✅ Already in the correct chapter and no specific CFI provided, skipping navigation"
        );
        return;
      }

      // Set a flag to indicate this is TTS navigation (not user navigation)
      // This prevents the relocated event from saving progress
      (this.rendition as any).ttsNavigating = true;

      // Navigate to the position
      if (locator.cfi && locator.cfi.length > 0) {
        console.log("📍 Navigating to specific CFI position:", locator.cfi);
        await this.rendition.display(locator.cfi);
      } else if (locator.href) {
        console.log(
          "📍 WARNING: No CFI, navigating to chapter start:",
          locator.href
        );
        await this.rendition.display(locator.href);
      } else {
        console.log("❌ No CFI or href to navigate to!");
      }

      // Clear the flag after a short delay to ensure the relocated event has fired
      setTimeout(() => {
        (this.rendition as any).ttsNavigating = false;
      }, 100);
    } catch (error) {
      console.warn("Failed to navigate to locator:", error);
      // Make sure to clear the flag on error too
      (this.rendition as any).ttsNavigating = false;
    }

    try {
      // Check current location first
      const currentLocation = this.rendition.currentLocation();
      const currentCFI = currentLocation?.start?.cfi;
      const currentHref = currentLocation?.start?.href;

      console.log("📍 Current position:", { currentCFI, currentHref });

      // If we have a CFI and we're already at that exact position, don't navigate
      if (locator.cfi && currentCFI === locator.cfi) {
        console.log(
          "✅ Already at the correct CFI position, skipping navigation"
        );
        return;
      }

      // If we only have href and we're already in that chapter, don't navigate
      // (This prevents jumping to chapter start when clicking within the same chapter)
      if (!locator.cfi && locator.href && currentHref === locator.href) {
        console.log(
          "✅ Already in the correct chapter and no specific CFI provided, skipping navigation"
        );
        return;
      }

      // Navigate to the position
      if (locator.cfi && locator.cfi.length > 0) {
        console.log("📍 Navigating to specific CFI position:", locator.cfi);
        await this.rendition.display(locator.cfi);
      } else if (locator.href) {
        console.log(
          "📍 WARNING: No CFI, navigating to chapter start:",
          locator.href
        );
        await this.rendition.display(locator.href);
      } else {
        console.log("❌ No CFI or href to navigate to!");
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

    const attachHandlersToDoc = (doc: Document, view: any) => {
      let lastTap = 0;
      let pressTimer: NodeJS.Timeout | null = null;

      // Remove existing handlers to avoid duplicates
      const existingClickHandler = (doc as any)._ttsClickHandler;
      if (existingClickHandler) {
        doc.removeEventListener("click", existingClickHandler);
      }

      const clickHandler = (event: MouseEvent) => {
        const now = Date.now();
        const timeDelta = now - lastTap;

        if (timeDelta < 300 && timeDelta > 0) {
          console.log("🎯 EPUB double-click detected!");
          event.preventDefault();
          event.stopPropagation();
          this.handleDoubleClick(event, view); // Pass the view object
        }

        lastTap = now;
      };

      const touchStartHandler = (event: TouchEvent) => {
        pressTimer = setTimeout(() => {
          console.log("👆 EPUB long press detected!");
          this.handleLongPress(event, view); // Pass the view object
        }, 500);
      };

      const touchEndHandler = () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      };

      doc.addEventListener("click", clickHandler, true);
      doc.addEventListener("touchstart", touchStartHandler, { passive: true });
      doc.addEventListener("touchend", touchEndHandler, { passive: true });

      (doc as any)._ttsClickHandler = clickHandler;
      (doc as any)._ttsTouchHandler = touchStartHandler;
      (doc as any)._ttsTouchEndHandler = touchEndHandler;
    };

    // Handle already rendered views
    try {
      const views = this.rendition.views();
      if (views && views.length > 0) {
        console.log(`📖 Found ${views.length} already rendered views`);

        views.forEach((view: any, index: number) => {
          const doc = view?.contents?.document || view?.document;
          if (doc) {
            attachHandlersToDoc(doc, view);
            console.log(`✅ Handlers attached to existing view ${index}`);
          }
        });
      }
    } catch (e) {
      console.log("Could not check existing views:", e);
    }

    // Listen for future page changes
    this.rendition.on("rendered", (section: any, view: any) => {
      console.log("📖 New EPUB section rendered");
      const doc =
        section?.document || view?.contents?.document || view?.document;
      if (doc) {
        attachHandlersToDoc(doc, view); // Pass view, not section
      }
    });

    console.log("🎯 EPUB start-here handler setup complete");
  }

  // Step 1: Update handleDoubleClick in EPUBAdapter.ts to include clicked text:
  private handleDoubleClick(event: MouseEvent, view: any): void {
    try {
      const target = event.target as Element;
      if (!target) {
        console.warn("No target element");
        return;
      }

      const clickedText = target.textContent?.substring(0, 100) || "";
      console.log(
        "🎯 Click target:",
        target.tagName,
        clickedText.substring(0, 50)
      );

      // Get the contents object which has CFI methods
      const contents = view?.contents || view;
      if (!contents) {
        console.warn("No contents object available");
        return;
      }

      // Create a range at the click position
      const doc = contents.document || contents.content;
      const range = doc.createRange();

      // Try to get the exact text node that was clicked
      if (target.nodeType === Node.TEXT_NODE) {
        range.selectNode(target);
      } else if (target.firstChild?.nodeType === Node.TEXT_NODE) {
        range.selectNode(target.firstChild);
      } else {
        // Find the first text node within the clicked element
        const walker = doc.createTreeWalker(
          target,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );
        const textNode = walker.nextNode();
        if (textNode) {
          range.selectNode(textNode);
        } else {
          range.selectNodeContents(target);
        }
      }

      // Generate CFI using epub.js's built-in method
      let cfi = "";
      try {
        cfi = contents.cfiFromRange(range);
        console.log("📍 Generated CFI from click:", cfi);
      } catch (e) {
        console.warn("Failed to generate CFI:", e);
      }

      // Get the href for this section
      const href = view?.section?.href || contents.section?.href || "";

      if (this.startHereCallback) {
        const locator: any = {
          type: "epub" as const,
          sentenceId: "",
          href: href,
          cfi: cfi,
          // Add the clicked text to help find the right sentence
          clickedText: clickedText.trim(),
        };

        console.log("📍 Sending locator with clicked text:", {
          ...locator,
          clickedText: locator.clickedText.substring(0, 50) + "...",
        });
        this.startHereCallback(locator);
      }
    } catch (error) {
      console.warn("Failed to handle double click:", error);
    }
  }

  private handleLongPress(event: TouchEvent, view: any): void {
    try {
      const touch = event.touches[0];
      if (!touch) return;

      // Get the contents object which has CFI methods
      const contents = view?.contents || view;
      if (!contents) {
        console.warn("No contents object available");
        return;
      }

      const doc = contents.document || contents.content;

      // Get the element at touch position
      const element = doc.elementFromPoint(touch.clientX, touch.clientY);
      if (!element) {
        console.warn("No element at touch position");
        return;
      }

      console.log(
        "👆 Touch target:",
        element.tagName,
        element.textContent?.substring(0, 50)
      );

      // Create range from the touched element
      const range = doc.createRange();

      // Try to get the text node
      if (element.nodeType === Node.TEXT_NODE) {
        range.selectNode(element);
      } else if (element.firstChild?.nodeType === Node.TEXT_NODE) {
        range.selectNode(element.firstChild);
      } else {
        // Find the first text node within
        const walker = doc.createTreeWalker(
          element,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );
        const textNode = walker.nextNode();
        if (textNode) {
          range.selectNode(textNode);
        } else {
          range.selectNodeContents(element);
        }
      }

      // Generate CFI using epub.js's built-in method
      let cfi = "";
      try {
        cfi = contents.cfiFromRange(range);
        console.log("📍 Generated CFI from touch:", cfi);
      } catch (e) {
        console.warn("Failed to generate CFI:", e);
      }

      // Get the href for this section
      const href = view?.section?.href || contents.section?.href || "";

      if (this.startHereCallback) {
        const locator = {
          type: "epub" as const,
          sentenceId: "",
          href: href,
          cfi: cfi,
        };

        console.log("📍 Sending touch locator with CFI:", locator);
        this.startHereCallback(locator);
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

  // Add this method to your EPUBAdapter class:

  async isLocationVisible(cfi: string): Promise<boolean> {
    try {
      // Get the current view's range
      const currentLocation = this.rendition.currentLocation();
      if (!currentLocation) return false;

      // epub.js provides start and end CFIs for what's visible
      const startCFI = currentLocation.start.cfi;
      const endCFI = currentLocation.end.cfi;

      // Use epub.js's built-in CFI comparison
      const epubcfi = (window as any).ePub?.CFI || this.book.locations.epubcfi;

      if (epubcfi) {
        // Proper CFI comparison using epub.js
        const compareStart = epubcfi.compare(cfi, startCFI);
        const compareEnd = epubcfi.compare(cfi, endCFI);

        // CFI is visible if it's between start and end
        const isVisible = compareStart >= 0 && compareEnd <= 0;

        console.log(
          `📍 CFI visibility check: ${isVisible ? "visible" : "not visible"}`
        );
        return isVisible;
      }

      // Fallback: simple string comparison (not accurate but better than nothing)
      return cfi >= startCFI && cfi <= endCFI;
    } catch (error) {
      console.warn("Error checking visibility:", error);
      // If we can't determine visibility, assume we need to navigate
      return false;
    }
  }
}
