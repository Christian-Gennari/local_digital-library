// PdfHighlighting.tsx - helper for rendering PDF highlights
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

// ---------- simple PDF highlight service ----------
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
  private lastSelection: {
    text: string;
    page: number;
    rects: { x: number; y: number; width: number; height: number }[];
  } | null = null;

  constructor(container: HTMLElement, scale: number = 1.0) {
    this.container = container;
    this.currentScale = scale;

    // Allow react-pdf to finish rendering before we start applying highlights
    window.setTimeout(() => {
      this.isReady = true;
    }, 300);

    // Cache the current text selection on mouseup so it can be turned into a
    // highlight even after the selection is lost (e.g. when clicking the notes
    // sidebar).
    this.container.addEventListener("mouseup", this.cacheSelection);
  }

  destroy() {
    this.clearAllHighlights();
    this.container.removeEventListener("mouseup", this.cacheSelection);
    if (this.pendingRenderTimer !== null) {
      window.clearTimeout(this.pendingRenderTimer);
      this.pendingRenderTimer = null;
    }
  }

  private cacheSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      this.lastSelection = null;
      return;
    }

    const range = selection.getRangeAt(0);
    const selectedText = selection.toString().trim();
    if (!selectedText) {
      this.lastSelection = null;
      return;
    }

    const pageEl =
      range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? (range.commonAncestorContainer as any).parentElement?.closest(
            "[data-page-number]"
          )
        : (range.commonAncestorContainer as Element).closest(
            "[data-page-number]"
          );
    if (!pageEl) {
      this.lastSelection = null;
      return;
    }

    const pageNumber = parseInt(
      pageEl.getAttribute("data-page-number") || "1",
      10
    );
    const pageRect = pageEl.getBoundingClientRect();
    const rects = Array.from(range.getClientRects())
      .map((r) => ({
        x: (r.left - pageRect.left) / this.currentScale,
        y: (r.top - pageRect.top) / this.currentScale,
        width: r.width / this.currentScale,
        height: r.height / this.currentScale,
      }))
      .filter((r) => r.width > 0 && r.height > 0);

    if (rects.length === 0) {
      this.lastSelection = null;
      return;
    }

    this.lastSelection = { text: selectedText, page: pageNumber, rects };
  };

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
    if (!this.lastSelection) return null;

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

    return highlightData;
  }

  renderHighlights(highlights: HighlightData[]) {
    // Debounce retries so multiple calls while not-ready don't pile up
    if (!this.isReady) {
      if (this.pendingRenderTimer !== null)
        window.clearTimeout(this.pendingRenderTimer);
      this.pendingRenderTimer = window.setTimeout(() => {
        this.pendingRenderTimer = null;
        this.renderHighlights(highlights);
      }, 200) as unknown as number;
      return;
    }

    // Clear DOM elements first
    this.clearAllHighlightElements();

    // Track current highlights
    this.activeHighlights.clear();
    for (const h of highlights) {
      if (h.id && h.pdf)
        this.activeHighlights.set(h.id, { data: h, elements: [] });
    }

    // Render only if visible
    if (this.visible) {
      for (const { data } of this.activeHighlights.values())
        this.addHighlightElements(data);
    }
  }

  private addHighlightElements(highlight: HighlightData) {
    if (!highlight.pdf) return;

    const pageElement = this.container.querySelector(
      `[data-page-number="${highlight.pdf.page}"]`
    ) as HTMLElement | null;

    if (!pageElement) {
      return;
    }

    // Ensure positioning
    const style = window.getComputedStyle(pageElement);
    if (style.position === "static") pageElement.style.position = "relative";

    const created: HTMLElement[] = [];

    for (const rect of highlight.pdf.rects) {
      const el = document.createElement("div");
      el.className = "pdf-highlight";
      Object.assign(el.style, {
        position: "absolute",
        left: `${rect.x * this.currentScale}px`,
        top: `${rect.y * this.currentScale}px`,
        width: `${rect.width * this.currentScale}px`,
        height: `${rect.height * this.currentScale}px`,
        backgroundColor: "rgba(255, 235, 59, 0.4)",
        border: "1px solid rgba(255, 235, 59, 0.7)",
        borderRadius: "2px",
        pointerEvents: "none",
        zIndex: "10",
        transition: "opacity 0.2s ease",
      } as Partial<CSSStyleDeclaration>);
      el.setAttribute("data-highlight-id", highlight.id);
      el.setAttribute(
        "title",
        `Highlight: ${highlight.textContent?.slice(0, 50) ?? ""}`
      );
      pageElement.appendChild(el);
      created.push(el);
    }

    const track = this.activeHighlights.get(highlight.id);
    if (track) track.elements = created;
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
    // Remove elements we know about
    for (const { elements } of this.activeHighlights.values()) {
      for (const el of elements) {
        try {
          el.remove();
        } catch {}
      }
    }
    // Sweep any orphans
    const orphans = this.container.querySelectorAll(".pdf-highlight");
    orphans.forEach((el) => {
      try {
        el.remove();
      } catch {}
    });

    // Reset element arrays
    for (const item of this.activeHighlights.values()) item.elements = [];
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
      for (const { data } of this.activeHighlights.values())
        this.addHighlightElements(data);
    } else {
      this.clearAllHighlightElements();
    }
  }
}

// ---------- component ----------
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
