// src/hooks/useTTSPlaybook.ts
// Comprehensive hook that provides a simple interface to the full TTS system

import { useRef, useEffect, useState, useCallback } from "react";
import {
  TTSController,
  TTSLocator,
  TTSSentence,
} from "../services/TTSController";
import { KokoroSynthesizer } from "../services/KokoroSynthesizer";
import { LocalTTSStorage, SentenceIndexer } from "../services/SentenceIndexer";
import { EPUBAdapter } from "../adapters/EPUBAdapter";
import { PDFAdapter } from "../adapters/PDFAdapter";
import { TTSUtils } from "../utils/ttsUtils";
import { TTSPerformanceMonitor, TTSErrorRecovery } from "../utils/ttsUtils";

interface TTSState {
  isInitialized: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  isLoading: boolean;
  currentSentence: TTSSentence | null;
  error: string | null;
  progress: {
    currentSentenceIndex: number;
    totalSentences: number;
    percentage: number;
  };
  settings: {
    voice: string;
    rate: number;
    volume: number;
  };
}

interface TTSHookOptions {
  bookId: string;
  bookType: "epub" | "pdf";
  // EPUB specific
  epubBook?: any;
  epubRendition?: any;
  // PDF specific
  pdfDocument?: any;
  pdfContainer?: HTMLElement;
  // Options
  autoResume?: boolean; // Resume from last position on init
  enablePerformanceMonitoring?: boolean;
  enableErrorRecovery?: boolean;
  onSentenceChange?: (sentence: TTSSentence) => void;
  onProgress?: (progress: {
    current: number;
    total: number;
    percentage: number;
  }) => void;
  onError?: (error: string) => void;
}

