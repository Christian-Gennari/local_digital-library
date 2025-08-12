// EpubHighlighting.tsx - Separate highlighting component
import { useEffect, useRef, useCallback } from "react";
import { HighlightData, HighlightService } from "../../../types";

interface EpubHighlightingProps {
  rendition: any;
  highlights: HighlightData[];
  visible: boolean;
  onRegisterService: (service: HighlightService) => void;
}

// Simple, focused highlight service
class SimpleEpubHighlightService implements HighlightService {
  private rendition: any;
  private activeHighlights: Map<string, HighlightData> = new Map();
  private visible: boolean = true;
  private lastSelection: {
    cfiRange: string;
    text: string;
    href: string;
  } | null = null;

  constructor(rendition: any) {
    this.rendition = rendition;
    this.setupStyles();
    this.attachSelectionListener();
  }

  private setupStyles() {
    if (!this.rendition) return;
    try {
      this.rendition.themes.default({
        ".epub-highlight": {
          "background-color": "rgba(255, 235, 59, 0.4) !important",
          "border-radius": "2px",
          border: "1px solid rgba(255, 235, 59, 0.7)",
          transition: "opacity 0.2s ease",
        },
      });
    } catch (error) {
      console.warn("Error setting up highlight styles:", error);
    }
  }

  private attachSelectionListener() {
    if (!this.rendition) return;
    this.rendition.on("selected", (cfiRange: string, contents: any) => {
      try {
        const text =
          contents?.window?.getSelection?.()?.toString().trim() || "";
        const href = contents?.section?.href || "";
        this.lastSelection = { cfiRange, text, href };
      } catch (err) {
        console.warn("Failed to cache EPUB selection:", err);
      }
    });
  }

  async createHighlightFromSelection(): Promise<HighlightData | null> {
    if (!this.lastSelection || !this.lastSelection.cfiRange) {
      console.warn("No selection available");
      return null;
    }

    const { cfiRange, text, href } = this.lastSelection;
    const id = `epub-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    return {
      id,
      textContent: text || "(highlight)",
      createdAt: new Date().toISOString(),
      epub: { cfiRange, href },
    };
  }

  renderHighlights(highlights: HighlightData[]) {
    if (!this.rendition) return;

    // Clear all existing annotations first
    this.clearAllHighlights();

    // Update our tracking
    this.activeHighlights.clear();
    highlights.forEach((h) => {
      if (h.id && h.epub?.cfiRange) {
        this.activeHighlights.set(h.id, h);
      }
    });

    // Only render if visible
    if (this.visible) {
      this.activeHighlights.forEach((highlight) => {
        this.addHighlight(highlight);
      });
    }
  }

  private addHighlight(highlight: HighlightData) {
    if (!highlight.epub?.cfiRange) return;
    try {
      this.rendition.annotations.add(
        "highlight",
        highlight.epub.cfiRange,
        {},
        null,
        "epub-highlight",
        {
          "data-highlight-id": highlight.id,
          title: highlight.textContent.substring(0, 50),
        }
      );
    } catch (e) {
      console.warn("Error adding highlight:", e);
    }
  }

  removeHighlight(highlightId: string) {
    const highlight = this.activeHighlights.get(highlightId);
    if (highlight?.epub?.cfiRange) {
      try {
        this.rendition.annotations.remove(highlight.epub.cfiRange, "highlight");
      } catch (e) {
        console.warn("Error removing highlight:", e);
      }
    }
    this.activeHighlights.delete(highlightId);
  }

  clearAllHighlights() {
    // Clear from epub.js
    this.activeHighlights.forEach((highlight) => {
      if (highlight.epub?.cfiRange) {
        try {
          this.rendition.annotations.remove(
            highlight.epub.cfiRange,
            "highlight"
          );
        } catch (e) {
          // Ignore errors
        }
      }
    });

    // Also clear any orphaned DOM elements
    try {
      const views = this.rendition?.views?.();
      views?.forEach?.((view: any) => {
        const doc = view?.document || view?.iframe?.contentDocument;
        const highlights = doc?.querySelectorAll?.(".epub-highlight") || [];
        highlights.forEach((el: Element) => {
          try {
            el.remove();
          } catch (e) {
            // Ignore
          }
        });
      });
    } catch (e) {
      // Ignore
    }
  }

  setHighlightsVisible(visible: boolean) {
    if (this.visible === visible) return;
    this.visible = visible;

    if (visible) {
      // Re-render all highlights
      this.activeHighlights.forEach((highlight) => {
        this.addHighlight(highlight);
      });
    } else {
      // Remove all highlights but keep tracking
      this.activeHighlights.forEach((highlight) => {
        if (highlight.epub?.cfiRange) {
          try {
            this.rendition.annotations.remove(
              highlight.epub.cfiRange,
              "highlight"
            );
          } catch (e) {
            // Ignore
          }
        }
      });
    }
  }
}

export function EpubHighlighting({
  rendition,
  highlights,
  visible,
  onRegisterService,
}: EpubHighlightingProps) {
  const serviceRef = useRef<SimpleEpubHighlightService | null>(null);

  // Initialize service when rendition is available
  useEffect(() => {
    if (!rendition || serviceRef.current) return;

    console.log("Creating EPUB highlight service");
    const service = new SimpleEpubHighlightService(rendition);
    serviceRef.current = service;
    onRegisterService(service);

    return () => {
      if (serviceRef.current) {
        console.log("Cleaning up EPUB highlight service");
        serviceRef.current.clearAllHighlights();
        serviceRef.current = null;
      }
    };
  }, [rendition, onRegisterService]);

  // Update highlights when they change
  useEffect(() => {
    if (serviceRef.current) {
      console.log(`Rendering ${highlights.length} highlights`);
      serviceRef.current.renderHighlights(highlights);
    }
  }, [highlights]);

  // Update visibility when it changes
  useEffect(() => {
    if (serviceRef.current) {
      console.log(`Setting highlights visible: ${visible}`);
      serviceRef.current.setHighlightsVisible(visible);
    }
  }, [visible]);

  // This component doesn't render anything - it's just for logic
  return null;
}
