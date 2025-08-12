// src/services/TTSController.ts
import { EventEmitter } from "events";

export interface TTSLocator {
  type: "epub" | "pdf";
  sentenceId: string;
  // EPUB specific
  href?: string;
  cfi?: string;
  clickedText?: string; // ADD THIS LINE
  // PDF specific
  page?: number;
  char?: number;
}

export interface TTSSentence {
  id: string;
  text: string;
  // EPUB fields
  cfi_start?: string;
  cfi_end?: string;
  para?: number;
  // PDF fields
  page?: number;
  // Common fields
  char_start: number;
  char_end: number;
}

export interface TTSOptions {
  voice?: string;
  rate?: number;
  volume?: number;
}

export interface TTSAdapter {
  getLocator(): TTSLocator | null;
  goToLocator(locator: TTSLocator): Promise<void>;
  highlightSentence?(sentence: TTSSentence): void;
  clearHighlight?(): void;
}

export interface TTSStorage {
  loadSentences(bookId: string): Promise<any>;
  saveSentences(bookId: string, sentences: any): Promise<void>;
  loadBookmark(
    bookId: string
  ): Promise<{ lastSentenceId?: string; offsetSec?: number } | null>;
  saveBookmark(
    bookId: string,
    bookmark: { lastSentenceId: string; offsetSec?: number }
  ): Promise<void>;
  loadSettings(bookId: string): Promise<TTSOptions | null>;
  saveSettings(bookId: string, settings: TTSOptions): Promise<void>;
}

export interface TTSSynthesizer {
  synthesize(text: string, options?: TTSOptions): Promise<ArrayBuffer>;
}

export interface TTSSentenceIndex {
  getSentence(sentenceId: string): Promise<TTSSentence | null>;
  getNextSentence(sentenceId: string): Promise<TTSSentence | null>;
  getPrevSentence(sentenceId: string): Promise<TTSSentence | null>;
  getSentencesFromLocator(locator: TTSLocator): Promise<TTSSentence[]>;
  buildIndex(bookId: string, locator: TTSLocator): Promise<void>;
  setCurrentBook(bookId: string): void;
  getAllSentences(bookId?: string): Promise<TTSSentence[]>;
}

export class TTSController extends EventEmitter {
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private currentSentenceId: string | null = null;
  private startedAtCtxTime: number = 0;
  private offsetInSentence: number = 0;
  private isPlaying: boolean = false;
  private isPaused: boolean = false;
  private audioCache = new Map<string, AudioBuffer>();
  private readonly maxCacheSize = 50;

  private bookId: string | null = null;
  private synthesizer: TTSSynthesizer | null = null;
  private storage: TTSStorage | null = null;
  private sentenceIndex: TTSSentenceIndex | null = null;
  private adapters: Map<string, TTSAdapter> = new Map();
  private settings: TTSOptions = { voice: "af_heart", rate: 1.0, volume: 1.0 };

  async init(config: {
    synthesizer: TTSSynthesizer;
    storage: TTSStorage;
    sentenceIndex: TTSSentenceIndex;
    adapters: { epub?: TTSAdapter; pdf?: TTSAdapter };
  }) {
    this.synthesizer = config.synthesizer;
    this.storage = config.storage;
    this.sentenceIndex = config.sentenceIndex;

    if (config.adapters.epub) this.adapters.set("epub", config.adapters.epub);
    if (config.adapters.pdf) this.adapters.set("pdf", config.adapters.pdf);

    // Initialize AudioContext
    this.audioContext = new (window.AudioContext ||
      (window as any).webkitAudioContext)();

    this.emit("initialized");
  }

  async setBook(bookId: string) {
    if (this.isPlaying) {
      await this.stop();
    }

    this.bookId = bookId;

    // Load settings
    const savedSettings = await this.storage?.loadSettings(bookId);
    if (savedSettings) {
      this.settings = { ...this.settings, ...savedSettings };
    }

    this.emit("bookChanged", bookId);
  }