export function useTTSPlaybook(options: TTSHookOptions) {
  const {
    bookId,
    bookType,
    epubBook,
    epubRendition,
    pdfDocument,
    pdfContainer,
    autoResume = true,
    enablePerformanceMonitoring = true,
    enableErrorRecovery = true,
    onSentenceChange,
    onProgress,
    onError,
  } = options;

  // State
  const [state, setState] = useState<TTSState>({
    isInitialized: false,
    isPlaying: false,
    isPaused: false,
    isLoading: false,
    currentSentence: null,
    error: null,
    progress: {
      currentSentenceIndex: 0,
      totalSentences: 0,
      percentage: 0,
    },
    settings: {
      voice: "af_heart",
      rate: 1.0,
      volume: 1.0,
    },
  });

  // Core system refs
  const ttsControllerRef = useRef<TTSController | null>(null);
  const synthesizerRef = useRef<KokoroSynthesizer | null>(null);
  const indexerRef = useRef<SentenceIndexer | null>(null);
  const storageRef = useRef<LocalTTSStorage | null>(null);
  const adapterRef = useRef<EPUBAdapter | PDFAdapter | null>(null);

  // Utility refs
  const performanceMonitorRef = useRef<TTSPerformanceMonitor | null>(null);
  const errorRecoveryRef = useRef<TTSErrorRecovery | null>(null);

  // Available voices
  const [availableVoices, setAvailableVoices] = useState<any[]>([]);

  // Initialize the TTS system
  useEffect(() => {
    initializeTTS();
    return () => cleanup();
  }, [bookId, bookType]);

  // Update adapters when props change
  useEffect(() => {
    if (state.isInitialized) {
      updateAdapter();
    }
  }, [epubBook, epubRendition, pdfDocument, pdfContainer, state.isInitialized]);

  const initializeTTS = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      // Initialize utilities
      if (enablePerformanceMonitoring) {
        performanceMonitorRef.current = new TTSPerformanceMonitor();
        performanceMonitorRef.current.startTimer("initialization");
      }

      if (enableErrorRecovery) {
        errorRecoveryRef.current = new TTSErrorRecovery();
      }

      // Initialize core components
      synthesizerRef.current = new KokoroSynthesizer();
      storageRef.current = new LocalTTSStorage();
      indexerRef.current = new SentenceIndexer(storageRef.current);
      ttsControllerRef.current = new TTSController();

      // Set current book for indexer
      indexerRef.current.setCurrentBook(bookId);

      // Create adapter
      await createAdapter();

      // Initialize TTS Controller
      await ttsControllerRef.current.init({
        synthesizer: synthesizerRef.current,
        storage: storageRef.current,
        sentenceIndex: indexerRef.current,
        adapters: {
          epub:
            bookType === "epub"
              ? (adapterRef.current as EPUBAdapter)
              : undefined,
          pdf:
            bookType === "pdf" ? (adapterRef.current as PDFAdapter) : undefined,
        },
      });

      // Set up event handlers
      setupEventHandlers();

      // Set current book and load settings
      await ttsControllerRef.current.setBook(bookId);

      // Load voices
      await loadVoices();

      // Performance monitoring
      if (performanceMonitorRef.current) {
        performanceMonitorRef.current.endTimer("initialization");
      }

      setState((prev) => ({ ...prev, isInitialized: true, isLoading: false }));

      // Auto-resume if enabled
      if (autoResume) {
        setTimeout(() => tryAutoResume(), 1000);
      }
    } catch (error) {
      const errorMessage = TTSUtils.getReadableErrorMessage(error as Error);
      console.error("TTS initialization failed:", error);
      setState((prev) => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
      }));
      onError?.(errorMessage);
    }
  }, [
    bookId,
    bookType,
    autoResume,
    enablePerformanceMonitoring,
    enableErrorRecovery,
  ]);

  const createAdapter = async () => {
    if (bookType === "epub" && epubBook && epubRendition) {
      adapterRef.current = new EPUBAdapter(epubBook, epubRendition);
    } else if (bookType === "pdf" && pdfDocument && pdfContainer) {
      adapterRef.current = new PDFAdapter(pdfDocument, pdfContainer);
    }

    if (adapterRef.current) {
      adapterRef.current.onStartHere((locator) => {
        handleStartHere(locator);
      });
    }
  };

  const updateAdapter = async () => {
    // Clean up old adapter
    if (adapterRef.current) {
      adapterRef.current.destroy();
      adapterRef.current = null;
    }

    await createAdapter();
  };

  const setupEventHandlers = () => {
    if (!ttsControllerRef.current) return;

    const controller = ttsControllerRef.current;

    controller.on("playbackStarted", () => {
      setState((prev) => ({
        ...prev,
        isPlaying: true,
        isPaused: false,
        error: null,
      }));
    });

    controller.on("paused", () => {
      setState((prev) => ({ ...prev, isPaused: true }));
    });

    controller.on("resumed", () => {
      setState((prev) => ({ ...prev, isPaused: false }));
    });

    controller.on("stopped", () => {
      setState((prev) => ({
        ...prev,
        isPlaying: false,
        isPaused: false,
        currentSentence: null,
        progress: { ...prev.progress, currentSentenceIndex: 0, percentage: 0 },
      }));
    });

    controller.on("sentence", (sentence: TTSSentence) => {
      setState((prev) => ({ ...prev, currentSentence: sentence }));
      onSentenceChange?.(sentence);
      updateProgress(sentence);
    });

    controller.on("playbackEnded", () => {
      setState((prev) => ({
        ...prev,
        isPlaying: false,
        isPaused: false,
        currentSentence: null,
        progress: { ...prev.progress, percentage: 100 },
      }));
    });
  };

  const updateProgress = async (currentSentence: TTSSentence) => {
    try {
      if (!indexerRef.current) return;

      const allSentences = await indexerRef.current.getAllSentences();
      const currentIndex = allSentences.findIndex(
        (s) => s.id === currentSentence.id
      );
      const percentage =
        allSentences.length > 0
          ? (currentIndex / allSentences.length) * 100
          : 0;

      const progress = {
        currentSentenceIndex: currentIndex,
        totalSentences: allSentences.length,
        percentage: Math.round(percentage),
      };

      setState((prev) => ({ ...prev, progress }));
      onProgress?.({
        current: currentIndex,
        total: allSentences.length,
        percentage: Math.round(percentage),
      });
    } catch (error) {
      console.warn("Failed to update progress:", error);
    }
  };

  const loadVoices = async () => {
    try {
      const response = await fetch("/api/tts/voices");
      if (response.ok) {
        const voices = await response.json();
        setAvailableVoices(voices);
      }
    } catch (error) {
      console.warn("Failed to load voices:", error);
    }
  };

  const tryAutoResume = async () => {
    if (!ttsControllerRef.current || !storageRef.current) return;

    try {
      const bookmark = await storageRef.current.loadBookmark(bookId);
      if (bookmark?.lastSentenceId) {
        // Don't auto-play, just prepare for resume
        console.log(
          "Bookmark found, ready to resume from:",
          bookmark.lastSentenceId
        );
      }
    } catch (error) {
      console.warn("Auto-resume failed:", error);
    }
  };

  const handleStartHere = async (locator: TTSLocator) => {
    if (!ttsControllerRef.current) return;

    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      TTSUtils.showStartHereIndicator(0, 0, "Starting playback...");

      if (performanceMonitorRef.current) {
        performanceMonitorRef.current.startTimer("startHere");
      }

      const playOperation = async () => {
        await ttsControllerRef.current!.playFromLocator(locator);
      };

      if (enableErrorRecovery && errorRecoveryRef.current) {
        await errorRecoveryRef.current.withRetry(playOperation, "startHere");
      } else {
        await playOperation();
      }

      if (performanceMonitorRef.current) {
        performanceMonitorRef.current.endTimer("startHere");
      }
    } catch (error) {
      const errorMessage = TTSUtils.getReadableErrorMessage(error as Error);
      console.error("Start here failed:", error);
      setState((prev) => ({ ...prev, error: errorMessage }));
      onError?.(errorMessage);
    } finally {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  };

  // Public API methods
  const play = useCallback(async () => {
    if (!ttsControllerRef.current) return;

    try {
      setState((prev) => ({ ...prev, error: null }));

      if (state.isPaused) {
        await ttsControllerRef.current.resume();
      } else {
        await ttsControllerRef.current.resumeFromBookmark();
      }
    } catch (error) {
      const errorMessage = TTSUtils.getReadableErrorMessage(error as Error);
      setState((prev) => ({ ...prev, error: errorMessage }));
      onError?.(errorMessage);
    }
  }, [state.isPaused]);

  const pause = useCallback(async () => {
    if (!ttsControllerRef.current) return;
    await ttsControllerRef.current.pause();
  }, []);

  const stop = useCallback(async () => {
    if (!ttsControllerRef.current) return;
    await ttsControllerRef.current.stop();
  }, []);

  const nextSentence = useCallback(async () => {
    if (!ttsControllerRef.current) return;
    await ttsControllerRef.current.nextSentence();
  }, []);

  const prevSentence = useCallback(async () => {
    if (!ttsControllerRef.current) return;
    await ttsControllerRef.current.prevSentence();
  }, []);

  const setVoice = useCallback((voice: string) => {
    if (!ttsControllerRef.current) return;
    ttsControllerRef.current.setVoice(voice);
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, voice },
    }));
  }, []);

  const setRate = useCallback((rate: number) => {
    if (!ttsControllerRef.current) return;
    ttsControllerRef.current.setRate(rate);
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, rate },
    }));
  }, []);

  const setVolume = useCallback((volume: number) => {
    if (!ttsControllerRef.current) return;
    ttsControllerRef.current.setVolume(volume);
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, volume },
    }));
  }, []);

  const seekToPercentage = useCallback(async (percentage: number) => {
    if (!indexerRef.current || !ttsControllerRef.current) return;

    try {
      const allSentences = await indexerRef.current.getAllSentences();
      const targetIndex = Math.floor((percentage / 100) * allSentences.length);
      const targetSentence = allSentences[targetIndex];

      if (targetSentence) {
        const locator: TTSLocator = targetSentence.cfi_start
          ? {
              type: "epub",
              sentenceId: targetSentence.id,
              cfi: targetSentence.cfi_start,
            }
          : {
              type: "pdf",
              sentenceId: targetSentence.id,
              page: targetSentence.page!,
              char: targetSentence.char_start,
            };

        await ttsControllerRef.current.playFromLocator(locator);
      }
    } catch (error) {
      console.error("Seek failed:", error);
    }
  }, []);

  const getPerformanceMetrics = useCallback(() => {
    return performanceMonitorRef.current?.getMetrics() || {};
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
    errorRecoveryRef.current?.reset();
  }, []);

  const cleanup = () => {
    if (ttsControllerRef.current) {
      ttsControllerRef.current.destroy();
      ttsControllerRef.current = null;
    }
    if (adapterRef.current) {
      adapterRef.current.destroy();
      adapterRef.current = null;
    }
    if (indexerRef.current) {
      indexerRef.current.destroy();
      indexerRef.current = null;
    }
    if (synthesizerRef.current) {
      synthesizerRef.current.clearCache();
      synthesizerRef.current = null;
    }
  };

  return {
    // State
    ...state,
    availableVoices,

    // Actions
    play,
    pause,
    stop,
    nextSentence,
    prevSentence,
    setVoice,
    setRate,
    setVolume,
    seekToPercentage,
    clearError,

    // Advanced
    getPerformanceMetrics,

    // Raw controller access for advanced use cases
    controller: ttsControllerRef.current,
    adapter: adapterRef.current,

    // Utility methods
    estimateReadingTime: (text: string) =>
      TTSUtils.estimateReadingTime(text, state.settings.rate * 150),
    formatDuration: TTSUtils.formatDuration,
    isMobile: TTSUtils.isMobileDevice(),
  };
}

// Simplified hook for basic use cases
export function useSimpleTTS(bookId: string, bookType: "epub" | "pdf") {
  const tts = useTTSPlaybook({
    bookId,
    bookType,
    autoResume: true,
    enablePerformanceMonitoring: false,
    enableErrorRecovery: true,
  });

  return {
    isReady: tts.isInitialized,
    isPlaying: tts.isPlaying,
    isPaused: tts.isPaused,
    currentText: tts.currentSentence?.text || "",
    error: tts.error,
    play: tts.play,
    pause: tts.pause,
    stop: tts.stop,
    setRate: tts.setRate,
    setVoice: tts.setVoice,
    voices: tts.availableVoices,
  };
}
