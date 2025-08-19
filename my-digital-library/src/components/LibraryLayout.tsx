import { useState, useEffect, useRef } from "react";
import { useStore } from "../store";
import { BookList } from "./BookList";
import { CollectionsSidebar } from "./CollectionsSidebar";
import { BookDetailsSidebar } from "./BookDetailsSidebar";
import { SearchBar } from "./SearchBar";
import { fetchBookDataFromISBN } from "../utils/isbn";
import { NostosLogo } from "../assets/NostosLogo";
import { FileUpload } from "./FileUpload";
import { getIdentifier } from "../utils/metadataHelpers";
import { useThemeStore } from "../stores/themeStore";
import { SettingsMenu } from "./SettingsMenu";

import {
  XMarkIcon,
  Bars3Icon,
  BookOpenIcon,
  PlusIcon,
  Cog6ToothIcon,
  RectangleStackIcon,
} from "@heroicons/react/24/outline";
import { ThemeSelector } from "./ThemeSelector";

/** Simple media query hook */
function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) setMatches(media.matches);
    const listener = () => setMatches(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [matches, query]);
  return matches;
}

export function LibraryLayout() {
  const { selectedBook, updateBookMetadata } = useStore();
  const { currentTheme, setTheme } = useThemeStore();
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    null
  );
  const [filters, setFilters] = useState({
    format: "all",
    rating: "all",
    readingStatus: "all",
  });
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  const isMobile = useMediaQuery("(max-width: 768px)");

  // Set mounted flag after initial render
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Auto-close/open appropriate panes on mobile when a book is selected
  useEffect(() => {
    if (isMobile && selectedBook) {
      setRightOpen(true);
      setLeftOpen(false);
    }
  }, [selectedBook, isMobile]);

  // Fetch missing cover by ISBN (keeps your current behavior)
  useEffect(() => {
    (async () => {
      if (!selectedBook) return;

      const isbn = getIdentifier(selectedBook.metadata, "isbn");
      if (!isbn || selectedBook.metadata.coverUrl) return;

      try {
        const data = await fetchBookDataFromISBN(String(isbn));
        if (data?.coverUrl) {
          updateBookMetadata(selectedBook.id, {
            ...selectedBook.metadata,
            coverUrl: data.coverUrl,
          });
        }
      } catch (e) {
        console.error("Failed to fetch book cover:", e);
      }
    })();
  }, [selectedBook, updateBookMetadata]);

  const cycleTheme = () => {
    const themes = ["paper", "sepia", "night", "highContrast"];
    const currentIndex = themes.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  return (
    <div className="flex h-screen overflow-hidden relative theme-bg-primary">
      {/* LEFT SIDEBAR (desktop rail) */}
      <div className="hidden md:block border-r theme-border theme-bg-primary md:w-95">
        <CollectionsSidebar
          selectedCollection={selectedCollection}
          onSelectCollection={setSelectedCollection}
        />
      </div>

      {/* MAIN */}
      <div className="flex-1 flex flex-col min-w-0 theme-bg-primary">
        {/* Sticky header - Improved Layout */}
        <header
          className="sticky top-0 z-50 w-full border-b theme-border
     theme-bg-primary/80 backdrop-blur-sm
     supports-[backdrop-filter]:theme-bg-primary/70
     pt-[env(safe-area-inset-top)]"
        >
          {/* Desktop Layout */}
          <div className="hidden md:flex items-center px-6 py-4">
            {/* Logo - Better spacing */}
            <div className="flex-none mr-8">
              <NostosLogo />
            </div>

            {/* Search - Centered with max width */}
            <div className="flex-1 max-w-3xl mx-auto">
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                filters={filters}
                onFiltersChange={setFilters}
              />
            </div>

            {/* Actions - Better spacing */}
            <div className="flex items-center gap-3 ml-8">
              <FileUpload />
              {!isMobile && <SettingsMenu isMobile={false} />}
            </div>
          </div>

          {/* Mobile Layout */}
          <div className="md:hidden px-3 py-3">
            {/* First Row: Logo and Actions */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex-none">
                <NostosLogo />
              </div>

              <div className="flex items-center gap-2">
                <FileUpload />
                {isMobile && <SettingsMenu isMobile />}
              </div>
            </div>

            {/* Second Row: Search (full width) */}
            <div className="w-full">
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                filters={filters}
                onFiltersChange={setFilters}
              />
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          <BookList
            searchQuery={searchQuery}
            selectedCollection={selectedCollection}
            filters={filters}
          />
        </main>
      </div>

      {/* RIGHT SIDEBAR (desktop rail) */}
      <aside className="hidden md:block border-l theme-border theme-bg-primary md:w-80">
        <BookDetailsSidebar />
      </aside>

      {/* MOBILE FLOATING ACTION BUTTONS */}
      <div className="md:hidden">
        {/* Collections FAB - Bottom Left */}
        <button
          onClick={() => setLeftOpen(true)}
          className="fixed left-4 bottom-4 z-40 h-14 w-14 flex items-center justify-center rounded-full theme-bg-primary shadow-lg border theme-border theme-text-secondary hover:theme-bg-secondary hover:shadow-xl transition-all"
          aria-label="Open collections"
          style={{
            marginBottom: "env(safe-area-inset-bottom)",
          }}
        >
          <RectangleStackIcon className="h-6 w-6" />
        </button>

        {/* Book Details FAB - Bottom Right (only show when a book is selected) */}
        {selectedBook && (
          <button
            onClick={() => setRightOpen(true)}
            className="fixed right-4 bottom-4 z-40 h-14 w-14 flex items-center justify-center rounded-full theme-bg-primary shadow-lg border theme-border theme-text-secondary hover:theme-bg-secondary hover:shadow-xl transition-all"
            aria-label="Open book details"
            style={{
              marginBottom: "env(safe-area-inset-bottom)",
            }}
          >
            <BookOpenIcon className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* LEFT DRAWER (mobile) */}
      <div
        className={`md:hidden fixed inset-0 z-50 ${
          leftOpen ? "" : "pointer-events-none"
        }`}
        aria-hidden={!leftOpen}
      >
        {/* Backdrop */}
        <div
          onClick={() => setLeftOpen(false)}
          className="absolute inset-0 bg-black/40"
          style={{
            opacity: leftOpen ? 1 : 0,
            transition: hasMounted ? "opacity 300ms ease-in-out" : "none",
          }}
        />
        {/* Panel */}
        <div
          className="absolute inset-y-0 left-0 w-[82%] max-w-[22rem] theme-bg-primary border-r theme-border shadow-xl pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          style={{
            transform: leftOpen ? "translateX(0)" : "translateX(-100%)",
            transition: hasMounted ? "transform 300ms ease-in-out" : "none",
          }}
          role="dialog"
          aria-label="Collections"
        >
          {/* Header with Collections text on left, close button on right */}
          <div className="flex items-center justify-between p-3 border-b theme-border">
            <span className="text-sm font-medium theme-text-primary">
              Collections
            </span>
            <button
              onClick={() => setLeftOpen(false)}
              className="p-2 rounded-lg hover:theme-bg-tertiary transition-colors"
              aria-label="Close collections"
            >
              <XMarkIcon className="h-5 w-5 theme-text-secondary" />
            </button>
          </div>
          {/* Collections sidebar with mobile flag */}
          <div className="h-[calc(100%-56px)] overflow-y-auto">
            <CollectionsSidebar
              selectedCollection={selectedCollection}
              onSelectCollection={(id) => {
                setSelectedCollection(id);
                setLeftOpen(false);
              }}
              isMobile={true}
            />
          </div>
        </div>
      </div>

      {/* RIGHT DRAWER (mobile) */}
      <div
        className={`md:hidden fixed inset-0 z-50 ${
          rightOpen ? "" : "pointer-events-none"
        }`}
        aria-hidden={!rightOpen}
      >
        <div
          onClick={() => setRightOpen(false)}
          className="absolute inset-0 bg-black/40"
          style={{
            opacity: rightOpen ? 1 : 0,
            transition: hasMounted ? "opacity 300ms ease-in-out" : "none",
          }}
        />
        <div
          className="absolute inset-y-0 right-0 w-[86%] max-w-[24rem] theme-bg-primary border-l theme-border shadow-xl pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          style={{
            transform: rightOpen ? "translateX(0)" : "translateX(100%)",
            transition: hasMounted ? "transform 300ms ease-in-out" : "none",
          }}
          role="dialog"
          aria-label="Details"
        >
          <div className="flex items-center justify-between p-3 border-b theme-border">
            <span className="text-sm font-medium theme-text-primary">
              Details
            </span>
            <button
              onClick={() => setRightOpen(false)}
              className="p-2 rounded-lg hover:theme-bg-tertiary transition-colors"
              aria-label="Close"
            >
              <XMarkIcon className="h-5 w-5 theme-text-secondary" />
            </button>
          </div>
          <div className="h-[calc(100%-56px)] overflow-y-auto">
            <BookDetailsSidebar />
          </div>
        </div>
      </div>
    </div>
  );
}
