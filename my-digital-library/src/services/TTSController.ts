// src/services/TTSController.ts
import { EventEmitter } from "events";

export interface TTSLocator {
  type: "epub" | "pdf";
  sentenceId: string;
  // EPUB specific
  href?: string;
  cfi?: string;
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

  async resumeFromBookmark() {
    if (!this.bookId || !this.storage) return;

    const bookmark = await this.storage.loadBookmark(this.bookId);
    if (!bookmark?.lastSentenceId) return;

    // FIXED: Added await
    const sentence = await this.sentenceIndex?.getSentence(
      bookmark.lastSentenceId
    );
    if (!sentence) return;

    // Navigate to the sentence location
    const adapter = this.adapters.get(sentence.cfi_start ? "epub" : "pdf");
    if (adapter) {
      const locator: TTSLocator = sentence.cfi_start
        ? { type: "epub", sentenceId: sentence.id, cfi: sentence.cfi_start }
        : {
            type: "pdf",
            sentenceId: sentence.id,
            page: sentence.page!,
            char: sentence.char_start,
          };

      await adapter.goToLocator(locator);
    }

    this.currentSentenceId = bookmark.lastSentenceId;
    this.offsetInSentence = bookmark.offsetSec || 0;

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

    // Get or create audio buffer
    let audioBuffer = this.audioCache.get(sentenceId);
    if (!audioBuffer) {
      const arrayBuffer = await this.synthesizer!.synthesize(
        sentence.text,
        this.settings
      );
      audioBuffer = await this.audioContext!.decodeAudioData(
        arrayBuffer.slice(0)
      );

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
    this.currentSource = this.audioContext!.createBufferSource();
    this.currentSource.buffer = audioBuffer;
    this.currentSource.connect(this.audioContext!.destination);

    // Set up event handlers
    this.currentSource.onended = () => {
      if (this.isPlaying && !this.isPaused) {
        this.playNextSentence();
      }
    };

    // Start playback
    const startTime = this.audioContext!.currentTime;
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

    // Navigate to sentence if not already visible
    if (adapter) {
      const locator: TTSLocator = sentence.cfi_start
        ? { type: "epub", sentenceId: sentence.id, cfi: sentence.cfi_start }
        : {
            type: "pdf",
            sentenceId: sentence.id,
            page: sentence.page!,
            char: sentence.char_start,
          };

      adapter.goToLocator(locator).catch(console.error);
    }

    // Save bookmark
    this.saveBookmark();

    // Preload next sentence
    this.preloadNextSentence(sentenceId);
  }

  private async playNextSentence() {
    if (!this.currentSentenceId) return;

    const nextSentence = await this.sentenceIndex?.getNextSentence(
      this.currentSentenceId
    );
    if (nextSentence?.id) {
      this.currentSentenceId = nextSentence.id;
      await this.playSentence(nextSentence.id);
    } else {
      await this.stop();
      this.emit("playbackEnded");
    }
  }

  private async preloadNextSentence(currentId: string) {
    const nextSentence = await this.sentenceIndex?.getNextSentence(currentId);
    if (!nextSentence?.id || this.audioCache.has(nextSentence.id)) return;

    try {
      const arrayBuffer = await this.synthesizer!.synthesize(
        nextSentence.text,
        this.settings
      );
      const audioBuffer = await this.audioContext!.decodeAudioData(
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
      await this.storage.saveBookmark(this.bookId, {
        lastSentenceId: this.currentSentenceId,
        offsetSec: this.offsetInSentence,
      });
    } catch (error) {
      console.warn("Failed to save bookmark:", error);
    }
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
