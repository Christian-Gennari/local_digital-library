// src/components/ReadingContext.tsx - Key parts with fixes
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  ReactNode,
} from "react";

import { Book, HighlightData, HighlightService } from "../types";
import { useNotesStore } from "../notesStore";

interface ReadingState {
  currentReference: {
    type: "page" | "cfi" | "timestamp";
    value: string;
    raw: number | string;
  } | null;

  selectedText: string | null;
  isNotesOpen: boolean;

  // Highlighting state
  highlightsVisible: boolean;
  pendingHighlight: HighlightData | null;
  highlights: HighlightData[];
  canCreateHighlight: boolean;

  setCurrentReference: (
    ref: {
      type: "page" | "cfi" | "timestamp";
      value: string;
      raw: number | string;
    } | null
  ) => void;

  setSelectedText: (text: string | null) => void;
  setNotesOpen: (open: boolean) => void;
  toggleNotes: () => void;
  handleEpubSelection: (text: string | null) => void;

  // Highlighting methods
  createHighlightFromSelection: () => Promise<HighlightData | null>;
  clearPendingHighlight: () => void;
  applyPendingHighlight: (noteId: string) => HighlightData | null;
  toggleHighlightsVisibility: () => void;
  removeNoteHighlight: (noteId: string) => void;
  registerHighlightService: (service: HighlightService) => void;
  refreshHighlights: () => Promise<void>;

  // Highlighting service registration
  setPendingHighlightData: (data: HighlightData | null) => void;
  getPendingHighlight: () => HighlightData | null;
}

const ReadingContext = createContext<ReadingState | null>(null);

export const useReading = () => {
  const context = useContext(ReadingContext);
  if (!context)
    throw new Error("useReading must be used within ReadingProvider");
  return context;
};

interface Props {
  children: ReactNode;
  book: Book;
}

// Shallow equality helper to avoid redundant state writes
function equalHighlights(a: HighlightData[], b: HighlightData[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
  }
  return true;
}

