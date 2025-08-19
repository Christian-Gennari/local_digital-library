// src/components/TTSPlayer.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  PlayIcon,
  PauseIcon,
  StopIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { TTSController, PlaybackState } from "../services/TTSController";
import { KokoroSynthesizer } from "../services/KokoroSynthesizer";
import { LocalTTSStorage, SentenceIndexer } from "../services/SentenceIndexer";
import { EPUBAdapter } from "../adapters/EPUBAdapter";
import { PDFAdapter } from "../adapters/PDFAdapter";
import type { TTSLocator } from "../services/TTSController";

interface TTSPlayerProps {
  bookId: string;
  bookType: "epub" | "pdf";
  // For EPUB
  epubBook?: any;
  epubRendition?: any;
  // For PDF
  pdfDocument?: any;
  pdfContainer?: HTMLElement;
  // UI props
  className?: string;
  onClose?: () => void;
}

interface Voice {
  id: string;
  name: string;
  gender: string;
  displayName?: string;
}

export function TTSPlayer({
  bookId,
  bookType,
  epubBook,
  epubRendition,
  pdfDocument,
  pdfContainer,
  className = "",
  onClose,
}: TTSPlayerProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(
    PlaybackState.IDLE
  );
  const [isLoading, setIsLoading] = useState(false);
  const [currentSentence, setCurrentSentence] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Settings
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState("af_sky");
  const [rate, setRate] = useState(1.0);
  const [volume, setVolume] = useState(1.0);

  // Core TTS system
  const ttsControllerRef = useRef<TTSController | null>(null);
  const synthesizerRef = useRef<KokoroSynthesizer | null>(null);
  const indexerRef = useRef<SentenceIndexer | null>(null);
  const storageRef = useRef<LocalTTSStorage | null>(null);
  const adapterRef = useRef<EPUBAdapter | PDFAdapter | null>(null);
  const [isAvailable, setIsAvailable] = useState(true);

  const checkTTSAvailability = async () => {
    try {
      const response = await fetch("/api/tts/status");
      if (response.ok) {
        const status = await response.json();
        setIsAvailable(status.available);
      }
    } catch {
      setIsAvailable(false);
    }
  };

  // Initialize TTS system
  useEffect(() => {
    initializeTTS();
    loadVoices();
    checkTTSAvailability();
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, bookType]);

  // Update adapters when props change
  useEffect(() => {
    if (!isInitialized) return;
    updateAdapter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epubBook, epubRendition, pdfDocument, pdfContainer, isInitialized]);

  const initializeTTS = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Create core components
      synthesizerRef.current = new KokoroSynthesizer();
      storageRef.current = new LocalTTSStorage();
      ttsControllerRef.current = new TTSController();
      indexerRef.current = new SentenceIndexer(
        storageRef.current,
        ttsControllerRef.current
      );

      // Set current book for indexer
      indexerRef.current.setCurrentBook(bookId);

      // Create appropriate adapter
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

      // Hydrate UI state from controller's saved settings
      const settings = ttsControllerRef.current.getSettings();
      setSelectedVoice(settings.voice);
      setRate(settings.rate);
      setVolume(settings.volume);

      setIsInitialized(true);
      setIsLoading(false);
    } catch (error) {
      console.error("TTS initialization failed:", error);
      setError("Failed to initialize text-to-speech");
      setIsLoading(false);
    }
  };

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
    if (adapterRef.current) {
      adapterRef.current.destroy();
      adapterRef.current = null;
    }
    await createAdapter();
    // If your controller needs re-registration, handle it here.
  };

  const setupEventHandlers = () => {
    if (!ttsControllerRef.current) return;

    const controller = ttsControllerRef.current;

    controller.on("playbackStarted", () => {
      setPlaybackState(PlaybackState.PLAYING);
      setError(null); // ✅ clear warning once we actually start
    });

    controller.on("paused", () => {
      setPlaybackState(PlaybackState.PAUSED);
    });

    controller.on("resumed", () => {
      setPlaybackState(PlaybackState.PLAYING);
      setError(null); // ✅ also clear if we successfully resume
    });

    controller.on("stopped", () => {
      setPlaybackState(PlaybackState.IDLE);
      setCurrentSentence(null);
    });

    controller.on("sentence", (sentence) => {
      setCurrentSentence(sentence);
    });

    controller.on("playbackEnded", () => {
      setPlaybackState(PlaybackState.IDLE);
      setCurrentSentence(null);
    });
  };

  const loadVoices = async () => {
    try {
      const response = await fetch("/api/tts/voices");
      if (response.ok) {
        const voiceData = await response.json();
        const mappedVoices = voiceData.map((v: any) => ({
          ...v,
          displayName: v.name || v.id,
        }));
        setVoices(mappedVoices);
      }
    } catch (error) {
      console.error("Failed to load voices:", error);
    }
  };

  const handleStartHere = async (locator: TTSLocator) => {
    if (!ttsControllerRef.current) return;
    try {
      await ttsControllerRef.current.playFromLocator(locator);
      setError(null); // ✅ user provided a location; clear the warning
    } catch (error) {
      console.error("Failed to start playback:", error);
      setError("Failed to start text-to-speech");
    }
  };

  const handlePlay = async () => {
    if (!ttsControllerRef.current) return;

    try {
      setError(null); // optimistic clear; controller events will also clear definitively
      const state = ttsControllerRef.current.getState();

      switch (state) {
        case PlaybackState.PAUSED:
          await ttsControllerRef.current.resume();
          setError(null); // ✅ resumed successfully
          break;
        case PlaybackState.IDLE:
        case PlaybackState.STOPPED:
          try {
            await ttsControllerRef.current.resumeFromBookmark();
            setError(null); // ✅ resumed from bookmark successfully
          } catch {
            setError("Double-tap text to choose a starting point");
          }
          break;
        case PlaybackState.PLAYING:
          // no-op
          break;
        default:
          console.warn("Unexpected state:", state);
      }
    } catch (error) {
      console.error("Failed to start/resume playback:", error);
      setError("Could not start playback. Try double-tapping text first.");
    }
  };

  const handlePause = async () => {
    if (!ttsControllerRef.current) return;
    try {
      const state = ttsControllerRef.current.getState();
      if (state === PlaybackState.PLAYING) {
        await ttsControllerRef.current.pause();
      }
    } catch (error) {
      console.error("Failed to pause:", error);
    }
  };

  const handleStop = async () => {
    if (!ttsControllerRef.current) return;
    try {
      await ttsControllerRef.current.stop();
    } catch (error) {
      console.error("Failed to stop:", error);
    }
  };

  const handleVoiceChange = async (voiceId: string) => {
    setSelectedVoice(voiceId);
    if (!ttsControllerRef.current) return;

    const wasPlaying = playbackState === PlaybackState.PLAYING;
    const currentLocator = wasPlaying
      ? ttsControllerRef.current.getCurrentLocator()
      : null;

    ttsControllerRef.current.setVoice(voiceId);

    if (wasPlaying && currentLocator) {
      await ttsControllerRef.current.stop();
      await ttsControllerRef.current.playFromLocator(
        currentLocator,
        currentLocator.offsetMs || 0
      );
      setError(null); // ✅ restarted cleanly with new voice
    }
  };

  const handleRateChange = (newRate: number) => {
    setRate(newRate);
    if (ttsControllerRef.current) {
      ttsControllerRef.current.setRate(newRate);
    }
  };

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

  // Derived UI states
  const isPlaying = playbackState === PlaybackState.PLAYING;
  const isPaused = playbackState === PlaybackState.PAUSED;
  const canPlay =
    playbackState === PlaybackState.IDLE ||
    playbackState === PlaybackState.PAUSED ||
    playbackState === PlaybackState.STOPPED;

  if (!isInitialized && isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="animate-spin h-4 w-4 border-2 border-primary/80 border-t-transparent rounded-full" />
        <span className="text-[11px] theme-text-secondary">
          Initializing TTS…
        </span>
      </div>
    );
  }

  return (
    <div className={`space-y-1 ${className}`}>
      {/* Compact pill toolbar */}
      <div
        className={[
          "inline-flex items-center gap-1 rounded-xl border theme-border theme-bg-primary/80",
          "backdrop-blur px-2 py-1 shadow-sm",
        ].join(" ")}
      >
        {/* Close integrated into the group (left edge) */}
        {onClose && (
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close TTS"
            className={[
              "p-1 rounded-lg hover\:theme-bg-tertiary focus:outline-none focus:ring-1 focus:ring-slate-300",
              "theme-text-secondary hover\:theme-text-primary",
            ].join(" ")}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}

        {/* Divider */}
        {onClose && <span className="mx-1 h-4 w-px theme-bg-tertiary" />}

        {/* Error glyph (compact) */}
        {error && (
          <span
            className="text-[11px] text-red-600 px-1"
            title={error}
            aria-live="polite"
          >
            ⚠︎
          </span>
        )}

        {/* Play / Pause */}
        <button
          onClick={isPlaying ? handlePause : handlePlay}
          disabled={isLoading || (!canPlay && !isPlaying)}
          title={isPlaying ? "Pause" : isPaused ? "Resume" : "Play"}
          className={[
            "p-1 rounded-lg hover\:theme-bg-tertiary disabled:opacity-50",
            "focus:outline-none focus:ring-1 focus:ring-slate-300",
          ].join(" ")}
        >
          {isLoading ? (
            <div className="animate-spin h-4 w-4 border-2 border-primary/80 border-t-transparent rounded-full" />
          ) : isPlaying ? (
            <PauseIcon className="h-4 w-4" />
          ) : (
            <PlayIcon className="h-4 w-4" />
          )}
        </button>

        {/* Stop */}
        <button
          onClick={handleStop}
          disabled={!isPlaying && !isPaused}
          title="Stop"
          className={[
            "p-1 rounded-lg hover\:theme-bg-tertiary disabled:opacity-50",
            "focus:outline-none focus:ring-1 focus:ring-slate-300",
          ].join(" ")}
        >
          <StopIcon className="h-4 w-4" />
        </button>

        {/* Divider */}
        <span className="mx-1 h-4 w-px theme-bg-tertiary" />

        {/* Voice Selector (compact) */}
        <label className="sr-only" htmlFor="tts-voice-select">
          Select voice
        </label>
        <select
          id="tts-voice-select"
          value={selectedVoice}
          onChange={(e) => handleVoiceChange(e.target.value)}
          disabled={!isAvailable || voices.length === 0}
          title="Select voice"
          className={[
            "px-2 py-1 text-[11px] border theme-border rounded-lg",
            "theme-bg-primary focus:outline-none focus:ring-1 focus:ring-slate-300",
            "max-w-[160px] truncate",
            "disabled:opacity-50",
          ].join(" ")}
        >
          {voices.length === 0 ? (
            <option value="">Loading…</option>
          ) : (
            voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.displayName || voice.name || voice.id}
              </option>
            ))
          )}
        </select>

        {/* Speed (tap to cycle) */}
        <button
          onClick={() => {
            const newRate = rate >= 2.0 ? 0.5 : rate + 0.25;
            handleRateChange(newRate);
          }}
          title={`Speed: ${rate}× (click to change)`}
          className={[
            "ml-1 px-2 py-1 text-[11px] border theme-border rounded-lg",
            "theme-bg-primary hover\:theme-bg-secondary",
            "focus:outline-none focus:ring-1 focus:ring-slate-300",
          ].join(" ")}
        >
          {rate}×
        </button>
      </div>

      {/* Now-playing line (single row, truncates) */}
      {currentSentence && (
        <div className="text-[11px] leading-tight theme-text-secondary max-w-[360px] truncate">
          {currentSentence.text}
        </div>
      )}
    </div>
  );
}
