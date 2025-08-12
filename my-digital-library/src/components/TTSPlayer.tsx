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
import { TTSController } from "../services/TTSController";
import { KokoroSynthesizer } from "../services/KokoroSynthesizer";
import { LocalTTSStorage, SentenceIndexer } from "../services/SentenceIndexer";
import { EPUBAdapter } from "../adapters/EPUBAdapter";
import { PDFAdapter } from "../adapters/PDFAdapter";

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
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
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
      setIsLoading(true);
      setError(null);

      // Create core components
      synthesizerRef.current = new KokoroSynthesizer();
      storageRef.current = new LocalTTSStorage();
      indexerRef.current = new SentenceIndexer(storageRef.current);
      ttsControllerRef.current = new TTSController();

      // Set current book for indexer
      indexerRef.current.setCurrentBook(bookId);

      // Create appropriate adapter
      let adapter = null;
      if (bookType === "epub" && epubBook && epubRendition) {
        adapter = new EPUBAdapter(epubBook, epubRendition);
      } else if (bookType === "pdf" && pdfDocument && pdfContainer) {
        adapter = new PDFAdapter(pdfDocument, pdfContainer);
      }

      if (adapter) {
        adapterRef.current = adapter;

        // Set up start-here handler
        adapter.onStartHere((locator) => {
          handleStartHere(locator);
        });
      }

      // Initialize TTS Controller
      await ttsControllerRef.current.init({
        synthesizer: synthesizerRef.current,
        storage: storageRef.current,
        sentenceIndex: indexerRef.current,
        adapters: {
          epub: bookType === "epub" ? (adapter as EPUBAdapter) : undefined,
          pdf: bookType === "pdf" ? (adapter as PDFAdapter) : undefined,
        },
      });

      // Set up event handlers
      setupEventHandlers();

      // Set current book
      await ttsControllerRef.current.setBook(bookId);

      setIsInitialized(true);
    } catch (error) {
      console.error("Failed to initialize TTS:", error);
      setError("Failed to initialize text-to-speech system");
    } finally {
      setIsLoading(false);
    }
  };

  const updateAdapter = () => {
    if (!ttsControllerRef.current || !isInitialized) return;

    let adapter = null;
    if (bookType === "epub" && epubBook && epubRendition) {
      adapter = new EPUBAdapter(epubBook, epubRendition);
    } else if (bookType === "pdf" && pdfDocument && pdfContainer) {
      adapter = new PDFAdapter(pdfDocument, pdfContainer);
    }

    if (adapter) {
      // Clean up old adapter
      if (adapterRef.current) {
        adapterRef.current.destroy();
      }

      adapterRef.current = adapter;

      // Set up start-here handler
      adapter.onStartHere((locator) => {
        handleStartHere(locator);
      });
    }
  };

  const setupEventHandlers = () => {
    if (!ttsControllerRef.current) return;

    const controller = ttsControllerRef.current;

    controller.on("playbackStarted", () => {
      setIsPlaying(true);
      setIsPaused(false);
    });

    controller.on("paused", () => {
      setIsPaused(true);
    });

    controller.on("resumed", () => {
      setIsPaused(false);
    });

    controller.on("stopped", () => {
      setIsPlaying(false);
      setIsPaused(false);
      setCurrentSentence(null);
    });

    controller.on("sentence", (sentence) => {
      setCurrentSentence(sentence);
    });

    controller.on("playbackEnded", () => {
      setIsPlaying(false);
      setIsPaused(false);
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

  const handleStartHere = async (locator: any) => {
    if (!ttsControllerRef.current) return;

    try {
      setIsLoading(true);
      setError(null);

      await ttsControllerRef.current.playFromLocator(locator);
    } catch (error) {
      console.error("Failed to start playback:", error);
      setError("Failed to start playback from selected location");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlay = async () => {
    if (!ttsControllerRef.current) return;

    try {
      setError(null);

      if (isPaused) {
        await ttsControllerRef.current.resume();
      } else {
        // Try to resume from bookmark first
        await ttsControllerRef.current.resumeFromBookmark();
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
      await ttsControllerRef.current.pause();
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
          onClick={isPlaying && !isPaused ? handlePause : handlePlay}
          disabled={isLoading}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
          title={isPlaying && !isPaused ? "Pause" : "Play"}
        >
          {isLoading ? (
            <div className="h-4 w-4 animate-spin border-2 border-blue-600 border-t-transparent rounded-full" />
          ) : isPlaying && !isPaused ? (
            <PauseIcon className="h-4 w-4" />
          ) : (
            <PlayIcon className="h-4 w-4" />
          )}
        </button>

        {isPlaying && (
          <button
            onClick={handleStop}
            className="p-1 rounded hover:bg-gray-100"
            title="Stop"
          >
            <StopIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SpeakerWaveIcon className="h-5 w-5 text-blue-600" />
          <h3 className="font-medium text-gray-900">Text-to-Speech</h3>
        </div>

        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-1 rounded hover:bg-gray-100"
          title="Settings"
        >
          <Cog6ToothIcon className="h-4 w-4 text-gray-600" />
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Current Sentence Display */}
      {currentSentence && (
        <div className="px-4 py-3 bg-blue-50 border-b border-blue-200">
          <p className="text-sm text-blue-900 font-medium mb-1">Now Playing:</p>
          <p className="text-sm text-blue-800 line-clamp-2">
            {currentSentence.text}
          </p>
        </div>
      )}

      {/* Controls */}
      <div className="px-4 py-4">
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={handlePrevSentence}
            disabled={!isPlaying}
            className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Previous Sentence"
          >
            <BackwardIcon className="h-5 w-5" />
          </button>

          <button
            onClick={isPlaying && !isPaused ? handlePause : handlePlay}
            disabled={isLoading}
            className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title={isPlaying && !isPaused ? "Pause" : "Play"}
          >
            {isLoading ? (
              <div className="h-6 w-6 animate-spin border-2 border-white border-t-transparent rounded-full" />
            ) : isPlaying && !isPaused ? (
              <PauseIcon className="h-6 w-6" />
            ) : (
              <PlayIcon className="h-6 w-6" />
            )}
          </button>

          <button
            onClick={handleNextSentence}
            disabled={!isPlaying}
            className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Next Sentence"
          >
            <ForwardIcon className="h-5 w-5" />
          </button>

          <button
            onClick={handleStop}
            disabled={!isPlaying}
            className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Stop"
          >
            <StopIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Instructions */}
        {!isPlaying && !currentSentence && (
          <div className="mt-4 text-center">
            <p className="text-sm text-gray-600">
              Double-tap on text to start reading from that point
            </p>
          </div>
        )}
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="border-t border-gray-200 px-4 py-4 space-y-4">
          {/* Voice Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Voice
            </label>
            <select
              value={selectedVoice}
              onChange={(e) => handleVoiceChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {voices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name}
                </option>
              ))}
            </select>
          </div>

          {/* Speed Control */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
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

          {/* Volume Control */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
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