export function ReadingProvider({ children, book }: Props) {
  const { getHighlights } = useNotesStore();

  // Core state
  const [currentReference, setCurrentReference] = useState<{
    type: "page" | "cfi" | "timestamp";
    value: string;
    raw: number | string;
  } | null>(null);

  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [isNotesOpen, setNotesOpen] = useState(false);

  // Highlighting state
  const [highlightsVisible, setHighlightsVisible] = useState(true);
  const [pendingHighlight, setPendingHighlight] =
    useState<HighlightData | null>(null);
  const [highlights, setHighlights] = useState<HighlightData[]>([]);
  const [highlightsLoaded, setHighlightsLoaded] = useState(false);

  // Track highlights in ref to avoid callback deps
  const highlightsRef = useRef<HighlightData[]>(highlights);
  useEffect(() => {
    highlightsRef.current = highlights;
  }, [highlights]);

  const highlightServiceRef = useRef<HighlightService | null>(null);

  // Load highlights on book change
  const refreshHighlights = useCallback(async () => {
    try {
      console.log(`Loading highlights for book ${book.id}`);
      const bookHighlights = await getHighlights(book.id);

      setHighlights((prev) => {
        if (equalHighlights(prev, bookHighlights)) return prev;
        console.log(`Updated highlights: ${bookHighlights.length} highlights`);
        return bookHighlights;
      });

      setHighlightsLoaded(true);

      // Update service if already registered
      if (highlightServiceRef.current) {
        console.log(
          `Rendering ${bookHighlights.length} highlights on existing service`
        );
        highlightServiceRef.current.renderHighlights(bookHighlights);
      }
    } catch (error) {
      console.error("Failed to load highlights:", error);
      setHighlights((prev) => (prev.length ? [] : prev));
      setHighlightsLoaded(true);
      if (highlightServiceRef.current) {
        highlightServiceRef.current.renderHighlights([]);
      }
    }
  }, [book.id, getHighlights]);

  // Register service with enhanced logic
  const registerHighlightService = useCallback(
    (service: HighlightService) => {
      console.log("Registering highlight service for", book.format);
      highlightServiceRef.current = service;

      // Apply current visibility
      service.setHighlightsVisible?.(highlightsVisible);

      // If highlights are already loaded, render them immediately
      if (highlightsLoaded && highlightsRef.current.length > 0) {
        console.log(
          `Rendering ${highlightsRef.current.length} pre-loaded highlights`
        );
        service.renderHighlights(highlightsRef.current);
      } else if (!highlightsLoaded) {
        // If highlights aren't loaded yet, trigger a refresh
        console.log("Highlights not loaded yet, triggering refresh");
        refreshHighlights();
      }
    },
    [book.format, highlightsVisible, highlightsLoaded, refreshHighlights]
  );

  // Load highlights when component mounts or book changes
  useEffect(() => {
    // Reset loaded state when book changes
    setHighlightsLoaded(false);
    refreshHighlights();
  }, [book.id]); // Only depend on book.id, not refreshHighlights

  // Update visibility when it changes
  useEffect(() => {
    console.log(`Setting highlights visibility: ${highlightsVisible}`);
    highlightServiceRef.current?.setHighlightsVisible(highlightsVisible);
  }, [highlightsVisible]);

  // Initialize reference based on book format
  useEffect(() => {
    switch (book.format) {
      case "pdf":
        setCurrentReference({ type: "page", value: "Page 1", raw: 1 });
        break;
      case "epub":
        setCurrentReference({ type: "cfi", value: "Beginning", raw: "start" });
        break;
      case "audio":
        setCurrentReference({ type: "timestamp", value: "0:00", raw: 0 });
        break;
    }
  }, [book.format]);

  // EPUB selection (stable)
  const handleEpubSelection = useCallback((text: string | null) => {
    setSelectedText(text);
  }, []);

  // Notes toggle (stable)
  const toggleNotes = useCallback(() => {
    setNotesOpen((v) => !v);
  }, []);

  // Create highlight from selection (stable)
  const createHighlightFromSelection =
    useCallback(async (): Promise<HighlightData | null> => {
      const svc = highlightServiceRef.current;
      if (!svc) {
        console.warn("No highlight service available");
        return null;
      }

      try {
        const highlightData = await svc.createHighlightFromSelection();
        if (highlightData) {
          setPendingHighlight(highlightData);
          // Temporarily render pending highlight
          svc.renderHighlights([...highlightsRef.current, highlightData]);
        }
        return highlightData ?? null;
      } catch (error) {
        console.error("Error creating highlight from selection:", error);
        return null;
      }
    }, []);

  // Clear pending highlight (stable)
  const clearPendingHighlight = useCallback(() => {
    const svc = highlightServiceRef.current;
    if (svc) {
      svc.renderHighlights(highlightsRef.current);
    }
    setPendingHighlight(null);
  }, []);

  // Apply pending highlight (stable)
  const applyPendingHighlight = useCallback(
    (noteId: string): HighlightData | null => {
      if (!pendingHighlight) return null;

      // Finalize highlight with note ID
      const finalHighlight: HighlightData = { ...pendingHighlight, id: noteId };

      // Persist to notes store
      try {
        useNotesStore.getState().attachHighlightToNote({
          bookId: book.id,
          noteId,
          highlight: finalHighlight,
        });
      } catch (e) {
        console.warn("Failed to persist highlight to note:", e);
      }

      // Update in-memory highlights
      const next = [...highlightsRef.current, finalHighlight];
      setHighlights(next);
      highlightsRef.current = next;

      // Update service
      highlightServiceRef.current?.renderHighlights(next);

      setPendingHighlight(null);
      return finalHighlight;
    },
    [pendingHighlight, book.id]
  );

  // Remove note highlight (stable)
  const removeNoteHighlight = useCallback((noteId: string) => {
    console.log(`Removing highlight for note: ${noteId}`);
    const svc = highlightServiceRef.current;
    svc?.removeHighlight(noteId);

    setHighlights((prev) => {
      const next = prev.filter((h) => h.id !== noteId);
      highlightsRef.current = next;
      svc?.renderHighlights(next);
      return next;
    });
  }, []);

  // Toggle visibility (stable)
  const toggleHighlightsVisibility = useCallback(() => {
    setHighlightsVisible((v) => {
      const newValue = !v;
      console.log(`Toggling highlights visibility: ${newValue}`);
      highlightServiceRef.current?.setHighlightsVisible(newValue);
      return newValue;
    });
  }, []);

  // Methods used by PDF highlight service
  const setPendingHighlightData = useCallback((data: HighlightData | null) => {
    setPendingHighlight(data);
  }, []);

  const getPendingHighlight = useCallback(() => {
    return pendingHighlight;
  }, [pendingHighlight]);

  // Derived values
  const canCreateHighlight = useMemo(
    () => book.format === "pdf" || book.format === "epub",
    [book.format]
  );

  // Memoized context value
  const value: ReadingState = useMemo(
    () => ({
      currentReference,
      selectedText,
      isNotesOpen,

      highlightsVisible,
      pendingHighlight,
      highlights,
      canCreateHighlight,

      setCurrentReference,
      setSelectedText,
      setNotesOpen,
      toggleNotes,
      handleEpubSelection,

      createHighlightFromSelection,
      clearPendingHighlight,
      applyPendingHighlight,
      toggleHighlightsVisibility,
      removeNoteHighlight,
      registerHighlightService,
      refreshHighlights,

      // NEW methods
      setPendingHighlightData,
      getPendingHighlight,
    }),
    [
      currentReference,
      selectedText,
      isNotesOpen,
      highlightsVisible,
      pendingHighlight,
      highlights,
      canCreateHighlight,
      registerHighlightService,
      refreshHighlights,
      handleEpubSelection,
      toggleNotes,
      createHighlightFromSelection,
      clearPendingHighlight,
      applyPendingHighlight,
      toggleHighlightsVisibility,
      removeNoteHighlight,
      setPendingHighlightData,
      getPendingHighlight,
    ]
  );

  return (
    <ReadingContext.Provider value={value}>{children}</ReadingContext.Provider>
  );
}