  async playFromLocator(locator: TTSLocator, offsetSec: number = 0) {
    if (!this.bookId || !this.sentenceIndex || !this.synthesizer) {
      throw new Error("TTS not properly initialized");
    }

    await this.stop();

    // Build sentence index if needed
    await this.sentenceIndex.buildIndex(this.bookId, locator);

    // Get sentences starting from locator (FIXED: Added await)
    const sentences = await this.sentenceIndex.getSentencesFromLocator(locator);
    if (sentences.length === 0) {
      throw new Error("No sentences found at locator");
    }

    const startSentence = sentences[0];
    this.currentSentenceId = startSentence.id;
    this.offsetInSentence = offsetSec;

    await this.startPlayback();
  }

  private async startPlayback() {
    if (!this.currentSentenceId || !this.audioContext || !this.synthesizer)
      return;

    this.isPlaying = true;
    this.isPaused = false;

    // Resume AudioContext if suspended
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    await this.playSentence(this.currentSentenceId);
    this.emit("playbackStarted");
  }

  private async playSentence(sentenceId: string) {
    if (!sentenceId) {
      console.warn("playSentence called with empty sentenceId");
      return;
    }

    const sentence = await this.sentenceIndex?.getSentence(sentenceId);
    if (!sentence) return;

    // CRITICAL FIX: Ensure AudioContext exists
    if (!this.audioContext) {
      console.warn("❌ AudioContext is null, recreating...");
      this.audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    }

    // Resume AudioContext if suspended
    if (this.audioContext.state === "suspended") {
      console.log("🔊 Resuming suspended AudioContext");
      await this.audioContext.resume();
    }

    console.log("🎵 AudioContext state:", this.audioContext.state);

    // Get or create audio buffer
    let audioBuffer = this.audioCache.get(sentenceId);
    if (!audioBuffer) {
      const arrayBuffer = await this.synthesizer!.synthesize(
        sentence.text,
        this.settings
      );

      try {
        audioBuffer = await this.audioContext.decodeAudioData(
          arrayBuffer.slice(0)
        );
        console.log("✅ Audio decoded successfully");
      } catch (error) {
        console.error("❌ Failed to decode audio:", error);
        return;
      }

      // Cache management
      if (this.audioCache.size >= this.maxCacheSize) {
        const firstKey = this.audioCache.keys().next().value;
        if (typeof firstKey === "string") {
          this.audioCache.delete(firstKey);
        }
      }
      this.audioCache.set(sentenceId, audioBuffer);
    }

    // Create and configure source
    this.currentSource = this.audioContext.createBufferSource();
    this.currentSource.buffer = audioBuffer;
    this.currentSource.connect(this.audioContext.destination);

    // Set up event handlers
    this.currentSource.onended = () => {
      if (this.isPlaying && !this.isPaused) {
        this.playNextSentence();
      }
    };

    // Start playback
    const startTime = this.audioContext.currentTime;
    this.startedAtCtxTime = startTime;
    this.currentSource.start(startTime, this.offsetInSentence);

    // Reset offset for subsequent sentences
    this.offsetInSentence = 0;

    // Emit sentence event
    this.emit("sentence", sentence);

    // Highlight sentence if adapter supports it
    const adapter = this.adapters.get(sentence.cfi_start ? "epub" : "pdf");
    if (adapter?.highlightSentence) {
      adapter.highlightSentence(sentence);
    }

    // SMART NAVIGATION: Only navigate when switching pages/chapters
    if (adapter) {
      const currentLocator = adapter.getLocator();

      if (sentence.page !== undefined) {
        // PDF: Navigate if on different page
        if (currentLocator?.page !== sentence.page) {
          console.log("📄 Navigating to PDF page:", sentence.page);
          const locator: TTSLocator = {
            type: "pdf",
            sentenceId: sentence.id,
            page: sentence.page,
            char: sentence.char_start,
          };
          adapter.goToLocator(locator).catch(console.error);
        }
      } else if (sentence.cfi_start) {
        // EPUB: Check if sentence is visible, if not navigate to it
        if ("isLocationVisible" in adapter) {
          const isVisible = await (adapter as any).isLocationVisible(
            sentence.cfi_start
          );

          if (!isVisible) {
            console.log("📖 Sentence not visible, navigating to it");
            const locator: TTSLocator = {
              type: "epub",
              sentenceId: sentence.id,
              cfi: sentence.cfi_start,
            };
            await adapter.goToLocator(locator);
          }
        } else {
          // Fallback: navigate if CFI is significantly different
          if (currentLocator?.cfi) {
            const currentNum = parseInt(
              currentLocator.cfi.match(/\/(\d+)/)?.[1] || "0"
            );
            const sentenceNum = parseInt(
              sentence.cfi_start.match(/\/(\d+)/)?.[1] || "0"
            );

            // If sentence is more than 50 elements away, probably need to turn page
            if (Math.abs(sentenceNum - currentNum) > 50) {
              console.log(
                "📖 Sentence appears to be on different page, navigating"
              );
              const locator: TTSLocator = {
                type: "epub",
                sentenceId: sentence.id,
                cfi: sentence.cfi_start,
              };
              await adapter.goToLocator(locator);
            }
          }
        }
      }
    }

    // Save bookmark
    this.saveBookmark();

    // Preload next sentence
    this.preloadNextSentence(sentenceId);
  }

