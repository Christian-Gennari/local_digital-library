// src/services/EPUBSearchService.ts
export interface EPUBSearchMatch {
  text: string;
  cfi: string; // set on-demand when navigating
  href: string; // spine item href
  section: number; // spine index
  excerpt: string; // short context around match
  occurrenceInHref: number; // 0-based: N-th match within this href
}

type Rendition = any;
type Book = any;

export class EPUBSearchService {
  private matches: EPUBSearchMatch[] = [];
  private currentMatchIndex = 0;
  private currentQuery = "";
  private searchAnnotationCFIs = new Set<string>(); // for reliable clear

  constructor(private rendition: Rendition, private book: Book) {}

  // ----------------------
  // Public API
  // ----------------------

  async search(query: string): Promise<EPUBSearchMatch[]> {
    if (!query || query.trim().length < 2) {
      this.clear();
      return [];
    }

    this.currentQuery = query;
    this.clearHighlights();

    const hrefOccurrenceMap = new Map<string, number>();

    const results = await Promise.all(
      this.book.spine.spineItems.map(
        async (item: any, sectionIndex: number) => {
          try {
            const raw = await item.load(this.book.load.bind(this.book));
            const doc = this.ensureDocument(raw);
            if (!doc) {
              item.unload?.();
              return [];
            }
            const sectionMatches = this.searchInDoc(
              doc,
              item.href as string,
              sectionIndex,
              query,
              hrefOccurrenceMap
            );
            item.unload?.();
            return sectionMatches;
          } catch (e) {
            console.warn(`Could not load spine item ${item?.href}:`, e);
            return [];
          }
        }
      )
    );

    this.matches = results.flat();
    this.currentMatchIndex = 0;
    return this.matches;
  }

  async navigateToMatch(index: number): Promise<void> {
    if (index < 0 || index >= this.matches.length) return;

    this.currentMatchIndex = index;
    const match = this.matches[index];

    await this.rendition.display(match.href);
    await this.waitForRendered();

    // Always start clean before adding a new highlight
    this.clearHighlights();

    const range = this.findNthOccurrenceRange(
      this.currentQuery,
      match.occurrenceInHref
    );
    if (!range) {
      console.warn("Could not locate occurrence range in rendered docs.");
      return;
    }

    const cfi = this.rangeToCfi(range);
    if (!cfi) {
      console.warn("Failed to compute CFI from range.");
      return;
    }

    match.cfi = cfi;

    // Jump precisely to CFI (flips to the right page), then highlight
    await this.rendition.display(cfi);
    await this.waitForRendered();
    this.clearHighlights(); // ensure overlays from the first render are gone
    this.applyHighlight(cfi);
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

  clear(): void {
    this.clearHighlights();
    this.matches = [];
    this.currentMatchIndex = 0;
    this.currentQuery = "";
  }

  // ----------------------
  // Search (document-level)
  // ----------------------

  private searchInDoc(
    doc: Document,
    href: string,
    sectionIndex: number,
    query: string,
    hrefOccurrenceMap: Map<string, number>
  ): EPUBSearchMatch[] {
    const out: EPUBSearchMatch[] = [];
    if (!doc?.body || typeof doc.createTreeWalker !== "function") return out;

    const qLower = query.toLowerCase();
    const MAX_MATCHES_PER_SECTION = 200;

    let count = 0;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
    let node: Text | null;

    while ((node = walker.nextNode() as Text | null)) {
      const raw = node?.nodeValue;
      if (!raw) continue;

      const lower = raw.toLowerCase();
      let idx = 0;
      while ((idx = lower.indexOf(qLower, idx)) !== -1) {
        const occurrence = hrefOccurrenceMap.get(href) ?? 0;
        hrefOccurrenceMap.set(href, occurrence + 1);

        const excerpt = this.makeExcerpt(raw, idx, query.length);

        out.push({
          text: query,
          cfi: "",
          href,
          section: sectionIndex,
          excerpt,
          occurrenceInHref: occurrence,
        });

        count++;
        if (count >= MAX_MATCHES_PER_SECTION) return out;
        idx += query.length;
      }
    }

    return out;
  }

  // ----------------------
  // Rendered doc helpers
  // ----------------------

  private getContentDocs(): Document[] {
    const contents: any[] =
      typeof this.rendition.getContents === "function"
        ? this.rendition.getContents()
        : [];
    if (!contents?.length) return [];
    const docs: Document[] = [];
    for (const c of contents) {
      const d: Document | null =
        c?.document || c?.content || c?.iframe?.contentDocument || null;
      if (d?.body) docs.push(d);
    }
    return docs;
  }

  private findNthOccurrenceRange(
    query: string,
    targetOccurrence: number
  ): Range | null {
    const docs = this.getContentDocs();
    if (!docs.length) return null;

    const qLower = query.toLowerCase();
    let seen = 0;

    for (const doc of docs) {
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        const raw = node?.nodeValue;
        if (!raw) continue;

        const lower = raw.toLowerCase();
        let idx = 0;
        while ((idx = lower.indexOf(qLower, idx)) !== -1) {
          if (seen === targetOccurrence) {
            const r = doc.createRange();
            r.setStart(node, idx);
            r.setEnd(node, idx + query.length);
            return r;
          }
          seen++;
          idx += query.length;
        }
      }
    }

    return null;
  }

