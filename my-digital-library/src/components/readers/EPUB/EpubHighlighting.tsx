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
    this.attachSelectionListener();
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

  // Inside SimpleEpubHighlightService (EpubHighlighting.tsx)

  private addHighlight(highlight: HighlightData) {
    if (!highlight.epub?.cfiRange) return;
    try {
      this.rendition.annotations.add(
        "highlight",
        highlight.epub.cfiRange,
        /* data */ { id: highlight.id, text: highlight.textContent },
        /* cb */ (annotation: any) => {
          // Resolve the actual <g class="epub-highlight"> node
          const g: SVGGElement | null =
            (annotation && (annotation.mark || annotation.element)) || null;
          if (!g) return;

          // Metadata / tooltip
          g.setAttribute("data-highlight-id", highlight.id);
          g.setAttribute("title", highlight.textContent.substring(0, 50));

          const svg = g.ownerSVGElement;
          if (!svg) return;

          const doc = svg.ownerDocument;
          const svgNS = "http://www.w3.org/2000/svg";

          // Ensure <defs> exists
          let defs = svg.querySelector("defs");
          if (!defs) {
            defs = doc.createElementNS(svgNS, "defs");
            svg.insertBefore(defs, svg.firstChild);
          }

          // Create a unique linearGradient for this highlight
          const gradId = `epubhl-grad-${highlight.id}`;
          if (!svg.querySelector(`#${gradId}`)) {
            const grad = doc.createElementNS(svgNS, "linearGradient");
            grad.setAttribute("id", gradId);
            grad.setAttribute("x1", "0%");
            grad.setAttribute("y1", "0%");
            grad.setAttribute("x2", "100%");
            grad.setAttribute("y2", "100%");

            const stop1 = doc.createElementNS(svgNS, "stop");
            stop1.setAttribute("offset", "0%");
            stop1.setAttribute("stop-color", "rgba(251, 191, 36, 0.25)"); // #fbbf24@0.25

            const stop2 = doc.createElementNS(svgNS, "stop");
            stop2.setAttribute("offset", "100%");
            stop2.setAttribute("stop-color", "rgba(245, 158, 11, 0.25)"); // #f59e0b@0.25

            grad.appendChild(stop1);
            grad.appendChild(stop2);
            defs.appendChild(grad);
          }

          // Match PDF: subtle double drop-shadow + rounded corners + border + blend
          g.style.mixBlendMode = "multiply";
          g.style.filter =
            "drop-shadow(0 1px 3px rgba(245, 158, 11, 0.1)) drop-shadow(0 1px 2px rgba(245, 158, 11, 0.06))";

          // Apply to each rect in the group
          const rects = g.querySelectorAll("rect");
          rects.forEach((r) => {
            r.setAttribute("fill", `url(#${gradId})`);
            r.setAttribute("stroke", "rgba(245, 158, 11, 0.15)"); // border like PDF
            r.setAttribute("stroke-width", "1");
            r.setAttribute("rx", "3"); // border-radius
            r.setAttribute("ry", "3");
          });
        },
        /* className */ "epub-highlight",
        /* styles (fallback if gradient somehow fails) */ {
          fill: "rgba(245, 158, 11, 0.25)",
          "fill-opacity": "1",
          "mix-blend-mode": "multiply",
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