  // Add this helper method to extract href from CFI
  private extractHrefFromCFI(cfi: string): string | undefined {
    // CFI format might include href information
    // This is a simplified extraction - adjust based on your CFI format
    const match = cfi.match(/\[(.*?)\]/);
    if (match) {
      return match[1];
    }
    // You might need to look this up from your sentence index
    return undefined;
  }

  // Add this helper method to check if EPUB needs page turn
  private async checkAndTurnEPUBPage(
    adapter: TTSAdapter,
    sentence: TTSSentence
  ) {
    try {
      // For EPUB, we need to check if the sentence is visible in current view
      // This is tricky because EPUB uses virtual pagination

      // Get current location from adapter
      const currentLoc = adapter.getLocator();
      if (!currentLoc?.cfi || !sentence.cfi_start) return;

      // Simple approach: if CFI is significantly different, turn page
      // You might need to adjust this logic based on your EPUB viewer
      const currentCFINum = this.extractCFINumber(currentLoc.cfi);
      const sentenceCFINum = this.extractCFINumber(sentence.cfi_start);

      // If sentence is more than a "page" away, navigate to it
      if (Math.abs(currentCFINum - sentenceCFINum) > 100) {
        console.log("📖 Turning EPUB page to show sentence");
        const locator: TTSLocator = {
          type: "epub",
          sentenceId: sentence.id,
          cfi: sentence.cfi_start,
        };
        await adapter.goToLocator(locator);
      }
    } catch (error) {
      console.warn("Error checking EPUB page turn:", error);
    }
  }

