// my-digital-library/src/hooks/useEpubTTS.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { Book } from "../types";
import { useStore } from "../store";

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
  currentCfi: string | null;
  voices: Voice[];
  selectedVoice: string;
  speed: number;
  error: string | null;
}

interface TTSOptions {
  chunkSize?: number;
}

interface Paragraph {
  cfi: string;
  text: string;
}

export function useEpubTTS(
  book: Book | null,
  rendition: any | null,
  options: TTSOptions = {}
) {
  const { chunkSize = 600 } = options;
  const { updateBookMetadata } = useStore();

  const [state, setState] = useState<TTSState>({
    isPlaying: false,
    isPaused: false,
    isLoading: false,
    currentChunk: 0,
    totalChunks: 0,
    currentCfi: null,
    voices: [],
    selectedVoice: "af",
    speed: 1.0,
    error: null,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chunkTextsRef = useRef<string[]>([]);
  const chunkCfisRef = useRef<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // load available voices
  useEffect(() => {
    const loadVoices = async () => {
      try {
        const res = await fetch("/api/tts/voices");
        if (res.ok) {
          const voices = await res.json();
          setState((s) => ({ ...s, voices }));
        }
      } catch (err) {
        console.error("Failed to load voices", err);
      }
    };
    loadVoices();
  }, []);

  const collectParagraphsFromRange = (
    contents: any,
    startCfi: string,
    limit = 5000
  ): Paragraph[] => {
    const range = contents.range(startCfi);
    if (!range) return [];
    let node: Node | null = range.startContainer;
    // climb to nearest block element
    while (
      node &&
      !(node instanceof HTMLElement && /^(P|LI|H[1-6]|DIV)$/i.test(node.tagName))
    ) {
      node = node.parentElement;
    }
    if (!node || !(node instanceof HTMLElement)) return [];

    const doc = contents.document;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) =>
        n instanceof HTMLElement && /^(P|LI|H[1-6]|DIV)$/i.test(n.tagName)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP,
    });
    // position walker at starting block
    walker.currentNode = node;
    const paragraphs: Paragraph[] = [];
    let chars = 0;
    while (walker.currentNode && chars < limit) {
      const el = walker.currentNode as HTMLElement;
      let text = "";
      if (el === node) {
        const r = doc.createRange();
        r.setStart(range.startContainer, range.startOffset);
        r.setEndAfter(el);
        text = r.toString();
      } else {
        text = el.textContent || "";
      }
      text = text.replace(/\s+/g, " ").trim();
      if (text) {
        const cfi = contents.cfiFromNode(el);
        paragraphs.push({ cfi, text });
        chars += text.length;
      }
      const next = walker.nextNode();
      if (!next) break;
    }
    return paragraphs;
  };

  const splitParagraphs = (paragraphs: Paragraph[]) => {
    const texts: string[] = [];
    const cfis: string[] = [];
    for (const p of paragraphs) {
      const sentences = p.text.match(/[^.!?]+[.!?]+/g) || [p.text];
      let current = "";
      for (const sentence of sentences) {
        if ((current + sentence).length <= chunkSize) {
          current += sentence;
        } else {
          if (current) {
            texts.push(current.trim());
            cfis.push(p.cfi);
          }
          current = sentence;
        }
      }
      if (current) {
        texts.push(current.trim());
        cfis.push(p.cfi);
      }
    }
    return { texts, cfis };
  };

  const synthesize = async (text: string): Promise<Blob> => {
    const res = await fetch("/api/tts/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice: state.selectedVoice,
        speed: state.speed,
      }),
      signal: abortRef.current?.signal,
    });
    if (!res.ok) throw new Error("Failed to synthesize speech");
    return await res.blob();
  };

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

  const playFromCfi = useCallback(
    async (startCfi: string) => {
      if (!book || !rendition) return;
      try {
        setState((s) => ({ ...s, isLoading: true, error: null }));
        abortRef.current = new AbortController();
        // ensure current section is displayed
        await rendition.display(startCfi);
        const contents = rendition.getContents()[0];
        const paragraphs = collectParagraphsFromRange(contents, startCfi);
        const { texts, cfis } = splitParagraphs(paragraphs);
        chunkTextsRef.current = texts;
        chunkCfisRef.current = cfis;
        setState((s) => ({
          ...s,
          totalChunks: texts.length,
          currentChunk: 0,
          currentCfi: startCfi,
        }));
        await startPlayback();
      } catch (e) {
        setState((s) => ({
          ...s,
          isLoading: false,
          error: e instanceof Error ? e.message : "TTS failed",
        }));
      }
    },
    [book, rendition, state.selectedVoice, state.speed]
  );

  const startPlayback = async () => {
    setState((s) => ({ ...s, isPlaying: true, isPaused: false, isLoading: false }));
    for (let i = state.currentChunk; i < chunkTextsRef.current.length; i++) {
      if (abortRef.current?.signal.aborted) break;
      setState((s) => ({ ...s, currentChunk: i }));
      const blob = await synthesize(chunkTextsRef.current[i]);
      await playAudioBlob(blob);
      const nextCfi = chunkCfisRef.current[i + 1] || chunkCfisRef.current[i];
      setState((s) => ({ ...s, currentCfi: nextCfi }));
      updateBookMetadata(book!.id, { lastReadPosition: nextCfi }).catch(
        console.error
      );
      if (rendition && nextCfi) {
        try {
          rendition.display(nextCfi);
        } catch (err) {
          console.error("Failed to display CFI", err);
        }
      }
    }
    setState((s) => ({ ...s, isPlaying: false }));
  };

  const pause = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setState((s) => ({ ...s, isPaused: true }));
    }
  }, []);

  const resume = useCallback(() => {
    if (audioRef.current && audioRef.current.paused) {
      audioRef.current.play();
      setState((s) => ({ ...s, isPaused: false }));
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setState((s) => ({ ...s, isPlaying: false, isPaused: false, currentChunk: 0 }));
  }, []);

  const skipNext = useCallback(() => {
    if (state.currentChunk < chunkTextsRef.current.length - 1) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = audioRef.current.duration;
      }
    }
  }, [state.currentChunk]);

  const skipPrevious = useCallback(() => {
    if (state.currentChunk > 0) {
      setState((s) => ({ ...s, currentChunk: Math.max(0, s.currentChunk - 2) }));
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = audioRef.current.duration;
      }
    }
  }, [state.currentChunk]);

  const setVoice = useCallback((voiceId: string) => {
    setState((s) => ({ ...s, selectedVoice: voiceId }));
  }, []);

  const setSpeed = useCallback((speed: number) => {
    setState((s) => ({ ...s, speed: Math.max(0.5, Math.min(2.0, speed)) }));
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
    };
  }, []);

  return {
    ...state,
    playFromCfi,
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

export default useEpubTTS;
