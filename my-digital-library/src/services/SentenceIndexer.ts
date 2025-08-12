// src/services/SentenceIndexer.ts
import { TTSLocator, TTSSentence, TTSSentenceIndex } from "./TTSController";

export interface SentenceIndexData {
  version: number;
  epub?: {
    spine: {
      [href: string]: {
        sentences: TTSSentence[];
        built: boolean;
      };
    };
  };
  pdf?: {
    pages: {
      [page: string]: {
        sentences: TTSSentence[];
        built: boolean;
      };
    };
  };
}

export class SentenceIndexer implements TTSSentenceIndex {
  private storage: any; // TTSStorage interface
  protected indexCache = new Map<string, SentenceIndexData>();
  private worker: Worker | null = null;
  private currentBookId: string | null = null;
  private ttsController: any = null; // Reference to TTS controller for adapter access

  constructor(storage: any, ttsController?: any) {
    this.storage = storage;
    this.ttsController = ttsController;
    this.initializeWorker();
  }

  private initializeWorker() {
    // Create inline worker for sentence splitting
    const workerCode = `
      // Sentence splitting logic in worker
      const SENTENCE_REGEX = /[.!?]+\\s+/g;
      const ABBREVIATIONS = new Set([
        'dr', 'mr', 'mrs', 'ms', 'prof', 'vs', 'etc', 'inc', 'ltd', 'co',
        'st', 'ave', 'blvd', 'rd', 'no', 'vol', 'ch', 'fig', 'p', 'pp'
      ]);

      function splitIntoSentences(text) {
        const sentences = [];
        let lastIndex = 0;
        let match;

        while ((match = SENTENCE_REGEX.exec(text)) !== null) {
          const beforePeriod = text.substring(lastIndex, match.index).trim();
          const words = beforePeriod.toLowerCase().split(/\\s+/);
          const lastWord = words[words.length - 1]?.replace(/[^a-z]/g, '');
          
          // Check if this is likely an abbreviation
          if (!ABBREVIATIONS.has(lastWord) && beforePeriod.length > 10) {
            const sentence = text.substring(lastIndex, match.index + match[0].length).trim();
            if (sentence.length > 0) {
              sentences.push({
                text: sentence,
                start: lastIndex,
                end: match.index + match[0].length
              });
            }
            lastIndex = match.index + match[0].length;
          }
        }

        // Add remaining text as last sentence
        if (lastIndex < text.length) {
          const remaining = text.substring(lastIndex).trim();
          if (remaining.length > 0) {
            sentences.push({
              text: remaining,
              start: lastIndex,
              end: text.length
            });
          }
        }

        return sentences;
      }

      self.onmessage = function(e) {
        const { type, data } = e.data;
        
        switch (type) {
          case 'splitEPUB':
            const { html, href, baseCharOffset } = data;
            // Parse HTML and extract text with position tracking
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const textContent = doc.body.textContent || '';
            
            const rawSentences = splitIntoSentences(textContent);
            const sentences = rawSentences.map((sent, index) => ({
              id: \`\${href}:\${String(index).padStart(3, '0')}\`,
              text: sent.text,
              char_start: baseCharOffset + sent.start,
              char_end: baseCharOffset + sent.end,
              para: Math.floor(index / 3), // Rough paragraph estimation
              cfi_start: '', // Will be filled by main thread
              cfi_end: ''
            }));
            
            self.postMessage({ type: 'epubResult', sentences });
            break;
            
          case 'splitPDF':
            const { text, page, baseCharOffset: pdfOffset } = data;
            const pdfSentences = splitIntoSentences(text);
            
            const pdfResult = pdfSentences.map((sent, index) => ({
              id: \`\${page}:\${String(index).padStart(3, '0')}\`,
              text: sent.text,
              page: page,
              char_start: pdfOffset + sent.start,
              char_end: pdfOffset + sent.end
            }));
            
            self.postMessage({ type: 'pdfResult', sentences: pdfResult });
            break;
        }
      };
    `;

    const blob = new Blob([workerCode], { type: "application/javascript" });
    this.worker = new Worker(URL.createObjectURL(blob));
  }

  async getSentence(sentenceId: string): Promise<TTSSentence | null> {
    // Parse sentence ID to determine book part
    const [part, index] = sentenceId.split(":");

    for (const [bookId, indexData] of this.indexCache.entries()) {
      // Search in EPUB
      if (indexData.epub?.spine[part]) {
        return (
          indexData.epub.spine[part].sentences.find(
            (s) => s.id === sentenceId
          ) || null
        );
      }

      // Search in PDF
      if (indexData.pdf?.pages[part]) {
        return (
          indexData.pdf.pages[part].sentences.find(
            (s) => s.id === sentenceId
          ) || null
        );
      }
    }

    return null;
  }