  // Helper to extract a comparable number from CFI
  private extractCFINumber(cfi: string): number {
    // Extract the main navigation number from CFI
    // CFI format: epubcfi(/6/60!/4/160[page378]/6/2,/1:0,/1:1)
    const match = cfi.match(/\/4\/(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return 0;
  }

  private async playNextSentence() {
    if (!this.currentSentenceId) return;

    let nextSentence = await this.sentenceIndex?.getNextSentence(
      this.currentSentenceId
    );

    // If no next sentence, try to load next page/chapter
    if (!nextSentence?.id && this.sentenceIndex && this.bookId) {
      console.log("📄 No more sentences, trying to load next page/chapter...");

      // Get current sentence to know where we are
      const currentSentence = await this.sentenceIndex.getSentence(
        this.currentSentenceId
      );

      if (currentSentence?.page !== undefined) {
        // PDF: Load next page
        const nextPage = currentSentence.page + 1;
        console.log(`📄 Loading PDF page ${nextPage}...`);

        const nextLocator: TTSLocator = {
          type: "pdf",
          sentenceId: "",
          page: nextPage,
          char: 0,
        };

        // Build index for next page
        await this.sentenceIndex.buildIndex(this.bookId, nextLocator);

        // Get sentences from next page
        const sentences = await this.sentenceIndex.getSentencesFromLocator(
          nextLocator
        );
        if (sentences.length > 0) {
          nextSentence = sentences[0];
          console.log("✅ Loaded next PDF page");
        }
      } else if (currentSentence?.cfi_start) {
        // EPUB: For now, just stop at chapter end
        // (Implementing chapter navigation is more complex)
        console.log("📖 Reached end of EPUB chapter");
      }
    }

    if (nextSentence?.id) {
      this.currentSentenceId = nextSentence.id;
      await this.playSentence(nextSentence.id);
    } else {
      console.log("📚 No more content to play");
      await this.stop();
      this.emit("playbackEnded");
    }
  }

  // Add this helper method to get next EPUB chapter
  private async getNextEPUBChapter(
    currentSentence: TTSSentence
  ): Promise<string | null> {
    // This needs to be implemented based on your EPUB structure
    // You might need to access the EPUB book's spine to get chapter order

    // For now, return null - you'll need to implement this based on your EPUB adapter
    // Ideally, you'd have access to the book's spine/TOC structure

    // Example implementation (you'll need to adjust):
    /*
  const adapter = this.adapters.get("epub");
  if (adapter && 'getNextChapter' in adapter) {
    return await (adapter as any).getNextChapter();
  }
  */

    return null;
  }

  private async preloadNextSentence(currentId: string) {
    const nextSentence = await this.sentenceIndex?.getNextSentence(currentId);
    if (!nextSentence?.id || this.audioCache.has(nextSentence.id)) return;

    try {
      const arrayBuffer = await this.synthesizer!.synthesize(
        nextSentence.text,
        this.settings
      );

      // CRITICAL FIX: Check AudioContext before using it
      if (!this.audioContext) {
        console.warn("❌ AudioContext is null in preload, skipping...");
        return;
      }

      const audioBuffer = await this.audioContext.decodeAudioData(
        arrayBuffer.slice(0)
      );

      if (this.audioCache.size < this.maxCacheSize) {
        this.audioCache.set(nextSentence.id, audioBuffer);
      }
    } catch (error) {
      console.warn("Failed to preload next sentence:", error);
    }
  }

  async pause() {
    if (!this.isPlaying || this.isPaused) return;

    this.isPaused = true;

    if (this.audioContext && this.audioContext.state === "running") {
      // Calculate current position
      const elapsed = this.audioContext.currentTime - this.startedAtCtxTime;
      this.offsetInSentence = Math.max(0, elapsed);

      // Suspend AudioContext
      await this.audioContext.suspend();
    }

    if (this.currentSource) {
      this.currentSource.stop();
      this.currentSource = null;
    }

    this.saveBookmark();
    this.emit("paused");
  }

  async resume() {
    if (!this.isPaused || !this.currentSentenceId) return;

    this.isPaused = false;

    if (this.audioContext && this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    await this.playSentence(this.currentSentenceId);
    this.emit("resumed");
  }

  async stop() {
    this.isPlaying = false;
    this.isPaused = false;
    this.offsetInSentence = 0;

    if (this.currentSource) {
      this.currentSource.stop();
      this.currentSource = null;
    }

    if (this.audioContext && this.audioContext.state === "running") {
      await this.audioContext.suspend();
    }

    // Clear highlights
    for (const adapter of this.adapters.values()) {
      if (adapter.clearHighlight) {
        adapter.clearHighlight();
      }
    }

    this.emit("stopped");
  }

  async nextSentence() {
    if (!this.currentSentenceId) return;

    const nextSentence = await this.sentenceIndex?.getNextSentence(
      this.currentSentenceId
    );
    if (!nextSentence?.id) return;

    const wasPlaying = this.isPlaying && !this.isPaused;

    if (this.currentSource) {
      this.currentSource.stop();
      this.currentSource = null;
    }

    this.currentSentenceId = nextSentence.id;
    this.offsetInSentence = 0;

    if (wasPlaying) {
      await this.playSentence(nextSentence.id);
    }

    this.emit("sentenceChanged", nextSentence);
  }

  async prevSentence() {
    if (!this.currentSentenceId) return;

    const prevSentence = await this.sentenceIndex?.getPrevSentence(
      this.currentSentenceId
    );
    if (!prevSentence?.id) return;

    const wasPlaying = this.isPlaying && !this.isPaused;

    if (this.currentSource) {
      this.currentSource.stop();
      this.currentSource = null;
    }

    this.currentSentenceId = prevSentence.id;
    this.offsetInSentence = 0;

    if (wasPlaying) {
      await this.playSentence(prevSentence.id);
    }

    this.emit("sentenceChanged", prevSentence);
  }

  async skipChapter(direction: 1 | -1) {
    // Implementation depends on your book structure
    // This is a placeholder - you'll need to implement based on your EPUB/PDF navigation
    this.emit("chapterSkip", direction);
  }

  setVoice(voice: string) {
    this.settings.voice = voice;
    this.saveSettings();
  }

  setRate(rate: number) {
    this.settings.rate = Math.max(0.25, Math.min(4.0, rate));
    this.saveSettings();
  }

  setVolume(volume: number) {
    this.settings.volume = Math.max(0, Math.min(1.0, volume));
    this.saveSettings();
  }

  private async saveBookmark() {
    if (!this.bookId || !this.currentSentenceId || !this.storage) return;

    try {
      // Get the actual sentence being played
      const currentSentence = await this.sentenceIndex?.getSentence(
        this.currentSentenceId
      );

      if (currentSentence) {
        // Save the bookmark with sentence's actual position
        const bookmark = {
          lastSentenceId: this.currentSentenceId,
          offsetSec: this.offsetInSentence,
          // Also save position info for direct navigation
          cfi: currentSentence.cfi_start,
          page: currentSentence.page,
          href: currentSentence.cfi_start ? undefined : currentSentence.page,
        };

        await this.storage.saveBookmark(this.bookId, bookmark as any);
        console.log("📌 Bookmark saved:", {
          sentenceId: this.currentSentenceId,
          cfi: currentSentence.cfi_start?.substring(0, 50),
          page: currentSentence.page,
        });
      }
    } catch (error) {
      console.warn("Failed to save bookmark:", error);
    }
  }

  // And update resumeFromBookmark to use the saved position:

  async resumeFromBookmark() {
    if (!this.bookId || !this.storage) return;

    const bookmark = await this.storage.loadBookmark(this.bookId);
    if (!bookmark?.lastSentenceId) return;

    console.log("📖 Resuming from bookmark:", bookmark);

    // Get the sentence
    const sentence = await this.sentenceIndex?.getSentence(
      bookmark.lastSentenceId
    );
    if (!sentence) return;

    // Navigate to the exact position first
    const adapter = this.adapters.get(sentence.cfi_start ? "epub" : "pdf");
    if (adapter) {
      const locator: TTSLocator = sentence.cfi_start
        ? {
            type: "epub",
            sentenceId: sentence.id,
            cfi: sentence.cfi_start,
            href: (bookmark as any).href,
          }
        : {
            type: "pdf",
            sentenceId: sentence.id,
            page: sentence.page!,
            char: sentence.char_start,
          };

      console.log("📍 Navigating to bookmarked position:", locator);
      await adapter.goToLocator(locator);
    }

    this.currentSentenceId = bookmark.lastSentenceId;
    this.offsetInSentence = bookmark.offsetSec || 0;

    await this.startPlayback();
  }

  private async saveSettings() {
    if (!this.bookId || !this.storage) return;

    try {
      await this.storage.saveSettings(this.bookId, this.settings);
    } catch (error) {
      console.warn("Failed to save settings:", error);
    }
  }

  // Getters
  get isActive() {
    return this.isPlaying;
  }
  get paused() {
    return this.isPaused;
  }
  get currentSentenceIdValue() {
    return this.currentSentenceId;
  }
  get currentSettings() {
    return { ...this.settings };
  }

  // Async method to get current sentence data
  async getCurrentSentence(): Promise<TTSSentence | null> {
    return this.currentSentenceId
      ? (await this.sentenceIndex?.getSentence(this.currentSentenceId)) || null
      : null;
  }

  // Cleanup
  async destroy() {
    await this.stop();

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    this.audioCache.clear();
    this.removeAllListeners();
  }
}
