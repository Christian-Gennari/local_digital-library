// src/services/PDFSearchService.ts
import type { RefObject } from "react";
import type {
  PDFDocumentProxy,
  TextContent,
  TextItem,
} from "pdfjs-dist/types/src/display/api";

export interface PDFSearchMatch {
  text: string;
  pageNumber: number; // 1-based
  pageIndex: number; // 0-based
  excerpt: string;
  matchIndex: number; // global index across doc (filled after search)
  charIndex: number; // index in reconstructed page text
  length: number;
  // mapping used for fallback when DOM mapping fails
  itemSpan: {
    startItem: number;
    endItem: number;
    startOffset: number;
    endOffset: number;
  };
  // NEW: the N-th match within this page (for robust DOM mapping)
  occurrenceInPage: number;
}

type ItemMapping = {
  itemIndex: number; // index in original TextContent.items
  startInFull: number; // start char pos in fullText
  lengthInFull: number; // contributed length
  startInItem: number; // start offset in item.str (usually 0)
  usedChars: number; // number of chars used from item.str
};

export class PDFSearchService {
  // ---- Search state ----
  private matches: PDFSearchMatch[] = [];
  private currentMatchIndex = 0;
  private currentQuery = "";

  // ---- External handles ----
  private pdfDocument: PDFDocumentProxy | null = null;
  private containerRef: RefObject<HTMLDivElement | null>;
  private onPageChange?: (page: number) => void;

  // ---- Caching ----
  private pageTextContentCache = new Map<number, TextContent>();
  private isFullyCached = false;
  private cachingProgress = 0;
  private onCachingProgress?: (progress: number) => void;
  private onCachingComplete?: () => void;

  // ---- Highlight overlays we add (per navigation) ----
  private overlayEls: HTMLElement[] = [];

  constructor(
    pdfDocument: PDFDocumentProxy | null,
    containerRef: RefObject<HTMLDivElement | null>,
    onPageChange?: (page: number) => void,
    onCachingProgress?: (progress: number) => void,
    onCachingComplete?: () => void
  ) {
    this.pdfDocument = pdfDocument;
    this.containerRef = containerRef;
    this.onPageChange = onPageChange;
    this.onCachingProgress = onCachingProgress;
    this.onCachingComplete = onCachingComplete;
  }

  // ----------------------
  // Public API
  // ----------------------

  async search(query: string): Promise<PDFSearchMatch[]> {
    if (!this.pdfDocument) return [];
    if (!query || query.trim().length < 2) {
      this.clear();
      return [];
    }

    this.currentQuery = query;
    this.clearHighlights();
    this.matches = [];

    const numPages = this.pdfDocument.numPages;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const pageMatches = await this.searchInPage(pageNum, query);
      this.matches.push(...pageMatches);
    }

    this.matches.forEach((m, i) => (m.matchIndex = i));
    this.currentMatchIndex = 0;

    if (this.matches.length > 0) {
      await this.navigateToMatch(0);
    }

