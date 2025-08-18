// PdfHighlighting.tsx - Fixed version with proper canvas-relative positioning
import React, { useEffect, useRef } from "react";
import { HighlightData, HighlightService } from "../../../types";

interface PdfHighlightingProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  highlights: HighlightData[];
  visible: boolean;
  scale: number;
  currentPage: number;
  onRegisterService: (service: HighlightService) => void;
}

// ---------- utils ----------
const SCALE_EPS = 0.001;

// ---------- Fixed PDF highlight service ----------
class SimplePdfHighlightService implements HighlightService {
  private container: HTMLElement;
  private currentScale: number;
  private activeHighlights: Map<
    string,
    { data: HighlightData; elements: HTMLElement[] }
  > = new Map();
  private visible = true;
  private isReady = false;
  private pendingRenderTimer: number | null = null;
  private debugMode = true; // Enable debug logging

  // cache of most recent selection
  private lastSelection: {
    text: string;
    page: number;
    rects: { x: number; y: number; width: number; height: number }[];
  } | null = null;

  // throttle timer for noisy selectionchange on iOS
  private selTimer: number | null = null;

  constructor(container: HTMLElement, scale: number = 1.0) {
    this.container = container;
    this.currentScale = scale;

    // Allow react-pdf to finish rendering before we start applying highlights
    window.setTimeout(() => {
      this.isReady = true;
      if (this.debugMode) console.log("[PDF Highlight] Service ready");
    }, 500);

    // Desktop mouse selection
    this.container.addEventListener("mouseup", this.cacheSelection);

    // Mobile: use both touchend and pointerup, and listen for selectionchange
    this.container.addEventListener("touchend", this.handleTouchEnd, {
      passive: true,
    });
    this.container.addEventListener("pointerup", this.handlePointerUp, {
      passive: true,
    });
    document.addEventListener("selectionchange", this.handleSelectionChange, {
      passive: true,
    });
  }

  destroy() {
    this.clearAllHighlights();

    this.container.removeEventListener("mouseup", this.cacheSelection);
    this.container.removeEventListener("touchend", this.handleTouchEnd);
    this.container.removeEventListener("pointerup", this.handlePointerUp);
    document.removeEventListener("selectionchange", this.handleSelectionChange);

    if (this.pendingRenderTimer !== null) {
      window.clearTimeout(this.pendingRenderTimer);
      this.pendingRenderTimer = null;
    }
    if (this.selTimer !== null) {
      window.clearTimeout(this.selTimer);
      this.selTimer = null;
    }
  }

  // --- event handlers ---

  private handleTouchEnd = () => {
    window.setTimeout(this.cacheSelection, 120);
  };

  private handlePointerUp = () => {
    window.setTimeout(this.cacheSelection, 80);
  };

  private handleSelectionChange = () => {
    if (this.selTimer !== null) window.clearTimeout(this.selTimer);
    this.selTimer = window.setTimeout(
      this.cacheSelection,
      60
    ) as unknown as number;
  };

