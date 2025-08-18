// src/services/TTSController.ts
import { EventEmitter } from "events";

export interface TTSOptions {
  voice?: string;
  rate?: number;
  volume?: number;
}

export interface TTSSynthesizer {
  synthesize(text: string, options?: TTSOptions): Promise<ArrayBuffer>;
}

export interface TTSStorage {
  saveBookmark(bookId: string, bookmark: any): Promise<void>;
  loadBookmark(bookId: string): Promise<any>;
  saveSettings(bookId: string, settings: any): Promise<void>;
  loadSettings(bookId: string): Promise<any>;
}

export interface TTSSentence {
  id: string;
  text: string;
  cfi_start?: string;
  cfi_end?: string;
  page?: number;
  char_start: number;
  char_end: number;
}

export interface TTSLocator {
  type: "epub" | "pdf";
  sentenceId?: string;
  page?: number;
  char?: number;
  href?: string;
  cfi?: string;
  offsetMs?: number;
}

export interface TTSAdapter {
  highlight?(sentenceId: string, sentence: TTSSentence): void;
  clearHighlight?(): void;
  goToLocator?(locator: TTSLocator): Promise<void>; // Add this line
  destroy(): void;
}

export interface SentenceIndex {
  buildIndex(bookId: string, locator?: TTSLocator): Promise<void>;
  getSentencesFromLocator(locator: TTSLocator): Promise<TTSSentence[]>;
  getSentence(sentenceId: string): Promise<TTSSentence | null>;
  getNextSentence(sentenceId: string): Promise<TTSSentence | null>;
  getPrevSentence(sentenceId: string): Promise<TTSSentence | null>;
  getAllSentences(bookId?: string): Promise<TTSSentence[]>; // Add this line
}

export enum PlaybackState {
  IDLE = "idle",
  LOADING = "loading",
  PLAYING = "playing",
  PAUSED = "paused",
  STOPPED = "stopped",
  ERROR = "error",
}

interface BufferedSentence {
  sentenceId: string;
  sentence: TTSSentence;
  audioBuffer: AudioBuffer;
  duration: number;
}

interface ScheduledSource {
  sentenceId: string;
  source: AudioBufferSourceNode;
  startTime: number;
  duration: number;
  sentence: TTSSentence;
}

export class TTSController extends EventEmitter {
  // Core dependencies
  private synthesizer: TTSSynthesizer | null = null;
  private storage: TTSStorage | null = null;
  private sentenceIndex: SentenceIndex | null = null;
  private adapters = new Map<string, TTSAdapter>();

  // Playback state
  private playbackState: PlaybackState = PlaybackState.IDLE;
  private playbackId: string = "";
  private synthesisAbortController: AbortController | null = null;
  private currentLocator: TTSLocator | null = null;
  private isContinuousMode: boolean = true; // Enable continuous reading by default

  // Audio management
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;

  // Buffer management
  private bufferQueue: BufferedSentence[] = [];
  private readonly maxBufferSize = 3; // Keep 3 sentences buffered
  private synthesisInProgress = new Set<string>(); // Track which sentences are being synthesized

  // Playback scheduling
  private scheduledSources: ScheduledSource[] = [];
  private currentPlayingSentenceId: string | null = null;
  private lastScheduledEndTime: number = 0;
  private pausedAtTime: number = 0;
  private pausedSentenceOffset: number = 0;

  // Current session info
  private bookId: string | null = null;
  private sentenceQueue: TTSSentence[] = [];
  private currentQueueIndex: number = 0;

  // Settings with guaranteed default values
  private settings: Required<TTSOptions> = {
    voice: "af_heart",
    rate: 1.0,
    volume: 1.0,
  };

  constructor() {
    super();
  }

