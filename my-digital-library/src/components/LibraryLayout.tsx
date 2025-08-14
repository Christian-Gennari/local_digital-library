import { useState, useEffect } from "react";
import { useStore } from "../store";
import { BookList } from "./BookList";
import { CollectionsSidebar } from "./CollectionsSidebar";
import { BookDetailsSidebar } from "./BookDetailsSidebar";
import { SearchBar } from "./SearchBar";
import { fetchBookDataFromISBN } from "../utils/isbn";
import { NostosLogo } from "../assets/NostosLogo";
import { FileUpload } from "./FileUpload";

import {
  XMarkIcon,
  Bars3Icon,
  BookOpenIcon,
  PlusIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";

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
  const [leftOpen, setLeftOpen] = useState(false); // Changed from true to false
  const [rightOpen, setRightOpen] = useState(false); // Changed from true to false
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
      if (!selectedBook?.metadata?.isbn || selectedBook.metadata.coverUrl)
        return;
      try {
        const data = await fetchBookDataFromISBN(selectedBook.metadata.isbn);
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

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Floating FABs on mobile */}
      <div className="fixed bottom-4 left-4 z-40 flex gap-2 md:hidden">
        <button
          onClick={() => setLeftOpen(true)}
          className="rounded-full bg-white p-3 shadow-lg hover:shadow-xl transition-shadow"
          aria-label="Open collections"
        >
          <Bars3Icon className="h-5 w-5" />
        </button>
        <button
          onClick={() => setRightOpen(true)}
          className="rounded-full bg-white p-3 shadow-lg hover:shadow-xl transition-shadow"
          aria-label="Open details"
        >
          <BookOpenIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="flex h-screen overflow-hidden">
        {/* LEFT SIDEBAR (desktop rail) */}
        <div className="hidden md:block border-r border-slate-200 bg-white md:w-95">
          <CollectionsSidebar
            selectedCollection={selectedCollection}
            onSelectCollection={setSelectedCollection}
          />
        </div>

        {/* MAIN */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Sticky header - Improved Layout */}
          <header
            className="sticky top-0 z-50 w-full border-b border-slate-200
     bg-white/80 backdrop-blur-sm
     supports-[backdrop-filter]:bg-white/70
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
                <button
                  className="p-2.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  aria-label="Settings"
                >
                  <Cog6ToothIcon className="h-6 w-6" />
                </button>
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
                  <button
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    aria-label="Settings"
                  >
                    <Cog6ToothIcon className="h-5 w-5" />
                  </button>
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
        <aside className="hidden md:block border-l border-slate-200 bg-white md:w-80">
          <BookDetailsSidebar />
        </aside>
      </div>

      {/* LEFT DRAWER (mobile) - Updated with conditional transitions */}
      <div
        className={`md:hidden fixed inset-0 z-50 ${
          leftOpen ? "" : "pointer-events-none"
        }`}
        aria-hidden={!leftOpen}
      >
        {/* Backdrop */}
        <div
          onClick={() => setLeftOpen(false)}
          className={`absolute inset-0 bg-black/40 ${
            hasMounted ? "transition-opacity" : ""
          } ${leftOpen ? "opacity-100" : "opacity-0"}`}
        />
        {/* Panel */}
        <div
          className={`absolute inset-y-0 left-0 w-[82%] max-w-[22rem] bg-white border-r border-slate-200 shadow-xl pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] ${
            hasMounted ? "transition-transform duration-300" : ""
          } ${leftOpen ? "translate-x-0" : "-translate-x-full"}`}
          style={{
            // Ensure it starts hidden even without transition
            transform:
              !hasMounted && !leftOpen ? "translateX(-100%)" : undefined,
          }}
          role="dialog"
          aria-label="Collections"
        >
          <div className="flex items-center justify-between p-3 border-b border-slate-200">
            <span className="text-sm font-medium text-slate-700">
              Collections
            </span>
            <button
              onClick={() => setLeftOpen(false)}
              className="p-2 rounded hover:bg-slate-100"
              aria-label="Close"
            >
              <XMarkIcon className="h-5 w-5 text-slate-600" />
            </button>
          </div>
          <div className="h-[calc(100%-56px)] overflow-y-auto">
            <CollectionsSidebar
              selectedCollection={selectedCollection}
              onSelectCollection={(id) => {
                setSelectedCollection(id);
                setLeftOpen(false);
              }}
            />
          </div>
        </div>
      </div>

      {/* RIGHT DRAWER (mobile) - Updated with conditional transitions */}
      <div
        className={`md:hidden fixed inset-0 z-50 ${
          rightOpen ? "" : "pointer-events-none"
        }`}
        aria-hidden={!rightOpen}
      >
        <div
          onClick={() => setRightOpen(false)}
          className={`absolute inset-0 bg-black/40 ${
            hasMounted ? "transition-opacity" : ""
          } ${rightOpen ? "opacity-100" : "opacity-0"}`}
        />
        <div
          className={`absolute inset-y-0 right-0 w-[86%] max-w-[24rem] bg-white border-l border-slate-200 shadow-xl pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] ${
            hasMounted ? "transition-transform duration-300" : ""
          } ${rightOpen ? "translate-x-0" : "translate-x-full"}`}
          style={{
            // Ensure it starts hidden even without transition
            transform:
              !hasMounted && !rightOpen ? "translateX(100%)" : undefined,
          }}
          role="dialog"
          aria-label="Details"
        >
          <div className="flex items-center justify-between p-3 border-b border-slate-200">
            <span className="text-sm font-medium text-slate-700">Details</span>
            <button
              onClick={() => setRightOpen(false)}
              className="p-2 rounded hover:bg-slate-100"
              aria-label="Close"
            >
              <XMarkIcon className="h-5 w-5 text-slate-600" />
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
