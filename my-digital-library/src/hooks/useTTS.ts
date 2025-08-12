// my-digital-library/src/hooks/useTTS.ts
import { useState, useEffect, useRef, useCallback } from "react";
import { Book } from "../types";

interface Voice {
  id: string;
  name: string;
  language: string;
  gender: string;
}

interface TTSState {
  isPlaying: boolean;
  isPaused: boolean;
  isLoading: boolean;
  currentChunk: number;
  totalChunks: number;
  voices: Voice[];
  selectedVoice: string;
  speed: number;
  error: string | null;
}

interface TTSOptions {
  chunkSize?: number;
  cacheAudio?: boolean;
}

export function useTTS(book: Book | null, options: TTSOptions = {}) {
  const { chunkSize = 500, cacheAudio = true } = options;

  const [state, setState] = useState<TTSState>({
    isPlaying: false,
    isPaused: false,
    isLoading: false,
    currentChunk: 0,
    totalChunks: 0,
    voices: [],
    selectedVoice: "af",
    speed: 1.0,
    error: null,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<Blob[]>([]);
  const textChunksRef = useRef<string[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load available voices
  useEffect(() => {
    loadVoices();
  }, []);

  const loadVoices = async () => {
    try {
      const response = await fetch("/api/tts/voices");
      if (response.ok) {
        const voices = await response.json();
        setState((prev) => ({ ...prev, voices }));
      }
    } catch (error) {
      console.error("Failed to load voices:", error);
    }
  };

  // Extract text from book
  const extractText = useCallback(
    async (
      startPage?: number,
      endPage?: number,
      chapter?: number
    ): Promise<string> => {
      if (!book) throw new Error("No book selected");

      const response = await fetch(`/api/books/${book.id}/tts/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startPage, endPage, chapter }),
      });

      if (!response.ok) {
        throw new Error("Failed to extract text");
      }

      const data = await response.json();
      return data.text;
    },
    [book]
  );

  // Split text into chunks
  const splitIntoChunks = (text: string): string[] => {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    const chunks: string[] = [];
    let currentChunk = "";

    for (const sentence of sentences) {
      if ((currentChunk + sentence).split(/\s+/).length <= chunkSize) {
        currentChunk += sentence + " ";
      } else {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = sentence + " ";
      }
    }

    if (currentChunk) chunks.push(currentChunk.trim());
    return chunks;
  };

  // Synthesize audio for a chunk
  const synthesizeChunk = async (text: string): Promise<Blob> => {
    const response = await fetch("/api/tts/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice: state.selectedVoice,
        speed: state.speed,
      }),
      signal: abortControllerRef.current?.signal,
    });

    if (!response.ok) {
      throw new Error("Failed to synthesize speech");
    }

    return await response.blob();
  };

  // Play TTS
  const play = useCallback(
    async (options?: {
      startPage?: number;
      endPage?: number;
      chapter?: number;
      fromBeginning?: boolean;
    }) => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        // Create abort controller for cancellation
        abortControllerRef.current = new AbortController();

        // Extract text if not already done or if starting fresh
        if (textChunksRef.current.length === 0 || options?.fromBeginning) {
          const text = await extractText(
            options?.startPage,
            options?.endPage,
            options?.chapter
          );
          textChunksRef.current = splitIntoChunks(text);
          audioQueueRef.current = [];

          setState((prev) => ({
            ...prev,
            totalChunks: textChunksRef.current.length,
            currentChunk: 0,
          }));
        }

        // Start synthesis and playback
        await startPlayback();
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : "TTS failed",
          isLoading: false,
        }));
      }
    },
    [book, state.selectedVoice, state.speed, extractText]
  );

  // Start audio playback
  const startPlayback = async () => {
    setState((prev) => ({
      ...prev,
      isPlaying: true,
      isPaused: false,
      isLoading: false,
    }));

    for (let i = state.currentChunk; i < textChunksRef.current.length; i++) {
      if (abortControllerRef.current?.signal.aborted) break;

      setState((prev) => ({ ...prev, currentChunk: i }));

      // Synthesize if not cached
      if (!audioQueueRef.current[i]) {
        const audioBlob = await synthesizeChunk(textChunksRef.current[i]);
        audioQueueRef.current[i] = audioBlob;
      }

      // Play audio
      await playAudioBlob(audioQueueRef.current[i]);

      // Prefetch next chunk
      if (
        i < textChunksRef.current.length - 1 &&
        !audioQueueRef.current[i + 1]
      ) {
        synthesizeChunk(textChunksRef.current[i + 1])
          .then((blob) => {
            audioQueueRef.current[i + 1] = blob;
          })
          .catch(console.error);
      }
    }

    setState((prev) => ({ ...prev, isPlaying: false }));
  };

  // Play audio blob
  const playAudioBlob = (blob: Blob): Promise<void> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio(URL.createObjectURL(blob));
      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audio.src);
        resolve();
      };

      audio.onerror = reject;
      audio.play().catch(reject);
    });
  };

  // Pause playback
  const pause = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setState((prev) => ({ ...prev, isPaused: true }));
    }
  }, []);

  // Resume playback
  const resume = useCallback(() => {
    if (audioRef.current && audioRef.current.paused) {
      audioRef.current.play();
      setState((prev) => ({ ...prev, isPaused: false }));
    }
  }, []);

  // Stop playback
  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setState((prev) => ({
      ...prev,
      isPlaying: false,
      isPaused: false,
      currentChunk: 0,
    }));
  }, []);

  // Skip to next chunk
  const skipNext = useCallback(() => {
    if (state.currentChunk < state.totalChunks - 1) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = audioRef.current.duration;
      }
    }
  }, [state.currentChunk, state.totalChunks]);

  // Skip to previous chunk
  const skipPrevious = useCallback(() => {
    if (state.currentChunk > 0) {
      setState((prev) => ({
        ...prev,
        currentChunk: Math.max(0, prev.currentChunk - 2),
      }));
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = audioRef.current.duration;
      }
    }
  }, [state.currentChunk]);

  // Set voice
  const setVoice = useCallback((voiceId: string) => {
    setState((prev) => ({ ...prev, selectedVoice: voiceId }));
    // Clear cache when voice changes
    audioQueueRef.current = [];
  }, []);

  // Set speed
  const setSpeed = useCallback((speed: number) => {
    setState((prev) => ({
      ...prev,
      speed: Math.max(0.5, Math.min(2.0, speed)),
    }));
    // Clear cache when speed changes
    audioQueueRef.current = [];
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
    };
  }, []);

  return {
    ...state,
    play,
    pause,
    resume,
    stop,
    skipNext,
    skipPrevious,
    setVoice,
    setSpeed,
    isAvailable: state.voices.length > 0,
  };
}