  async getNextSentence(sentenceId: string): Promise<TTSSentence | null> {
    const [part, indexStr] = sentenceId.split(":");
    const index = parseInt(indexStr, 10);

    for (const [bookId, indexData] of this.indexCache.entries()) {
      // EPUB navigation
      if (indexData.epub?.spine[part]) {
        const sentences = indexData.epub.spine[part].sentences;
        const nextInChapter = sentences.find(
          (s) => s.id === `${part}:${String(index + 1).padStart(3, "0")}`
        );
        if (nextInChapter) return nextInChapter;

        // Move to next chapter
        const spineKeys = Object.keys(indexData.epub.spine);
        const currentIndex = spineKeys.indexOf(part);
        if (currentIndex < spineKeys.length - 1) {
          const nextChapter = spineKeys[currentIndex + 1];
          const nextChapterSentences =
            indexData.epub.spine[nextChapter]?.sentences;
          if (nextChapterSentences && nextChapterSentences.length > 0) {
            return nextChapterSentences[0];
          }
        }
      }

      // PDF navigation
      if (indexData.pdf?.pages[part]) {
        const sentences = indexData.pdf.pages[part].sentences;
        const nextInPage = sentences.find(
          (s) => s.id === `${part}:${String(index + 1).padStart(3, "0")}`
        );
        if (nextInPage) return nextInPage;

        // Move to next page
        const pageNum = parseInt(part, 10);
        const nextPage = indexData.pdf.pages[String(pageNum + 1)];
        if (nextPage?.sentences && nextPage.sentences.length > 0) {
          return nextPage.sentences[0];
        }
      }
    }

    return null;
  }

  async getPrevSentence(sentenceId: string): Promise<TTSSentence | null> {
    const [part, indexStr] = sentenceId.split(":");
    const index = parseInt(indexStr, 10);

    for (const [bookId, indexData] of this.indexCache.entries()) {
      // EPUB navigation
      if (indexData.epub?.spine[part]) {
        if (index > 0) {
          const sentences = indexData.epub.spine[part].sentences;
          const prevInChapter = sentences.find(
            (s) => s.id === `${part}:${String(index - 1).padStart(3, "0")}`
          );
          if (prevInChapter) return prevInChapter;
        }

        // Move to previous chapter
        const spineKeys = Object.keys(indexData.epub.spine);
        const currentIndex = spineKeys.indexOf(part);
        if (currentIndex > 0) {
          const prevChapter = spineKeys[currentIndex - 1];
          const prevChapterSentences =
            indexData.epub.spine[prevChapter]?.sentences;
          if (prevChapterSentences && prevChapterSentences.length > 0) {
            return prevChapterSentences[prevChapterSentences.length - 1];
          }
        }
      }

      // PDF navigation
      if (indexData.pdf?.pages[part]) {
        if (index > 0) {
          const sentences = indexData.pdf.pages[part].sentences;
          const prevInPage = sentences.find(
            (s) => s.id === `${part}:${String(index - 1).padStart(3, "0")}`
          );
          if (prevInPage) return prevInPage;
        }

        // Move to previous page
        const pageNum = parseInt(part, 10);
        const prevPage = indexData.pdf.pages[String(pageNum - 1)];
        if (prevPage?.sentences && prevPage.sentences.length > 0) {
          return prevPage.sentences[prevPage.sentences.length - 1];
        }
      }
    }

    return null;
  }