    return this.matches;
  }

  async navigateToMatch(index: number): Promise<void> {
    if (!this.matches.length || !this.pdfDocument) return;
    if (index < 0 || index >= this.matches.length) return;

    this.currentMatchIndex = index;
    const match = this.matches[index];

    // navigate page
    this.onPageChange?.(match.pageNumber);
    await this.scrollPageIntoView(match.pageNumber);

    // re-rendered text layer needs a beat
    await new Promise((r) => setTimeout(r, 30));

    // clear any previous overlays
    this.clearHighlights();

    // try DOM-accurate range based on the N-th occurrence on this page
    const range = this.findDomRangeForOccurrence(
      match.pageNumber,
      this.currentQuery,
      match.occurrenceInPage
    );

    if (range) {
      this.drawRangeOverlays(match.pageNumber, range);
      this.scrollRangeIntoView(range);
      return;
    }

    // Fallback: approximate span-based overlay
    this.applySpanFallback(match);
  }

  next(): void {
    if (!this.matches.length) return;
    void this.navigateToMatch(
      (this.currentMatchIndex + 1) % this.matches.length
    );
  }

  previous(): void {
    if (!this.matches.length) return;
    const i =
      (this.currentMatchIndex - 1 + this.matches.length) % this.matches.length;
    void this.navigateToMatch(i);
  }

  getCurrentMatch(): number {
    return this.matches.length ? this.currentMatchIndex + 1 : 0;
  }

  getTotalMatches(): number {
    return this.matches.length;
  }

  updatePdfDocument(pdfDocument: PDFDocumentProxy | null): void {
    this.pdfDocument = pdfDocument;
    this.clear(true);
    this.isFullyCached = false;
    this.cachingProgress = 0;
  }

  updateContainerRef(ref: RefObject<HTMLDivElement | null>): void {
    this.containerRef = ref;
  }

  destroy(): void {
    this.clear(true);
    this.pdfDocument = null;
    this.onPageChange = undefined;
    this.onCachingProgress = undefined;
    this.onCachingComplete = undefined;
  }

  clear(clearCache = false): void {
    this.clearHighlights();
    this.matches = [];
    this.currentMatchIndex = 0;
    this.currentQuery = "";
    if (clearCache) {
      this.pageTextContentCache.clear();
      this.isFullyCached = false;
      this.cachingProgress = 0;
    }
  }

  // ----------------------
  // Caching
  // ----------------------

  async cacheAllPages(): Promise<void> {
    if (!this.pdfDocument) return;
    if (this.isFullyCached) return;

    const numPages = this.pdfDocument.numPages;
    this.cachingProgress = 0;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      if (!this.pageTextContentCache.has(pageNum)) {
        try {
          const page = await this.pdfDocument.getPage(pageNum);
          const tc = await page.getTextContent();
          this.pageTextContentCache.set(pageNum, tc);
        } catch (err) {
          console.warn(`Failed to cache page ${pageNum}:`, err);
        }
      }
      this.cachingProgress = Math.round((pageNum / numPages) * 100);
      this.onCachingProgress?.(this.cachingProgress);
    }

    this.isFullyCached = true;
    this.onCachingComplete?.();
  }

  isCached(): boolean {
    return this.isFullyCached;
  }

  getCachingProgress(): number {
    return this.cachingProgress;
  }

  // ----------------------
  // Page search
  // ----------------------

  private async searchInPage(
    pageNumber: number,
    query: string
  ): Promise<PDFSearchMatch[]> {
    if (!this.pdfDocument) return [];

    let textContent = this.pageTextContentCache.get(pageNumber);
    if (!textContent) {
      try {
        const page = await this.pdfDocument.getPage(pageNumber);
        textContent = await page.getTextContent();
        this.pageTextContentCache.set(pageNumber, textContent);
      } catch (e) {
        console.warn(`Failed to get text for page ${pageNumber}:`, e);
        return [];
      }
    }

    const items = textContent.items.filter(
      (it): it is TextItem => (it as any).str !== undefined
    ) as TextItem[];

    const { fullText, mappings } = this.buildSearchableText(items);

    const qLower = query.toLowerCase();
    const textLower = fullText.toLowerCase();

    const pageIndex = pageNumber - 1;
    const matches: PDFSearchMatch[] = [];

    let idx = 0;
    let occurrenceInPage = 0;
    const MAX_MATCHES_PER_PAGE = 1000;

    while (idx < textLower.length) {
      const found = textLower.indexOf(qLower, idx);
      if (found === -1) break;

      const span = this.mapCharWindowToItems(found, query.length, mappings);
      const excerpt = this.makeExcerpt(fullText, found, query.length);

      matches.push({
        text: query,
        pageNumber,
        pageIndex,
        excerpt,
        matchIndex: -1,
        charIndex: found,
        length: query.length,
        itemSpan: span,
        occurrenceInPage,
      });

      occurrenceInPage++;
      if (matches.length >= MAX_MATCHES_PER_PAGE) break;
      idx = found + query.length;
    }

    return matches;
  }

  // ----------------------
  // Text reconstruction (counts)
  // ----------------------

  /**
   * Build a page string close to what the user *reads*:
   * - sort items visually
   * - add a **space** between lines (not a newline) to avoid losing cross-line matches
   * - add a space between items if there is a visible gap
   */
  private buildSearchableText(items: TextItem[]): {
    fullText: string;
    mappings: ItemMapping[];
  } {
    if (!items.length) return { fullText: "", mappings: [] };

    const sorted = [...items].sort((a, b) => {
      const ya = (a.transform as any)[5] as number;
      const yb = (b.transform as any)[5] as number;
      if (Math.abs(yb - ya) > 2) return yb - ya; // top->bottom
      const xa = (a.transform as any)[4] as number;
      const xb = (b.transform as any)[4] as number;
      return xa - xb; // left->right
    });

    // bucket by y with tolerance
    const lines: number[][] = [];
    const ys: number[] = [];
    const Y_TOL = 2.5;
    sorted.forEach((it, i) => {
      const y = (it.transform as any)[5] as number;
      let lineIdx = -1;
      for (let li = 0; li < ys.length; li++) {
        if (Math.abs(ys[li] - y) <= Y_TOL) {
          lineIdx = li;
          break;
        }
      }
      if (lineIdx === -1) {
        ys.push(y);
        lines.push([i]);
      } else {
        lines[lineIdx].push(i);
      }
    });

    let fullText = "";
    const mappings: ItemMapping[] = [];
    const GAP_FACTOR = 0.45;

    for (let li = 0; li < lines.length; li++) {
      const indices = lines[li].sort((ia, ib) => {
        const xa = (sorted[ia].transform as any)[4] as number;
        const xb = (sorted[ib].transform as any)[4] as number;
        return xa - xb;
      });

      for (let k = 0; k < indices.length; k++) {
        const item = sorted[indices[k]];
        const prev = k > 0 ? sorted[indices[k - 1]] : null;

        const x = (item.transform as any)[4] as number;
        const px = prev ? ((prev.transform as any)[4] as number) : x;
        const avgCharWidth = this.approximateCharWidth(prev);
        const gap = x - px;

        if (prev && avgCharWidth > 0 && gap > avgCharWidth * GAP_FACTOR) {
          fullText += " ";
          mappings.push({
            itemIndex: -1,
            startInFull: fullText.length - 1,
            lengthInFull: 1,
            startInItem: 0,
            usedChars: 0,
          });
        }

        const clean = (item.str || "").replace(/\s+/g, " ");
        const startInFull = fullText.length;
        fullText += clean;

        const originalIndex = items.indexOf(item);
        mappings.push({
          itemIndex: originalIndex,
          startInFull,
          lengthInFull: clean.length,
          startInItem: 0,
          usedChars: clean.length,
        });
      }

      // **space** between lines to allow cross-line matches
      fullText += " ";
      mappings.push({
        itemIndex: -1,
        startInFull: fullText.length - 1,
        lengthInFull: 1,
        startInItem: 0,
        usedChars: 0,
      });
    }

    return { fullText, mappings };
  }

  private approximateCharWidth(item: TextItem | null): number {
    if (!item) return 0;
    const scaleX = (item.transform as any)[0] as number;
    const skewX = (item.transform as any)[1] as number;
    const fontSize = Math.hypot(scaleX, skewX);
    return Math.max(0, fontSize * 0.5);
  }

  private mapCharWindowToItems(
    start: number,
    length: number,
    mappings: ItemMapping[]
  ): {
    startItem: number;
    endItem: number;
    startOffset: number;
    endOffset: number;
  } {
    const end = start + length;

    let startMapIdx = -1;
    for (let i = 0; i < mappings.length; i++) {
      const m = mappings[i];
      if (m.itemIndex < 0 || m.lengthInFull === 0) continue;
      if (start >= m.startInFull && start < m.startInFull + m.lengthInFull) {
        startMapIdx = i;
        break;
      }
    }

    let endMapIdx = -1;
    for (let i = mappings.length - 1; i >= 0; i--) {
      const m = mappings[i];
      if (m.itemIndex < 0 || m.lengthInFull === 0) continue;
      if (
        end - 1 >= m.startInFull &&
        end - 1 < m.startInFull + m.lengthInFull
      ) {
        endMapIdx = i;
        break;
      }
    }

    if (startMapIdx === -1 || endMapIdx === -1) {
      return { startItem: -1, endItem: -1, startOffset: 0, endOffset: 0 };
    }

    const mStart = mappings[startMapIdx];
    const mEnd = mappings[endMapIdx];

    const startOffset = start - mStart.startInFull + mStart.startInItem;
    const endOffset = end - 1 - mEnd.startInFull + 1 + mEnd.startInItem;

    return {
      startItem: mStart.itemIndex,
      endItem: mEnd.itemIndex,
      startOffset: Math.max(0, startOffset),
      endOffset: Math.max(0, endOffset),
    };
  }

  // ----------------------
  // DOM-accurate highlighting
  // ----------------------

  /** Find the DOM Range for the N-th occurrence of `query` on a page. */
  private findDomRangeForOccurrence(
    pageNumber: number,
    query: string,
    occurrenceInPage: number
  ): Range | null {
    const textLayer = this.getTextLayer(pageNumber);
    if (!textLayer) return null;

    // Collect spans and order them visually (top→bottom, then left→right).
    const spans = Array.from(
      textLayer.querySelectorAll("span")
    ) as HTMLSpanElement[];
    if (!spans.length) return null;

    type SpanInfo = {
      el: HTMLSpanElement;
      top: number;
      left: number;
      text: string;
    };
    const infos: SpanInfo[] = spans.map((el) => {
      const rect = el.getBoundingClientRect();
      return { el, top: rect.top, left: rect.left, text: el.textContent ?? "" };
    });

    const Y_TOL = 2; // px tolerance to consider "same line"
    const X_GAP_FACTOR = 0.45; // big intra-line gap → insert space

    infos.sort((a, b) => {
      if (Math.abs(a.top - b.top) > Y_TOL) return a.top - b.top; // top→bottom
      return a.left - b.left; // left→right
    });

    // Build DOM-visible text with synthetic spaces at line breaks and big gaps.
    type Atom =
      | { type: "text"; spanIndex: number; startInSpan: number; length: number }
      | { type: "space" };

    const atoms: Atom[] = [];
    const domPieces: string[] = [];

    let prevTop = Number.NaN;
    let prevRight = Number.NaN;

    for (let i = 0; i < infos.length; i++) {
      const s = infos[i];
      const text = s.text;
      if (!text) continue;

      const rect = s.el.getBoundingClientRect();
      const isNewLine = isNaN(prevTop) || Math.abs(s.top - prevTop) > Y_TOL;

      if (isNewLine) {
        // Insert a space between visual lines to keep cross-line queries intact (e.g., "my⏎parents").
        if (domPieces.length > 0 && domPieces[domPieces.length - 1] !== " ") {
          domPieces.push(" ");
          atoms.push({ type: "space" });
        }
      } else {
        // Same line: if there's a big horizontal gap, synthesize a space.
        const gap = s.left - prevRight;
        const approxCharWidth = rect.width / Math.max(1, text.length);
        if (gap > approxCharWidth * (1 + X_GAP_FACTOR)) {
          domPieces.push(" ");
          atoms.push({ type: "space" });
        }
      }

      domPieces.push(text);
      atoms.push({
        type: "text",
        spanIndex: i,
        startInSpan: 0,
        length: text.length,
      });

      prevTop = s.top;
      prevRight = rect.right;
    }

    const domText = domPieces.join("");
    const qLower = query.toLowerCase();
    const domLower = domText.toLowerCase();

    // Find N-th occurrence in synthesized DOM text.
    let foundIdx = -1;
    let seen = 0;
    let pos = 0;
    while (pos < domLower.length) {
      const j = domLower.indexOf(qLower, pos);
      if (j === -1) break;
      if (seen === occurrenceInPage) {
        foundIdx = j;
        break;
      }
      seen++;
      pos = j + qLower.length;
    }
    if (foundIdx === -1) return null;

    const start = foundIdx;
    const end = foundIdx + query.length;

    // Directional locators so we never anchor the range on a synthetic space.
    const locateStart = (
      charPos: number
    ): { node: Text; offset: number } | null => {
      let cursor = 0;
      for (let a = 0; a < atoms.length; a++) {
        const atom = atoms[a];
        if (atom.type === "space") {
          if (charPos === cursor) {
            // START on synthetic space → snap FORWARD to next real glyph.
            for (let b = a + 1; b < atoms.length; b++) {
              const nxt = atoms[b];
              if (nxt.type === "text" && nxt.length > 0) {
                const spanNode = infos[nxt.spanIndex].el.firstChild;
                if (spanNode && spanNode.nodeType === Node.TEXT_NODE) {
                  return { node: spanNode as Text, offset: 0 };
                }
              }
            }
            // Fallback: snap to end of previous text atom.
            for (let b = a - 1; b >= 0; b--) {
              const prv = atoms[b];
              if (prv.type === "text" && prv.length > 0) {
                const spanNode = infos[prv.spanIndex].el.firstChild;
                if (spanNode && spanNode.nodeType === Node.TEXT_NODE) {
                  const tn = spanNode as Text;
                  return { node: tn, offset: tn.data.length };
                }
              }
            }
            return null;
          }
          cursor += 1;
          continue;
        }
        const startInDom = cursor;
        const endInDom = cursor + atom.length;
        if (charPos >= startInDom && charPos < endInDom) {
          const span = infos[atom.spanIndex].el;
          const tn = span.firstChild as Text | null;
          if (!tn || tn.nodeType !== Node.TEXT_NODE) return null;
          const offsetInSpan = atom.startInSpan + (charPos - startInDom);
          return { node: tn, offset: offsetInSpan };
        }
        cursor = endInDom;
      }
      return null;
    };

    const locateEnd = (
      charPos: number
    ): { node: Text; offset: number } | null => {
      let cursor = 0;
      for (let a = 0; a < atoms.length; a++) {
        const atom = atoms[a];
        if (atom.type === "space") {
          if (charPos === cursor) {
            // END on synthetic space → snap BACKWARD to previous real glyph.
            for (let b = a - 1; b >= 0; b--) {
              const prv = atoms[b];
              if (prv.type === "text" && prv.length > 0) {
                const spanNode = infos[prv.spanIndex].el.firstChild;
                if (spanNode && spanNode.nodeType === Node.TEXT_NODE) {
                  const tn = spanNode as Text;
                  return { node: tn, offset: Math.max(0, tn.data.length - 1) };
                }
              }
            }
            // Fallback: snap to start of next text atom.
            for (let b = a + 1; b < atoms.length; b++) {
              const nxt = atoms[b];
              if (nxt.type === "text" && nxt.length > 0) {
                const spanNode = infos[nxt.spanIndex].el.firstChild;
                if (spanNode && spanNode.nodeType === Node.TEXT_NODE) {
                  return { node: spanNode as Text, offset: 0 };
                }
              }
            }
            return null;
          }
          cursor += 1;
          continue;
        }
        const startInDom = cursor;
        const endInDom = cursor + atom.length;
        if (charPos >= startInDom && charPos < endInDom) {
          const span = infos[atom.spanIndex].el;
          const tn = span.firstChild as Text | null;
          if (!tn || tn.nodeType !== Node.TEXT_NODE) return null;
          const offsetInSpan = atom.startInSpan + (charPos - startInDom);
          return { node: tn, offset: offsetInSpan };
        }
        cursor = endInDom;
      }
      return null;
    };

    const startLoc = locateStart(start);
    const endLoc = locateEnd(end - 1);
    if (!startLoc || !endLoc) return null;

    const range = document.createRange();
    range.setStart(startLoc.node, startLoc.offset);
    range.setEnd(endLoc.node, endLoc.offset + 1);
    return range;
  }

  private drawRangeOverlays(pageNumber: number, range: Range): void {
    const pageRoot = this.getPageRoot(pageNumber);
    if (!pageRoot) return;

    const pageRect = pageRoot.getBoundingClientRect();
    const rects = Array.from(range.getClientRects());

    // Tolerances to drop phantom boxes
    const MIN_W = 1.5; // px
    const MIN_H = 1.5; // px
    const AREA_MIN = 3.0; // px^2
    const PAD = 1.0; // px tolerance for containment

    for (const r of rects) {
      const w = r.width;
      const h = r.height;
      const area = w * h;

      // Skip zero/tiny rects (the source of the artifact)
      if (w < MIN_W || h < MIN_H || area < AREA_MIN) continue;

      // Skip rects that are clearly outside the pageRoot (extra safety)
      const insideHoriz =
        r.left >= pageRect.left - PAD && r.right <= pageRect.right + PAD;
      const insideVert =
        r.top >= pageRect.top - PAD && r.bottom <= pageRect.bottom + PAD;
      if (!(insideHoriz && insideVert)) continue;

      const box = document.createElement("div");
      box.style.position = "absolute";
      box.style.left = `${r.left - pageRect.left}px`;
      box.style.top = `${r.top - pageRect.top}px`;
      box.style.width = `${w}px`;
      box.style.height = `${h}px`;
      box.style.pointerEvents = "none";
      box.style.background = "rgba(250, 204, 21, 0.32)"; // amber-ish
      box.style.outline = "2px solid rgba(234, 179, 8, 0.55)";
      box.style.borderRadius = "3px";
      box.style.zIndex = "10";
      pageRoot.appendChild(box);
      this.overlayEls.push(box);
    }
  }

  private scrollRangeIntoView(range: Range) {
    try {
      const rect = range.getBoundingClientRect();
      if (rect && rect.width >= 1 && rect.height >= 1) {
        const anchor = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2
        );
        (anchor as HTMLElement | null)?.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: "smooth",
        });
      }
    } catch {}
  }

  /** Fallback (coarse): select full contributing spans between start/end items. */
  private applySpanFallback(match: PDFSearchMatch): void {
    const textLayer = this.getTextLayer(match.pageNumber);
    if (!textLayer) return;

    const spans = Array.from(
      textLayer.querySelectorAll("span")
    ) as HTMLSpanElement[];
    if (!spans.length) return;

    const s = Math.max(0, Math.min(spans.length - 1, match.itemSpan.startItem));
    const e = Math.max(0, Math.min(spans.length - 1, match.itemSpan.endItem));

    for (let i = s; i <= e; i++) {
      const span = spans[i];
      const rect = span.getBoundingClientRect();
      const pageRoot = this.getPageRoot(match.pageNumber);
      if (!pageRoot) break;
      const pageRect = pageRoot.getBoundingClientRect();

      const box = document.createElement("div");
      box.style.position = "absolute";
      box.style.left = `${rect.left - pageRect.left}px`;
      box.style.top = `${rect.top - pageRect.top}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      box.style.pointerEvents = "none";
      box.style.background = "rgba(250, 204, 21, 0.22)";
      box.style.outline = "1px solid rgba(234, 179, 8, 0.45)";
      box.style.borderRadius = "3px";
      box.style.zIndex = "10";
      pageRoot.appendChild(box);
      this.overlayEls.push(box);
    }
  }

  private clearHighlights(): void {
    for (const el of this.overlayEls) {
      el.remove();
    }
    this.overlayEls = [];
  }

  // ----------------------
  // DOM helpers (React-PDF)
  // ----------------------

  private getPageRoot(pageNumber: number): HTMLElement | null {
    const root = this.containerRef?.current;
    if (!root) return null;

    let page = root.querySelector<HTMLElement>(
      `.react-pdf__Page[data-page-number="${pageNumber}"]`
    );
    if (page) return page;

    const all = root.querySelectorAll<HTMLElement>(".react-pdf__Page");
    if (all && all.length >= pageNumber) {
      return all[pageNumber - 1];
    }
    return null;
  }

  private getTextLayer(pageNumber: number): HTMLElement | null {
    const pageRoot = this.getPageRoot(pageNumber);
    if (!pageRoot) return null;

    let textLayer = pageRoot.querySelector<HTMLElement>(
      ".react-pdf__Page__textContent"
    );
    if (textLayer) return textLayer;

    textLayer = pageRoot.querySelector<HTMLElement>(".textLayer");
    return textLayer || null;
  }

  private async scrollPageIntoView(pageNumber: number): Promise<void> {
    const root = this.getPageRoot(pageNumber);
    if (!root) return;
    root.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
    await new Promise((r) => setTimeout(r, 60));
  }

  // ----------------------
  // Utilities
  // ----------------------

  private makeExcerpt(
    text: string,
    idx: number,
    len: number,
    radius = 50
  ): string {
    const start = Math.max(0, idx - radius);
    const end = Math.min(text.length, idx + len + radius);
    return text.slice(start, end).replace(/\s+/g, " ").trim();
  }
}