  async init(config: {
    synthesizer: TTSSynthesizer;
    storage: TTSStorage;
    sentenceIndex: SentenceIndex;
    adapters: { epub?: TTSAdapter; pdf?: TTSAdapter };
  }) {
    this.synthesizer = config.synthesizer;
    this.storage = config.storage;
    this.sentenceIndex = config.sentenceIndex;

    if (config.adapters.epub) this.adapters.set("epub", config.adapters.epub);
    if (config.adapters.pdf) this.adapters.set("pdf", config.adapters.pdf);

    // Initialize AudioContext with gain node for volume control
    this.audioContext = new (window.AudioContext ||
      (window as any).webkitAudioContext)();

    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
    this.gainNode.gain.value = this.settings.volume || 1.0;

    this.playbackState = PlaybackState.IDLE;
    this.emit("initialized");
  }

  getSentenceIndex(): SentenceIndex | null {
    return this.sentenceIndex;
  }

  async setBook(bookId: string) {
    // Stop any ongoing playback
    await this.stop();

    this.bookId = bookId;

    // Load settings with defaults for any missing values
    const savedSettings = await this.storage?.loadSettings(bookId);
    if (savedSettings) {
      this.settings = {
        voice: savedSettings.voice || "af_heart",
        rate: savedSettings.rate || 1.0,
        volume: savedSettings.volume || 1.0,
      };
      if (this.gainNode) {
        this.gainNode.gain.value = this.settings.volume;
      }
    }

    this.emit("bookChanged", bookId);
  }