  private rangeToCfi(range: Range): string | null {
    const contents: any[] =
      typeof this.rendition.getContents === "function"
        ? this.rendition.getContents()
        : [];
    for (const c of contents) {
      const doc: Document | null =
        c?.document || c?.content || c?.iframe?.contentDocument || null;
      if (doc && (range.startContainer as Node)?.ownerDocument === doc) {
        if (typeof c.cfiFromRange === "function") return c.cfiFromRange(range);
        if (typeof c.rangeToCfi === "function") return c.rangeToCfi(range);
      }
    }
    return null;
  }

  // ----------------------
  // Annotations & lifecycle
  // ----------------------

  private applyHighlight(cfi: string) {
    try {
      if (this.rendition?.annotations?.add) {
        this.rendition.annotations.add(
          "highlight",
          cfi,
          {},
          () => {},
          "search"
        );
        this.searchAnnotationCFIs.add(cfi);
      }
    } catch (e) {
      console.warn("applyHighlight failed:", e);
    }
  }

  private clearHighlights(): void {
    try {
      if (
        this.rendition?.annotations?.remove &&
        this.searchAnnotationCFIs.size
      ) {
        for (const cfi of this.searchAnnotationCFIs) {
          try {
            this.rendition.annotations.remove(cfi, "highlight");
          } catch {}
        }
        this.searchAnnotationCFIs.clear();
      }

      // Remove any lingering overlay elements rendered by epub.js
      for (const doc of this.getContentDocs()) {
        const overlays = doc.querySelectorAll(
          ".epubjs-hl, .epubjs-underline, .epubjs-hl.search, .epubjs-underline.search"
        );
        overlays.forEach((el) => el.parentNode?.removeChild(el));
      }
    } catch (error) {
      console.log("Error clearing highlights:", error);
    }
  }

  // ----------------------
  // Utilities
  // ----------------------

  private waitForRendered(): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, 0);
      if (this.rendition && typeof this.rendition.once === "function") {
        this.rendition.once("rendered", () => {
          clearTimeout(t);
          resolve();
        });
      }
    });
  }

  private ensureDocument(input: any): Document | null {
    try {
      if (!input) return null;

      if (
        typeof input === "object" &&
        (input as Node).nodeType === Node.DOCUMENT_NODE
      ) {
        return input as Document;
      }

      if (
        typeof input === "object" &&
        (input as Node).nodeType === Node.ELEMENT_NODE
      ) {
        const doc = (input as Element).ownerDocument;
        return doc && (doc as Node).nodeType === Node.DOCUMENT_NODE
          ? doc
          : null;
      }

      if (typeof input === "string") {
        const parser = new DOMParser();
        let dom = parser.parseFromString(input, "application/xhtml+xml");
        if (
          !dom ||
          !dom.documentElement ||
          dom.getElementsByTagName("parsererror").length
        ) {
          dom = parser.parseFromString(input, "text/html");
        }
        return dom && (dom as Node).nodeType === Node.DOCUMENT_NODE
          ? dom
          : null;
      }

      if (
        input?.ownerDocument &&
        (input.ownerDocument as Node).nodeType === Node.DOCUMENT_NODE
      ) {
        return input.ownerDocument as Document;
      }

      return null;
    } catch {
      return null;
    }
  }

  private makeExcerpt(
    text: string,
    idx: number,
    len: number,
    radius = 40
  ): string {
    const start = Math.max(0, idx - radius);
    const end = Math.min(text.length, idx + len + radius);
    return text.slice(start, end).replace(/\s+/g, " ").trim();
  }
}
