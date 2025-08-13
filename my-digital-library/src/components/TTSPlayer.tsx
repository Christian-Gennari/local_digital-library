// src/components/TTSPlayer.tsx
import React, { useEffect, useRef, useState } from "react";
import { PlayIcon, PauseIcon, StopIcon } from "@heroicons/react/24/outline";
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
  const [selectedVoice, setSelectedVoice] = useState("af_heart");
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
    } catch (error) {
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
  }, [bookId, bookType]);

  // Update adapters when props change
  useEffect(() => {
    if (!isInitialized) return;
    updateAdapter();
  }, [epubBook, epubRendition, pdfDocument, pdfContainer, isInitialized]);

  const initializeTTS = async () => {
    try {
      console.log("🎵 Starting TTS initialization...");
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
    // Clean up old adapter
    if (adapterRef.current) {
      adapterRef.current.destroy();
      adapterRef.current = null;
    }

    await createAdapter();

    // Re-register with controller if needed
    if (ttsControllerRef.current) {
      // Controller might need to be re-initialized with new adapter
      // This depends on your implementation
    }
  };

  const setupEventHandlers = () => {
    if (!ttsControllerRef.current) return;

    const controller = ttsControllerRef.current;

    controller.on("playbackStarted", () => {
      setPlaybackState(PlaybackState.PLAYING);
    });

    controller.on("paused", () => {
      setPlaybackState(PlaybackState.PAUSED);
    });

    controller.on("resumed", () => {
      setPlaybackState(PlaybackState.PLAYING);
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
        // Map voices to include displayName for better UI
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
    console.log("🎯 Starting playback from locator:", locator);

    if (!ttsControllerRef.current) {
      console.error("❌ TTS Controller not available");
      return;
    }

    try {
      await ttsControllerRef.current.playFromLocator(locator);
    } catch (error) {
      console.error("❌ Failed to start playback:", error);
      setError("Failed to start text-to-speech");
    }
  };

  const handlePlay = async () => {
    if (!ttsControllerRef.current) return;

    try {
      setError(null);
      const state = ttsControllerRef.current.getState();

      switch (state) {
        case PlaybackState.PAUSED:
          // Resume from pause
          await ttsControllerRef.current.resume();
          break;
        case PlaybackState.IDLE:
        case PlaybackState.STOPPED:
          // Start from bookmark or beginning
          try {
            await ttsControllerRef.current.resumeFromBookmark();
          } catch (bookmarkError) {
            // No bookmark, need to select starting point
            setError("Double-tap on text to select a starting point");
          }
          break;
        case PlaybackState.PLAYING:
          // Already playing, do nothing
          console.log("Already playing");
          break;
        default:
          console.warn("Unexpected state:", state);
      }
    } catch (error) {
      console.error("Failed to start/resume playback:", error);
      setError(
        "Failed to start playback. Try double-tapping on text to select a starting point."
      );
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

    // Get current locator before changing voice
    const currentLocator = wasPlaying
      ? ttsControllerRef.current.getCurrentLocator()
      : null;

    // Set the new voice
    ttsControllerRef.current.setVoice(voiceId);

    // If currently playing, restart at current position with new voice
    if (wasPlaying && currentLocator) {
      await ttsControllerRef.current.stop();
      await ttsControllerRef.current.playFromLocator(
        currentLocator,
        currentLocator.offsetMs || 0
      );
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
        <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
        <span className="text-sm text-gray-600">Initializing TTS...</span>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-1">
        {error && (
          <div className="text-xs text-red-600 mr-2" title={error}>
            ⚠️
          </div>
        )}

        <button
          onClick={isPlaying ? handlePause : handlePlay}
          disabled={isLoading || (!canPlay && !isPlaying)}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
          title={isPlaying ? "Pause" : isPaused ? "Resume" : "Play"}
        >
          {isLoading ? (
            <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
          ) : isPlaying ? (
            <PauseIcon className="h-4 w-4" />
          ) : (
            <PlayIcon className="h-4 w-4" />
          )}
        </button>

        <button
          onClick={handleStop}
          disabled={!isPlaying && !isPaused}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
          title="Stop"
        >
          <StopIcon className="h-4 w-4" />
        </button>

        {/* Voice Selector - Compact */}
        <select
          value={selectedVoice}
          onChange={(e) => handleVoiceChange(e.target.value)}
          className="ml-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          disabled={!isAvailable || voices.length === 0}
          title="Select voice"
        >
          {voices.length === 0 ? (
            <option value="">Loading...</option>
          ) : (
            voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.displayName || voice.name || voice.id}
              </option>
            ))
          )}
        </select>

        {/* Speed Control - Compact */}
        <button
          onClick={() => {
            const newRate = rate >= 2.0 ? 0.5 : rate + 0.25;
            handleRateChange(newRate);
          }}
          className="ml-1 px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100"
          title={`Speed: ${rate}x (click to change)`}
        >
          {rate}x
        </button>
      </div>

      {currentSentence && (
        <div className="text-xs text-gray-600 max-w-[300px] truncate">
          {currentSentence.text}
        </div>
      )}
    </div>
  );
}
