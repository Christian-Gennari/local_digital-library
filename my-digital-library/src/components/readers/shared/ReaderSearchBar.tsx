// src/components/readers/shared/ReaderSearchBar.tsx
import { useState, useEffect, useRef } from "react";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface ReaderSearchBarProps {
  onSearch: (query: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
  currentMatch: number;
  totalMatches: number;
  isVisible: boolean;
  isReady?: boolean; // existing
  // NEW (optional, safe defaults)
  loadingLabel?: string; // e.g., "Caching"
  loadingProgress?: number; // 0..100
}

export function ReaderSearchBar({
  onSearch,
  onNext,
  onPrevious,
  onClose,
  currentMatch,
  totalMatches,
  isVisible,
  isReady = true,
  loadingLabel = "Loading",
  loadingProgress,
}: ReaderSearchBarProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isVisible && isReady) inputRef.current?.focus();
  }, [isVisible, isReady]);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (isReady) onSearch(value);
  };

  return isVisible ? (
    <div
      className="absolute top-4 right-4 z-50 flex items-center gap-2 
                 theme-bg-primary/95 backdrop-blur-sm rounded-lg shadow-lg p-2"
    >
      <MagnifyingGlassIcon className="w-5 h-5 theme-text-secondary" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder={isReady ? "Search in book..." : `${loadingLabel}…`}
        disabled={!isReady}
        className={`w-48 px-2 py-1 outline-none bg-transparent ${
          !isReady ? "opacity-50 cursor-not-allowed" : ""
        }`}
      />
      {!isReady && (
        <span className="text-xs theme-text-secondary animate-pulse">
          {loadingLabel}
          {typeof loadingProgress === "number" ? ` ${loadingProgress}%` : ""}
        </span>
      )}
      {isReady && totalMatches > 0 && (
        <>
          <span className="text-sm theme-text-secondary">
            {currentMatch}/{totalMatches}
          </span>
          <button
            onClick={onPrevious}
            className="p-1 hover\:theme-bg-secondary rounded"
            title="Previous match (Shift+Enter)"
          >
            ↑
          </button>
          <button
            onClick={onNext}
            className="p-1 hover\:theme-bg-secondary rounded"
            title="Next match (Enter)"
          >
            ↓
          </button>
        </>
      )}
      <button
        onClick={onClose}
        className="p-1 hover\:theme-bg-secondary rounded"
        title="Close (Esc)"
      >
        <XMarkIcon className="w-5 h-5" />
      </button>
    </div>
  ) : null;
}