  async getSentencesFromLocator(locator: TTSLocator): Promise<TTSSentence[]> {
    console.log("📍 getSentencesFromLocator called with:", {
      type: locator.type,
      page: locator.page,
      char: locator.char,
      href: locator.href,
    });

    if (locator.type === "epub" && locator.href) {
      const indexData = this.indexCache.get(this.currentBookId || "current");
      const chapter = indexData?.epub?.spine[locator.href];
      const sentences = chapter?.sentences || [];
      console.log("📖 EPUB sentences found:", sentences.length);
      return sentences;
    }

    if (locator.type === "pdf" && locator.page) {
      const indexData = this.indexCache.get(this.currentBookId || "current");
      const page = indexData?.pdf?.pages[String(locator.page)];
      const sentences = page?.sentences || [];

      console.log("📄 PDF sentences found:", {
        pageKey: String(locator.page),
        totalSentences: sentences.length,
        clickedChar: locator.char,
        firstFewSentences: sentences.slice(0, 3).map((s) => ({
          id: s.id,
          charStart: s.char_start,
          charEnd: s.char_end,
          text: s.text.substring(0, 50) + "...",
        })),
      });

      // If we have a specific character position, try to find the sentence that contains it
      if (locator.char !== undefined && locator.char > 0) {
        const targetSentence = sentences.find(
          (s) => s.char_start <= locator.char! && s.char_end >= locator.char!
        );

        if (targetSentence) {
          console.log(
            "🎯 Found target sentence for character",
            locator.char,
            ":",
            {
              id: targetSentence.id,
              charStart: targetSentence.char_start,
              charEnd: targetSentence.char_end,
              text: targetSentence.text.substring(0, 100) + "...",
            }
          );

          // Return sentences starting from the target sentence
          const startIndex = sentences.indexOf(targetSentence);
          const result = sentences.slice(startIndex);
          console.log(
            "📋 Returning",
            result.length,
            "sentences starting from target"
          );
          return result;
        } else {
          console.warn(
            "⚠️ No sentence found containing character",
            locator.char,
            "- falling back to first sentence"
          );
        }
      }

      return sentences;
    }

    console.log("❌ No sentences found for locator");
    return [];
  }

  // Add missing method for setting current book
  setCurrentBook(bookId: string): void {
    this.currentBookId = bookId;
  }

  // Add missing method for getting all sentences
  async getAllSentences(bookId?: string): Promise<TTSSentence[]> {
    const targetBookId = bookId || this.currentBookId;
    if (!targetBookId) return [];

    const indexData = this.indexCache.get(targetBookId);
    if (!indexData) return [];

    const allSentences: TTSSentence[] = [];

    // Collect from EPUB chapters
    if (indexData.epub?.spine) {
      for (const chapterData of Object.values(indexData.epub.spine)) {
        if (chapterData.built) {
          allSentences.push(...chapterData.sentences);
        }
      }
    }

    // Collect from PDF pages
    if (indexData.pdf?.pages) {
      for (const pageData of Object.values(indexData.pdf.pages)) {
        if (pageData.built) {
          allSentences.push(...pageData.sentences);
        }
      }
    }

    return allSentences;
  }

  async buildIndex(bookId: string, locator: TTSLocator): Promise<void> {
    // Get or create indexData - FIXED: Ensure it's always a valid SentenceIndexData
    let indexData = this.indexCache.get(bookId);
    if (!indexData) {
      const loadedData = await this.storage.loadSentences(bookId);
      indexData = (loadedData ?? { version: 1 }) as SentenceIndexData;
      this.indexCache.set(bookId, indexData);
    }

    // Set as current book
    this.currentBookId = bookId;

    // Type assertion to ensure indexData is never undefined
    const safeIndexData: SentenceIndexData = indexData;

    if (locator.type === "epub" && locator.href) {
      await this.buildEPUBIndex(bookId, locator.href, safeIndexData);
    } else if (locator.type === "pdf" && locator.page) {
      await this.buildPDFIndex(bookId, locator.page, safeIndexData);
    }
  }