  // --- FIXED selection capture with immediate highlight data creation ---
  private cacheSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      // DON'T clear lastSelection when selection is empty
      // Keep the last valid selection for when user clicks Add Note
      return;
    }

    const range = sel.getRangeAt(0);
    const selectedText = sel.toString().trim();
    if (!selectedText) {
      // DON'T clear lastSelection when selection is empty
      // Keep the last valid selection for when user clicks Add Note
      return;
    }

    // Find the page element containing the selection
    const anchorEl =
      range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? (range.commonAncestorContainer as any).parentElement
        : (range.commonAncestorContainer as Element | null);

    const pageEl = anchorEl?.closest(".react-pdf__Page") as HTMLElement | null;

    if (!pageEl) {
      // Only clear if we can't find the page (invalid selection)
      this.lastSelection = null;
      return;
    }

    const pageNumberAttr = pageEl.getAttribute("data-page-number") || "1";
    const pageNumber = parseInt(pageNumberAttr, 10) || 1;

    // CRITICAL FIX: Use the canvas element as positioning reference
    const canvas = pageEl.querySelector("canvas");
    if (!canvas) {
      if (this.debugMode)
        console.warn("[PDF Highlight] No canvas found in page");
      // Don't clear lastSelection - keep what we have
      return;
    }

    // Get the canvas position as our reference point
    const canvasRect = canvas.getBoundingClientRect();

    // Get selection rectangles
    let rectList = Array.from(range.getClientRects());

    // Fallback for iOS
    if (rectList.length === 0) {
      const b = range.getBoundingClientRect();
      if (b.width > 0 && b.height > 0) rectList = [b];
    }

    // Calculate positions relative to the canvas, not the page container
    const rects = rectList
      .map((r) => ({
        x: (r.left - canvasRect.left) / this.currentScale,
        y: (r.top - canvasRect.top) / this.currentScale,
        width: r.width / this.currentScale,
        height: r.height / this.currentScale,
      }))
      .filter((r) => r.width > 0 && r.height > 0);

    if (rects.length === 0) {
      // Don't clear lastSelection if we couldn't get rects
      return;
    }

    // Store the new selection (replaces the previous one)
    this.lastSelection = { text: selectedText, page: pageNumber, rects };

    if (this.debugMode) {
      console.log("[PDF Highlight] Selection captured and stored:", {
        page: pageNumber,
        text: selectedText.substring(0, 50),
        rects: rects.length,
        firstRect: rects[0],
      });
    }
  };

  // --- public API ---

  updateScale(newScale: number) {
    if (Math.abs(this.currentScale - newScale) < SCALE_EPS) return;
    this.currentScale = newScale;
    if (this.visible && this.isReady) this.reRenderAllHighlights();
  }

  private reRenderAllHighlights() {
    const toRender = Array.from(this.activeHighlights.values()).map(
      (h) => h.data
    );
    this.clearAllHighlightElements();
    toRender.forEach((h) => this.addHighlightElements(h));
  }

  async createHighlightFromSelection(): Promise<HighlightData | null> {
    if (!this.lastSelection) {
      if (this.debugMode) console.warn("[PDF Highlight] No selection cached");
      return null;
    }

    const id = `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const highlightData: HighlightData = {
      id,
      textContent: this.lastSelection.text,
      createdAt: new Date().toISOString(),
      pdf: {
        page: this.lastSelection.page,
        rects: this.lastSelection.rects,
        scale: this.currentScale,
      },
    };

    if (this.debugMode) {
      console.log("[PDF Highlight] Created highlight data:", highlightData);
    }

    // Don't clear the selection here - let it persist
    // User might want to create multiple notes from the same selection
    // It will be replaced when a new selection is made

    return highlightData;
  }

  // Add method to check if selection is available
  hasSelection(): boolean {
    return this.lastSelection !== null;
  }

  renderHighlights(highlights: HighlightData[]) {
    if (!this.isReady) {
      if (this.pendingRenderTimer !== null)
        window.clearTimeout(this.pendingRenderTimer);
      this.pendingRenderTimer = window.setTimeout(() => {
        this.pendingRenderTimer = null;
        this.renderHighlights(highlights);
      }, 200) as unknown as number;
      return;
    }

    if (this.debugMode) {
      console.log(`[PDF Highlight] Rendering ${highlights.length} highlights`);
      if (highlights.length > 0) {
        console.log("[PDF Highlight] First highlight:", highlights[0]);
      }
    }

    // Clear DOM elements first
    this.clearAllHighlightElements();

    // Track current highlights
    this.activeHighlights.clear();
    for (const h of highlights) {
      if (h.id && h.pdf) {
        this.activeHighlights.set(h.id, { data: h, elements: [] });
        if (this.debugMode) {
          console.log(
            `[PDF Highlight] Tracking highlight ${h.id} for page ${h.pdf.page}`
          );
        }
      }
    }

    // Render only if visible
    if (this.visible) {
      for (const { data } of this.activeHighlights.values()) {
        this.addHighlightElements(data);
      }
    }
  }

  // --- FIXED highlight rendering with proper positioning ---
  private addHighlightElements(highlight: HighlightData) {
    if (!highlight.pdf) return;

    // Find the specific page element
    const pageElement = this.container.querySelector(
      `.react-pdf__Page[data-page-number="${highlight.pdf.page}"]`
    ) as HTMLElement | null;

    if (!pageElement) {
      if (this.debugMode) {
        console.warn(`[PDF Highlight] Page ${highlight.pdf.page} not found`);
      }
      return;
    }

    // CRITICAL: Find the canvas to use as positioning reference
    const canvas = pageElement.querySelector(
      "canvas"
    ) as HTMLCanvasElement | null;
    if (!canvas) {
      if (this.debugMode) {
        console.warn(`[PDF Highlight] No canvas in page ${highlight.pdf.page}`);
      }
      return;
    }

    // Get or create highlight layer
    let highlightLayer = pageElement.querySelector(
      ".pdf-highlight-layer"
    ) as HTMLElement | null;

    if (!highlightLayer) {
      highlightLayer = document.createElement("div");
      highlightLayer.className = "pdf-highlight-layer";

      // Position the layer exactly over the canvas
      const canvasStyles = window.getComputedStyle(canvas);
      const canvasLeft = canvas.offsetLeft;
      const canvasTop = canvas.offsetTop;

      Object.assign(highlightLayer.style, {
        position: "absolute",
        left: `${canvasLeft}px`,
        top: `${canvasTop}px`,
        width: `${canvas.offsetWidth}px`,
        height: `${canvas.offsetHeight}px`,
        pointerEvents: "none",
        zIndex: "2", // Between canvas (1) and textLayer (3)
      });

      // Insert after canvas but before textLayer
      if (canvas.nextSibling) {
        pageElement.insertBefore(highlightLayer, canvas.nextSibling);
      } else {
        pageElement.appendChild(highlightLayer);
      }

      if (this.debugMode) {
        console.log("[PDF Highlight] Created highlight layer:", {
          page: highlight.pdf.page,
          left: canvasLeft,
          top: canvasTop,
          width: canvas.offsetWidth,
          height: canvas.offsetHeight,
        });
      }
    }

    // Ensure page element has relative positioning
    if (window.getComputedStyle(pageElement).position === "static") {
      pageElement.style.position = "relative";
    }

    const created: HTMLElement[] = [];

    // Create highlight rectangles
    for (const rect of highlight.pdf.rects) {
      const el = document.createElement("div");
      el.className = "pdf-highlight-rect";

      // Scale the stored positions to current scale
      const scaleFactor = this.currentScale / (highlight.pdf.scale || 1);

      Object.assign(el.style, {
        position: "absolute",
        left: `${rect.x * scaleFactor}px`,
        top: `${rect.y * scaleFactor}px`,
        width: `${rect.width * scaleFactor}px`,
        height: `${rect.height * scaleFactor}px`,
        backgroundColor: "rgba(255, 235, 59, 0.4)",
        mixBlendMode: "multiply",
        pointerEvents: "none",
      });

      el.setAttribute("data-highlight-id", highlight.id);
      el.setAttribute("title", highlight.textContent?.slice(0, 50) || "");

      highlightLayer.appendChild(el);
      created.push(el);
    }

    const track = this.activeHighlights.get(highlight.id);
    if (track) {
      track.elements = created;
    }

    if (this.debugMode && created.length > 0) {
      console.log(
        `[PDF Highlight] Added ${created.length} rects for highlight ${highlight.id}`
      );
    }
  }

  removeHighlight(highlightId: string) {
    const track = this.activeHighlights.get(highlightId);
    if (!track) return;

    for (const el of track.elements) {
      try {
        el.remove();
      } catch {}
    }

    this.activeHighlights.delete(highlightId);
  }

  private clearAllHighlightElements() {
    // Remove tracked elements
    for (const { elements } of this.activeHighlights.values()) {
      for (const el of elements) {
        try {
          el.remove();
        } catch {}
      }
    }

    // Clean up empty highlight layers
    const layers = this.container.querySelectorAll(".pdf-highlight-layer");
    layers.forEach((layer) => {
      if (layer.children.length === 0) {
        layer.remove();
      }
    });

    // Remove any orphaned highlights
    const orphans = this.container.querySelectorAll(".pdf-highlight-rect");
    orphans.forEach((el) => {
      try {
        el.remove();
      } catch {}
    });

    // Reset element arrays
    for (const item of this.activeHighlights.values()) {
      item.elements = [];
    }
  }

  clearAllHighlights() {
    this.clearAllHighlightElements();
    this.activeHighlights.clear();
  }

  setHighlightsVisible(visible: boolean) {
    if (this.visible === visible) return;
    this.visible = visible;

    if (visible) {
      // Re-add elements for current highlights
      for (const { data } of this.activeHighlights.values()) {
        this.addHighlightElements(data);
      }
    } else {
      this.clearAllHighlightElements();
    }
  }
}

// ---------- Component ----------
function PdfHighlighting({
  containerRef,
  highlights,
  visible,
  scale,
  currentPage,
  onRegisterService,
}: PdfHighlightingProps) {
  const serviceRef = useRef<SimplePdfHighlightService | null>(null);

  // Create service when container is present
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const svc = new SimplePdfHighlightService(el, scale);
    serviceRef.current = svc;
    onRegisterService(svc);

    return () => {
      serviceRef.current?.destroy();
      serviceRef.current = null;
    };
  }, [containerRef, onRegisterService]);

  // Scale changes
  useEffect(() => {
    const svc = serviceRef.current;
    if (!svc) return;
    svc.updateScale(scale);
  }, [scale]);

  // Render highlights whenever list or page changes
  useEffect(() => {
    const svc = serviceRef.current;
    if (!svc) return;
    svc.renderHighlights(highlights);
  }, [highlights, currentPage]);

  // Visibility changes
  useEffect(() => {
    const svc = serviceRef.current;
    if (!svc) return;
    svc.setHighlightsVisible(visible);
  }, [visible]);

  return null;
}

export { PdfHighlighting };
