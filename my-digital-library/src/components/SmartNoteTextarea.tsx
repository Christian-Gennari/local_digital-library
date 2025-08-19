import React, { useState, useRef, useEffect, useMemo } from "react";

interface SmartNoteTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
}

export function SmartNoteTextarea({
  value,
  onChange,
  placeholder = "Write a note...",
  rows = 3,
  className = "",
  disabled = false,
}: SmartNoteTextareaProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionQuery, setSuggestionQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Get all existing concepts with caching
  const getAllConcepts = async (): Promise<string[]> => {
    try {
      // Check cache first (valid for 30 seconds)
      const cached = sessionStorage.getItem("concept-cache");
      if (cached) {
        const { concepts, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < 30000) {
          return concepts;
        }
      }

      // Fetch fresh concepts
      const response = await fetch("/api/notes/concepts");
      if (response.ok) {
        const concepts = await response.json();

        // Cache the results
        sessionStorage.setItem(
          "concept-cache",
          JSON.stringify({
            concepts,
            timestamp: Date.now(),
          })
        );

        return concepts;
      }
    } catch (error) {
      console.error("Failed to fetch concepts:", error);
    }
    return [];
  };

  // Debounce helper
  function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): T {
    let timeout: NodeJS.Timeout;
    return ((...args: any[]) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    }) as T;
  }

  // Debounced concept search
  const debouncedSearch = useMemo(
    () =>
      debounce(async (query: string) => {
        if (query.length === 0) {
          // Show recent/popular concepts when just [[
          const allConcepts = await getAllConcepts();
          setSuggestions(allConcepts.slice(0, 5));
          return;
        }

        const allConcepts = await getAllConcepts();
        const matches = allConcepts
          .filter((concept) => concept.includes(query.toLowerCase()))
          .sort((a, b) => {
            // Prioritize concepts that start with the query
            const aStarts = a.startsWith(query.toLowerCase());
            const bStarts = b.startsWith(query.toLowerCase());
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return a.localeCompare(b);
          })
          .slice(0, 8);

        setSuggestions(matches);
      }, 150), // Faster debounce since we're using cached data
    []
  );

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;

    onChange(newValue);
    setCursorPosition(cursorPos);

    // Check if we're typing after [[
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const lastBrackets = textBeforeCursor.lastIndexOf("[[");

    if (lastBrackets !== -1) {
      const afterBrackets = textBeforeCursor.slice(lastBrackets + 2);

      if (!afterBrackets.includes("]]")) {
        const query = afterBrackets;
        setSuggestionQuery(query);
        setShowSuggestions(true);
        setSelectedIndex(0);
        debouncedSearch(query);
      } else {
        setShowSuggestions(false);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
        break;

      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;

      case "Enter":
      case "Tab":
        e.preventDefault();
        if (suggestions[selectedIndex]) {
          insertSuggestion(suggestions[selectedIndex]);
        } else if (suggestionQuery.trim()) {
          // Clear cache when creating new concept
          sessionStorage.removeItem("concept-cache");
          insertSuggestion(suggestionQuery.trim());
        }
        break;

      case "Escape":
        setShowSuggestions(false);
        break;
    }
  };

  const insertSuggestion = (concept: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const textBeforeCursor = value.slice(0, cursorPosition);
    const textAfterCursor = value.slice(cursorPosition);
    const lastBrackets = textBeforeCursor.lastIndexOf("[[");

    const beforeBrackets = value.slice(0, lastBrackets);
    const newValue = `${beforeBrackets}[[${concept}]]${textAfterCursor}`;

    onChange(newValue);
    setShowSuggestions(false);

    setTimeout(() => {
      const newCursorPos = lastBrackets + concept.length + 4;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
      textarea.focus();
    }, 0);
  };

  // Handle clicks outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={`w-full px-3 py-2 text-sm border theme-border rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 resize-none ${className}`}
      />

      {showSuggestions && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 mt-1 w-64 theme-bg-primary border theme-border rounded-lg shadow-lg max-h-48 overflow-y-auto"
        >
          {suggestions.length > 0 ? (
            suggestions.map((suggestion, index) => (
              <button
                key={suggestion}
                onClick={() => insertSuggestion(suggestion)}
                className={`w-full text-left px-3 py-2 text-sm hover:theme-bg-secondary ${
                  index === selectedIndex ? "theme-bg-tertiary" : ""
                }`}
              >
                <span className="font-medium">{suggestion}</span>
              </button>
            ))
          ) : suggestionQuery.trim() ? (
            <button
              onClick={() => insertSuggestion(suggestionQuery.trim())}
              className={`w-full text-left px-3 py-2 text-sm hover:theme-bg-secondary ${
                selectedIndex === 0 ? "theme-bg-tertiary" : ""
              }`}
            >
              <span className="theme-text-secondary">Create: </span>
              <span className="font-medium">{suggestionQuery.trim()}</span>
            </button>
          ) : (
            <div className="px-3 py-2 text-sm text-gray-500">
              Type to search or create concepts
            </div>
          )}
        </div>
      )}
    </div>
  );
}