  async playFromLocator(locator: TTSLocator, offsetSec: number = 0) {
    if (!this.bookId || !this.sentenceIndex || !this.synthesizer) {
      throw new Error("TTS not properly initialized");
    }

    // Stop any existing playback
    await this.stop();
    this.currentLocator = locator; // Store the initial locator

    // Generate new playback ID
    this.playbackId = `playback-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    this.synthesisAbortController = new AbortController();

    try {
      this.playbackState = PlaybackState.LOADING;

      // Build sentence index if needed
      await this.sentenceIndex.buildIndex(this.bookId, locator);

      // Get sentences starting from locator
      const sentences = await this.sentenceIndex.getSentencesFromLocator(
        locator
      );
      if (sentences.length === 0) {
        throw new Error("No sentences found at locator");
      }

      // Initialize sentence queue
      this.sentenceQueue = sentences;
      this.currentQueueIndex = 0;
      this.pausedSentenceOffset = offsetSec;

      // Start playback
      await this.start();
    } catch (error) {
      this.playbackState = PlaybackState.ERROR;
      throw error;
    }
  }

  private async loadNextPageSentences(): Promise<boolean> {
    if (!this.sentenceIndex || !this.currentLocator) return false;

    try {
      // For PDF, increment page number
      if (this.currentLocator.type === "pdf" && this.currentLocator.page) {
        // Create a clean locator for the next page (start from beginning)
        const nextPageLocator: TTSLocator = {
          type: "pdf",
          page: this.currentLocator.page + 1,
          // DON'T include char offset - start from beginning of page
          // Remove: char: this.currentLocator.char
        };

        console.log(`📖 Loading sentences from page ${nextPageLocator.page}`);

        // Build index for next page
        await this.sentenceIndex.buildIndex(this.bookId!, nextPageLocator);

        // Get sentences from next page (will get ALL sentences from start)
        const nextPageSentences =
          await this.sentenceIndex.getSentencesFromLocator(nextPageLocator);

        if (nextPageSentences.length > 0) {
          // Navigate to next page in PDF viewer (will go to top of page)
          const pdfAdapter = this.adapters.get("pdf");
          if (pdfAdapter && "goToLocator" in pdfAdapter) {
            await (pdfAdapter as any).goToLocator(nextPageLocator);
          }

          // Append new sentences to queue
          this.sentenceQueue.push(...nextPageSentences);
          this.currentLocator = nextPageLocator;

          console.log(
            `✅ Loaded ${nextPageSentences.length} sentences from page ${nextPageLocator.page}`
          );

          // Continue synthesis pipeline for new sentences
          this.startSynthesisPipeline();

          return true;
        }
      }
    } catch (error) {
      console.error("Failed to load next page sentences:", error);
    }

    return false;
  }

  async resumeFromBookmark() {
    if (!this.bookId || !this.storage || !this.sentenceIndex) {
      throw new Error("TTS not properly initialized");
    }

    const bookmark = await this.storage.loadBookmark(this.bookId);
    if (!bookmark?.lastSentenceId) {
      throw new Error("No bookmark found");
    }

    const sentence = await this.sentenceIndex.getSentence(
      bookmark.lastSentenceId
    );
    if (!sentence) {
      throw new Error("Bookmarked sentence not found");
    }

    const locator: TTSLocator = sentence.cfi_start
      ? {
          type: "epub",
          sentenceId: sentence.id,
          cfi: sentence.cfi_start,
        }
      : {
          type: "pdf",
          sentenceId: sentence.id,
          page: sentence.page!,
          char: sentence.char_start,
        };

    await this.playFromLocator(locator, bookmark.offsetSec || 0);
  }

  getSettings(): Readonly<{ voice: string; rate: number; volume: number }> {
    return {
      voice: this.settings.voice || "af_heart",
      rate: this.settings.rate || 1.0,
      volume: this.settings.volume || 1.0,
    };
  }

  // Add this method to get current playback position
  getCurrentLocator(): TTSLocator | null {
    if (!this.currentPlayingSentenceId) return null;

    const currentSentence = this.sentenceQueue.find(
      (s) => s.id === this.currentPlayingSentenceId
    );

    if (!currentSentence) return null;

    // Calculate current offset within the sentence
    let offsetMs = 0;
    if (this.audioContext && this.scheduledSources.length > 0) {
      const currentTime = this.audioContext.currentTime;
      const currentSource = this.scheduledSources.find(
        (s) => s.sentenceId === this.currentPlayingSentenceId
      );
      if (currentSource) {
        const elapsed = currentTime - currentSource.startTime;
        offsetMs = Math.max(0, elapsed * 1000);
      }
    }

    const locator: TTSLocator = currentSentence.cfi_start
      ? {
          type: "epub",
          sentenceId: currentSentence.id,
          cfi: currentSentence.cfi_start,
          offsetMs,
        }
      : {
          type: "pdf",
          sentenceId: currentSentence.id,
          page: currentSentence.page!,
          char: currentSentence.char_start,
          offsetMs,
        };

    return locator;
  }

  private async start() {
    if (!this.audioContext || !this.synthesizer) return;

    // Ensure AudioContext is running
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    this.playbackState = PlaybackState.PLAYING;
    this.emit("playbackStarted");

    // Start both pipelines
    this.startSynthesisPipeline();
    this.startPlaybackPipeline();
  }

  private async startSynthesisPipeline() {
    const currentPlaybackId = this.playbackId;

    while (
      this.playbackState === PlaybackState.PLAYING &&
      currentPlaybackId === this.playbackId
    ) {
      // Check if we need to synthesize more sentences
      const needsMoreBuffers = this.bufferQueue.length < this.maxBufferSize;
      const nextIndex = this.currentQueueIndex + this.bufferQueue.length;
      const hasMoreSentences = nextIndex < this.sentenceQueue.length;

      if (needsMoreBuffers && hasMoreSentences) {
        const sentence = this.sentenceQueue[nextIndex];

        if (sentence && !this.synthesisInProgress.has(sentence.id)) {
          this.synthesisInProgress.add(sentence.id);

          try {
            const audioBuffer = await this.synthesizeSentence(
              sentence,
              currentPlaybackId
            );

            if (audioBuffer && currentPlaybackId === this.playbackId) {
              this.bufferQueue.push({
                sentenceId: sentence.id,
                sentence,
                audioBuffer,
                duration: audioBuffer.duration,
              });

              console.log(
                `📦 Buffered sentence ${nextIndex + 1}/${
                  this.sentenceQueue.length
                }, queue size: ${this.bufferQueue.length}`
              );
            }
          } catch (error) {
            console.error("Failed to synthesize sentence:", error);
          } finally {
            this.synthesisInProgress.delete(sentence.id);
          }
        }
      }

      // Check if we're near the end of the current page and should pre-load next page
      const nearEndOfQueue = nextIndex >= this.sentenceQueue.length - 2;
      if (
        nearEndOfQueue &&
        this.isContinuousMode &&
        this.currentLocator?.type === "pdf"
      ) {
        // Pre-emptively load next page sentences while still playing current page
        const nextPageLocator: TTSLocator = {
          type: "pdf",
          page: (this.currentLocator.page || 0) + 1,
        };

        // Check if next page exists without loading it yet
        try {
          await this.sentenceIndex?.buildIndex(this.bookId!, nextPageLocator);
          const nextPageSentences =
            (await this.sentenceIndex?.getSentencesFromLocator(
              nextPageLocator
            )) || [];

          if (
            nextPageSentences.length > 0 &&
            !this.sentenceQueue.some((s) => nextPageSentences[0].id === s.id)
          ) {
            console.log(
              `📖 Pre-loading ${nextPageSentences.length} sentences from page ${nextPageLocator.page}`
            );
            this.sentenceQueue.push(...nextPageSentences);
          }
        } catch (error) {
          console.log("No next page available for pre-loading");
        }
      }

      // Exit condition: no more sentences and no more buffers
      if (!hasMoreSentences && this.bufferQueue.length === 0) {
        console.log("📚 Synthesis pipeline: No more sentences to synthesize");
        break;
      }

      // Small delay to prevent tight loop
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log("🔚 Synthesis pipeline ended");
  }

  private async synthesizeSentence(
    sentence: TTSSentence,
    playbackId: string
  ): Promise<AudioBuffer | null> {
    if (!this.synthesizer || !this.audioContext) return null;

    try {
      // Check abort signal
      if (this.synthesisAbortController?.signal.aborted) {
        return null;
      }

      const arrayBuffer = await this.synthesizer.synthesize(
        sentence.text,
        this.settings
      );

      // Check if playback was cancelled during synthesis
      if (playbackId !== this.playbackId) {
        return null;
      }

      const audioBuffer = await this.audioContext.decodeAudioData(
        arrayBuffer.slice(0)
      );

      return audioBuffer;
    } catch (error) {
      console.error("Synthesis error:", error);
      return null;
    }
  }

  private async startPlaybackPipeline() {
    const currentPlaybackId = this.playbackId;

    while (
      this.playbackState === PlaybackState.PLAYING &&
      currentPlaybackId === this.playbackId &&
      this.audioContext
    ) {
      // Schedule any available buffers
      while (
        this.bufferQueue.length > 0 &&
        this.playbackState === PlaybackState.PLAYING
      ) {
        const buffered = this.bufferQueue.shift();
        if (!buffered) break;

        await this.scheduleBuffer(buffered, currentPlaybackId);
        this.currentQueueIndex++;
      }

      // Wait for more buffers or check if done
      if (
        this.currentQueueIndex >= this.sentenceQueue.length &&
        this.scheduledSources.length === 0
      ) {
        // Playback complete
        this.emit("playbackEnded");
        this.playbackState = PlaybackState.IDLE;
        break;
      }

      // Wait a bit before checking again
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  private async scheduleBuffer(
    buffered: BufferedSentence,
    playbackId: string
  ): Promise<void> {
    if (
      !this.audioContext ||
      !this.gainNode ||
      playbackId !== this.playbackId
    ) {
      return;
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = buffered.audioBuffer;
    source.connect(this.gainNode);

    // Calculate when this buffer should start
    const currentTime = this.audioContext.currentTime;
    let startTime: number;
    let startOffset = 0;

    if (this.scheduledSources.length === 0) {
      // First buffer or resuming from pause
      startTime = currentTime;
      if (this.pausedSentenceOffset > 0 && this.currentQueueIndex === 0) {
        // Resume from middle of sentence
        startOffset = this.pausedSentenceOffset;
        this.pausedSentenceOffset = 0;
      }
    } else {
      // Schedule after the last buffer
      startTime = this.lastScheduledEndTime;
    }

    // Apply playback rate to duration
    const adjustedDuration =
      (buffered.duration - startOffset) / this.settings.rate;
    const endTime = startTime + adjustedDuration;

    // Set up source event handlers
    source.onended = async () => {
      if (playbackId !== this.playbackId) return;

      // Remove from scheduled sources
      const index = this.scheduledSources.findIndex((s) => s.source === source);
      if (index !== -1) {
        this.scheduledSources.splice(index, 1);
      }

      // Check if we're approaching the end and need to load more
      const isLastScheduledSource = this.scheduledSources.length === 0;
      const noMoreBuffers = this.bufferQueue.length === 0;
      const reachedEndOfQueue =
        this.currentQueueIndex >= this.sentenceQueue.length;

      if (isLastScheduledSource && noMoreBuffers && reachedEndOfQueue) {
        // We've truly reached the end of current content

        if (this.isContinuousMode && this.currentLocator?.type === "pdf") {
          console.log(
            "📚 End of page reached, attempting to load next page..."
          );

          // Small delay to ensure everything is cleaned up
          await new Promise((resolve) => setTimeout(resolve, 100));

          const hasNextPage = await this.loadNextPageSentences();

          if (hasNextPage) {
            console.log("✅ Next page loaded, continuing playback");
            // Ensure playback continues - restart pipelines if needed
            if (this.playbackState === PlaybackState.PLAYING) {
              // Force restart both pipelines
              this.startSynthesisPipeline();
              this.startPlaybackPipeline();
            }
          } else {
            console.log("📖 No more pages, ending playback");
            this.emit("playbackEnded");
            this.playbackState = PlaybackState.IDLE;
          }
        } else {
          this.emit("playbackEnded");
          this.playbackState = PlaybackState.IDLE;
        }
      }
    };
    // Schedule the source
    source.playbackRate.value = this.settings.rate;
    source.start(startTime, startOffset);

    // Track the scheduled source
    const scheduled: ScheduledSource = {
      sentenceId: buffered.sentenceId,
      source,
      startTime,
      duration: adjustedDuration,
      sentence: buffered.sentence,
    };

    this.scheduledSources.push(scheduled);
    this.lastScheduledEndTime = endTime;

    // Emit sentence event when it starts playing
    const timeUntilStart = Math.max(0, startTime - currentTime);
    setTimeout(() => {
      if (
        playbackId === this.playbackId &&
        this.playbackState === PlaybackState.PLAYING
      ) {
        this.currentPlayingSentenceId = buffered.sentenceId;
        this.emit("sentence", buffered.sentence);

        // Update highlight
        for (const adapter of this.adapters.values()) {
          if (adapter.highlight) {
            adapter.highlight(buffered.sentenceId, buffered.sentence);
          }
        }

        // Save bookmark
        this.saveBookmark();
      }
    }, timeUntilStart * 1000);

    console.log(
      `🎵 Scheduled sentence ${this.currentQueueIndex}/${
        this.sentenceQueue.length
      } to play at ${startTime.toFixed(2)}`
    );
  }

  async pause() {
    if (this.playbackState !== PlaybackState.PLAYING) {
      console.warn("Cannot pause from state:", this.playbackState);
      return;
    }

    if (!this.audioContext) return;

    this.playbackState = PlaybackState.PAUSED;
    this.pausedAtTime = this.audioContext.currentTime;

    // Find the currently playing sentence and calculate offset
    for (const scheduled of this.scheduledSources) {
      const endTime = scheduled.startTime + scheduled.duration;
      if (
        this.pausedAtTime >= scheduled.startTime &&
        this.pausedAtTime < endTime
      ) {
        // This is the currently playing sentence
        this.pausedSentenceOffset =
          (this.pausedAtTime - scheduled.startTime) * this.settings.rate;
        this.currentPlayingSentenceId = scheduled.sentenceId;

        // Adjust queue index to restart from this sentence
        const sentenceIndex = this.sentenceQueue.findIndex(
          (s) => s.id === scheduled.sentenceId
        );
        if (sentenceIndex !== -1) {
          this.currentQueueIndex = sentenceIndex;
        }
        break;
      }
    }

    // Stop all scheduled sources
    for (const scheduled of this.scheduledSources) {
      try {
        scheduled.source.stop();
      } catch (e) {
        // Source might have already ended
      }
    }
    this.scheduledSources = [];

    // Clear buffer queue but keep synthesis results for quick resume
    // We'll re-synthesize if needed on resume

    await this.audioContext.suspend();
    this.saveBookmark();
    this.emit("paused");
  }

  async resume() {
    if (this.playbackState !== PlaybackState.PAUSED) {
      console.warn("Cannot resume from state:", this.playbackState);
      return;
    }

    if (!this.audioContext) return;

    // Clear buffers to ensure fresh synthesis with current position
    this.bufferQueue = [];
    this.synthesisInProgress.clear();
    this.lastScheduledEndTime = 0;

    await this.audioContext.resume();

    this.playbackState = PlaybackState.PLAYING;
    this.emit("resumed");

    // Restart pipelines from saved position
    this.startSynthesisPipeline();
    this.startPlaybackPipeline();
  }

  async stop() {
    const wasPlaying =
      this.playbackState === PlaybackState.PLAYING ||
      this.playbackState === PlaybackState.PAUSED;

    this.playbackState = PlaybackState.STOPPED;

    // Abort synthesis
    if (this.synthesisAbortController) {
      this.synthesisAbortController.abort();
      this.synthesisAbortController = null;
    }

    // Clear playback ID
    this.playbackId = "";

    // Stop all scheduled sources
    for (const scheduled of this.scheduledSources) {
      try {
        scheduled.source.stop();
      } catch (e) {
        // Source might have already ended
      }
    }
    this.scheduledSources = [];

    // Clear buffers
    this.bufferQueue = [];
    this.synthesisInProgress.clear();

    // Reset state
    this.currentQueueIndex = 0;
    this.sentenceQueue = [];
    this.currentPlayingSentenceId = null;
    this.pausedSentenceOffset = 0;
    this.lastScheduledEndTime = 0;

    // Suspend audio context
    if (this.audioContext && this.audioContext.state === "running") {
      await this.audioContext.suspend();
    }

    // Clear highlights
    for (const adapter of this.adapters.values()) {
      if (adapter.clearHighlight) {
        adapter.clearHighlight();
      }
    }

    if (wasPlaying) {
      this.emit("stopped");
    }

    this.playbackState = PlaybackState.IDLE;
  }

  async nextSentence() {
    if (!this.currentPlayingSentenceId || this.sentenceQueue.length === 0)
      return;

    // Find current sentence index
    const currentIndex = this.sentenceQueue.findIndex(
      (s) => s.id === this.currentPlayingSentenceId
    );

    if (currentIndex === -1 || currentIndex >= this.sentenceQueue.length - 1) {
      return; // No next sentence
    }

    const nextSentence = this.sentenceQueue[currentIndex + 1];

    // Stop current playback and start from next sentence
    await this.stop();

    const locator: TTSLocator = nextSentence.cfi_start
      ? {
          type: "epub",
          sentenceId: nextSentence.id,
          cfi: nextSentence.cfi_start,
        }
      : {
          type: "pdf",
          sentenceId: nextSentence.id,
          page: nextSentence.page!,
          char: nextSentence.char_start,
        };

    await this.playFromLocator(locator, 0);
  }

  async prevSentence() {
    if (!this.currentPlayingSentenceId || this.sentenceQueue.length === 0)
      return;

    // Find current sentence index
    const currentIndex = this.sentenceQueue.findIndex(
      (s) => s.id === this.currentPlayingSentenceId
    );

    if (currentIndex <= 0) {
      // If at beginning or not found, restart current sentence
      const currentSentence = this.sentenceQueue[0];
      await this.stop();

      const locator: TTSLocator = currentSentence.cfi_start
        ? {
            type: "epub",
            sentenceId: currentSentence.id,
            cfi: currentSentence.cfi_start,
          }
        : {
            type: "pdf",
            sentenceId: currentSentence.id,
            page: currentSentence.page!,
            char: currentSentence.char_start,
          };

      await this.playFromLocator(locator, 0);
      return;
    }

    const prevSentence = this.sentenceQueue[currentIndex - 1];

    // Stop current playback and start from previous sentence
    await this.stop();

    const locator: TTSLocator = prevSentence.cfi_start
      ? {
          type: "epub",
          sentenceId: prevSentence.id,
          cfi: prevSentence.cfi_start,
        }
      : {
          type: "pdf",
          sentenceId: prevSentence.id,
          page: prevSentence.page!,
          char: prevSentence.char_start,
        };

    await this.playFromLocator(locator, 0);
  }

  setVoice(voice: string) {
    this.settings.voice = voice;

    // Clear all pending buffers to force re-synthesis with new voice
    this.bufferQueue = [];
    this.synthesisInProgress.clear();

    // Stop any ongoing synthesis
    if (this.synthesisAbortController) {
      this.synthesisAbortController.abort();
      this.synthesisAbortController = new AbortController();
    }

    this.saveSettings();
    this.emit("voiceChanged", voice);
  }

  setRate(rate: number) {
    const newRate = Math.max(0.25, Math.min(4.0, rate));

    // Update playback rate for currently playing sources
    for (const scheduled of this.scheduledSources) {
      scheduled.source.playbackRate.value = newRate;
    }

    this.settings.rate = newRate;
    this.saveSettings();
  }

  setVolume(volume: number) {
    this.settings.volume = Math.max(0, Math.min(1.0, volume));

    if (this.gainNode) {
      this.gainNode.gain.value = this.settings.volume;
    }

    this.saveSettings();
  }

  private async saveBookmark() {
    if (!this.bookId || !this.currentPlayingSentenceId || !this.storage) return;

    try {
      const currentSentence = this.sentenceQueue.find(
        (s) => s.id === this.currentPlayingSentenceId
      );

      if (currentSentence) {
        const bookmark = {
          lastSentenceId: this.currentPlayingSentenceId,
          offsetSec: this.pausedSentenceOffset,
          cfi: currentSentence.cfi_start,
          page: currentSentence.page,
          timestamp: new Date().toISOString(),
        };

        await this.storage.saveBookmark(this.bookId, bookmark);
      }
    } catch (error) {
      console.error("Failed to save bookmark:", error);
    }
  }

  private async saveSettings() {
    if (!this.bookId || !this.storage) return;

    try {
      await this.storage.saveSettings(this.bookId, this.settings);
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  }

  getState(): PlaybackState {
    return this.playbackState;
  }

  getCurrentSentence(): TTSSentence | null {
    if (!this.currentPlayingSentenceId) return null;
    return (
      this.sentenceQueue.find((s) => s.id === this.currentPlayingSentenceId) ||
      null
    );
  }

  getProgress(): { current: number; total: number } {
    return {
      current: this.currentQueueIndex,
      total: this.sentenceQueue.length,
    };
  }

  destroy() {
    this.stop();

    // Clear adapters
    for (const adapter of this.adapters.values()) {
      adapter.destroy();
    }
    this.adapters.clear();

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    // Clear references
    this.synthesizer = null;
    this.storage = null;
    this.sentenceIndex = null;
    this.gainNode = null;

    this.removeAllListeners();
  }
}
