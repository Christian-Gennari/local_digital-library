// src/components/TTSPlayer.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  PlayIcon,
  PauseIcon,
  StopIcon,
  ForwardIcon,
  BackwardIcon,
  SpeakerWaveIcon,
  Cog6ToothIcon,
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
  compact?: boolean;
}

interface Voice {
  id: string;
  name: string;
  gender: string;
}

export function TTSPlayer({
  bookId,
  bookType,
  epubBook,
  epubRendition,
  pdfDocument,
  pdfContainer,
  className = "",
  compact = false,
}: TTSPlayerProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(PlaybackState.IDLE);
  const [isLoading, setIsLoading] = useState(false);
  const [currentSentence, setCurrentSentence] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Settings
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState("af_heart");
  const [rate, setRate] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [showSettings, setShowSettings] = useState(false);

  // Core TTS system
  const ttsControllerRef = useRef<TTSController | null>(null);
  const synthesizerRef = useRef<KokoroSynthesizer | null>(null);
  const indexerRef = useRef<SentenceIndexer | null>(null);
  const storageRef = useRef<LocalTTSStorage | null>(null);
  const adapterRef = useRef<EPUBAdapter | PDFAdapter | null>(null);

  // Initialize TTS system
  useEffect(() => {
    initializeTTS();
    loadVoices();

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
          epub: bookType === "epub" ? (adapterRef.current as EPUBAdapter) : undefined,
          pdf: bookType === "pdf" ? (adapterRef.current as PDFAdapter) : undefined,
        },
      });

      // Set up event handlers
      setupEventHandlers();

      // Set current book and load settings
      await ttsControllerRef.current.setBook(bookId);

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
        setVoices(voiceData);
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
      setError("Failed to start playback. Try double-tapping on text to select a starting point.");
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

  const handlePrevSentence = async () => {
    if (!ttsControllerRef.current) return;

    try {
      await ttsControllerRef.current.prevSentence();
    } catch (error) {
      console.error("Failed to go to previous sentence:", error);
    }
  };

  const handleNextSentence = async () => {
    if (!ttsControllerRef.current) return;

    try {
      await ttsControllerRef.current.nextSentence();
    } catch (error) {
      console.error("Failed to go to next sentence:", error);
    }
  };

  const handleVoiceChange = (voiceId: string) => {
    setSelectedVoice(voiceId);
    if (ttsControllerRef.current) {
      ttsControllerRef.current.setVoice(voiceId);
    }
  };

  const handleRateChange = (newRate: number) => {
    setRate(newRate);
    if (ttsControllerRef.current) {
      ttsControllerRef.current.setRate(newRate);
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (ttsControllerRef.current) {
      ttsControllerRef.current.setVolume(newVolume);
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
  const canPlay = playbackState === PlaybackState.IDLE || 
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

  if (compact) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
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

        {currentSentence && (
          <div className="text-xs text-gray-600 max-w-[200px] truncate">
            {currentSentence.text}
          </div>
        )}
      </div>
    );
  }

  // Full player UI
  return (
    <div className={`bg-white border rounded-lg shadow-sm p-4 ${className}`}>
      {error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={handlePrevSentence}
          disabled={!currentSentence}
          className="p-2 rounded hover:bg-gray-100 disabled:opacity-50"
          title="Previous sentence"
        >
          <BackwardIcon className="h-5 w-5" />
        </button>

        <button
          onClick={isPlaying ? handlePause : handlePlay}
          disabled={isLoading || (!canPlay && !isPlaying)}
          className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50"
          title={isPlaying ? "Pause" : isPaused ? "Resume" : "Play"}
        >
          {isLoading ? (
            <div className="animate-spin h-6 w-6 border-2 border-white border-t-transparent rounded-full" />
          ) : isPlaying ? (
            <PauseIcon className="h-6 w-6" />
          ) : (
            <PlayIcon className="h-6 w-6" />
          )}
        </button>

        <button
          onClick={handleStop}
          disabled={!isPlaying && !isPaused}
          className="p-2 rounded hover:bg-gray-100 disabled:opacity-50"
          title="Stop"
        >
          <StopIcon className="h-5 w-5" />
        </button>

        <button
          onClick={handleNextSentence}
          disabled={!currentSentence}
          className="p-2 rounded hover:bg-gray-100 disabled:opacity-50"
          title="Next sentence"
        >
          <ForwardIcon className="h-5 w-5" />
        </button>

        <div className="ml-auto">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded hover:bg-gray-100"
            title="Settings"
          >
            <Cog6ToothIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {currentSentence && (
        <div className="p-3 bg-gray-50 rounded text-sm">
          <p className="text-gray-700 line-clamp-3">{currentSentence.text}</p>
        </div>
      )}

      {showSettings && (
        <div className="mt-4 p-3 bg-gray-50 rounded space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Voice
            </label>
            <select
              value={selectedVoice}
              onChange={(e) => handleVoiceChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {voices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Speed: {rate.toFixed(1)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={rate}
              onChange={(e) => handleRateChange(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Volume: {Math.round(volume * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}