  private async buildEPUBIndex(
    bookId: string,
    href: string,
    indexData: SentenceIndexData
  ) {
    if (!indexData.epub) indexData.epub = { spine: {} };
    if (indexData.epub.spine[href]?.built) return; // Already built

    // Get EPUB content from your existing EPUB renderer
    // This is a placeholder - you'll need to integrate with your EPUB.js setup
    const epubContent = await this.getEPUBContent(href);
    if (!epubContent) return;

    return new Promise<void>((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("Worker not initialized"));
        return;
      }

      const handleMessage = (e: MessageEvent) => {
        if (e.data.type === "epubResult") {
          this.worker!.removeEventListener("message", handleMessage);

          const sentences = e.data.sentences.map(
            (sent: any, index: number) => ({
              ...sent,
              // You'll need to compute CFIs based on sentence positions
              cfi_start: this.computeCFIForSentence(href, sent.char_start),
              cfi_end: this.computeCFIForSentence(href, sent.char_end),
            })
          );

          indexData.epub!.spine[href] = {
            sentences,
            built: true,
          };

          this.storage.saveSentences(bookId, indexData);
          resolve();
        }
      };

      this.worker.addEventListener("message", handleMessage);
      this.worker.postMessage({
        type: "splitEPUB",
        data: {
          html: epubContent.html,
          href,
          baseCharOffset: 0,
        },
      });
    });
  }

  private async buildPDFIndex(
    bookId: string,
    page: number,
    indexData: SentenceIndexData
  ) {
    if (!indexData.pdf) indexData.pdf = { pages: {} };
    const pageKey = String(page);
    if (indexData.pdf.pages[pageKey]?.built) return; // Already built

    // Get PDF page text from your existing PDF.js setup
    const pageText = await this.getPDFPageText(page);
    if (!pageText) return;

    return new Promise<void>((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("Worker not initialized"));
        return;
      }

      const handleMessage = (e: MessageEvent) => {
        if (e.data.type === "pdfResult") {
          this.worker!.removeEventListener("message", handleMessage);

          indexData.pdf!.pages[pageKey] = {
            sentences: e.data.sentences,
            built: true,
          };

          this.storage.saveSentences(bookId, indexData);
          resolve();
        }
      };

      this.worker.addEventListener("message", handleMessage);
      this.worker.postMessage({
        type: "splitPDF",
        data: {
          text: pageText,
          page,
          baseCharOffset: 0,
        },
      });
    });
  }

  // UPDATED: Now integrates with actual adapters
  protected async getEPUBContent(
    href: string
  ): Promise<{ html: string } | null> {
    // Get the EPUB adapter from the current TTS system
    const ttsController = this.getTTSController();
    const epubAdapter = ttsController?.adapters?.get("epub") as any;

    if (epubAdapter && typeof epubAdapter.getChapterContent === "function") {
      return await epubAdapter.getChapterContent(href);
    }

    console.warn("EPUB adapter not available for content extraction");
    return null;
  }

  protected async getPDFPageText(page: number): Promise<string | null> {
    // Get the PDF adapter from the current TTS system
    const ttsController = this.getTTSController();
    const pdfAdapter = ttsController?.adapters?.get("pdf") as any;

    if (pdfAdapter && typeof pdfAdapter.getPageText === "function") {
      return await pdfAdapter.getPageText(page);
    }

    console.warn("PDF adapter not available for text extraction");
    return null;
  }

  protected computeCFIForSentence(href: string, charOffset: number): string {
    // Get the EPUB adapter for CFI computation
    const ttsController = this.getTTSController();
    const epubAdapter = ttsController?.adapters?.get("epub") as any;

    if (
      epubAdapter &&
      typeof epubAdapter.computeCFIForSentence === "function"
    ) {
      return epubAdapter.computeCFIForSentence(href, charOffset);
    }

    // Fallback CFI
    return `epubcfi(/6/14[${href}]!/4/2/2[text-${charOffset}])`;
  }

  // Helper method to get TTS controller reference
  private getTTSController(): any {
    return this.ttsController;
  }

  destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.indexCache.clear();
  }
}

// Local JSON Storage Implementation
export class LocalTTSStorage {
  async loadSentences(bookId: string): Promise<SentenceIndexData | null> {
    try {
      const response = await fetch(`/api/books/${bookId}/tts/sentences`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn("Failed to load sentences:", error);
    }
    return null;
  }

  async saveSentences(
    bookId: string,
    sentences: SentenceIndexData
  ): Promise<void> {
    try {
      await fetch(`/api/books/${bookId}/tts/sentences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sentences),
      });
    } catch (error) {
      console.error("Failed to save sentences:", error);
    }
  }

  async loadBookmark(
    bookId: string
  ): Promise<{ lastSentenceId?: string; offsetSec?: number } | null> {
    try {
      const response = await fetch(`/api/books/${bookId}/tts/bookmark`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn("Failed to load bookmark:", error);
    }
    return null;
  }

  async saveBookmark(
    bookId: string,
    bookmark: { lastSentenceId: string; offsetSec?: number }
  ): Promise<void> {
    try {
      await fetch(`/api/books/${bookId}/tts/bookmark`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookmark),
      });
    } catch (error) {
      console.error("Failed to save bookmark:", error);
    }
  }

  async loadSettings(bookId: string): Promise<any> {
    try {
      const response = await fetch(`/api/books/${bookId}/tts/settings`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn("Failed to load settings:", error);
    }
    return null;
  }

  async saveSettings(bookId: string, settings: any): Promise<void> {
    try {
      await fetch(`/api/books/${bookId}/tts/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  }
}
