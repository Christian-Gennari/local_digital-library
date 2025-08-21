// src/components/BookViewer.tsx
import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "../store";
import { NotesSidebar } from "./NotesSidebar";
import { ReadingProvider, useReading } from "./ReadingContext";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import PdfReader, { PdfReaderRef } from "./readers/PDF/PdfReader";
import EpubReader, { EpubReaderRef } from "./readers/EPUB/EpubReader";
import AudioPlayer, { AudioPlayerRef } from "./readers/AudioPlayer";

export function BookViewer() {
  const { currentBook } = useStore();
  if (!currentBook) return null;
  return (
    <ReadingProvider book={currentBook}>
      <BookViewerContent />
    </ReadingProvider>
  );
}

function BookViewerContent() {
  const { currentBook, setCurrentBook } = useStore();
  const { currentReference, selectedText, isNotesOpen, toggleNotes } =
    useReading();

  const [isMobile, setIsMobile] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTTS, setShowTTS] = useState(false);
  const [isTocOpen, setIsTocOpen] = useState(false); // Add this line

  const viewerRef = useRef<HTMLDivElement>(null);
  const pdfReaderRef = useRef<PdfReaderRef>(null);
  const epubReaderRef = useRef<EpubReaderRef>(null);
  const audioPlayerRef = useRef<AudioPlayerRef>(null);
  const [rendition, setRendition] = useState<any>(null);

  // Search functionality
  const [showSearch, setShowSearch] = useState(false);

  if (!currentBook) return null;

  const format = currentBook.format as "pdf" | "epub" | "audio";

  const handleNavigateToNote = useCallback(
    (reference: {
      type: "page" | "cfi" | "timestamp";
      value: string;
      raw: number | string;
    }) => {
      switch (format) {
        case "pdf":
          if (reference.type === "page" && typeof reference.raw === "number") {
            pdfReaderRef.current?.goToPage(reference.raw);
          }
          break;
        case "epub":
          if (reference.type === "cfi" && typeof reference.raw === "string") {
            epubReaderRef.current?.displayCFI(reference.raw);
          }
          break;
        case "audio":
          if (
            reference.type === "timestamp" &&
            typeof reference.raw === "number"
          ) {
            audioPlayerRef.current?.seekToTime(reference.raw);
          }
          break;
      }
    },
    [format]
  );

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      viewerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const getDisplayReference = () => {
    if (!currentReference) return null;
    const v = currentReference.value;
    if (format === "epub") {
      if (
        v === "Starting Chapter" ||
        v === "Unknown Chapter" ||
        v === "Unknown Location"
      )
        return null;
      return v;
    }
    return v;
  };

  const renderReader = () => {
    switch (format) {
      case "pdf":
        return (
          <PdfReader
            ref={pdfReaderRef}
            pdfUrl={currentBook.url!}
            currentBook={currentBook}
            showTTS={showTTS}
            setShowTTS={setShowTTS}
            isTocOpen={isTocOpen} // Add this
            setIsTocOpen={setIsTocOpen} // Add this
            showSearch={showSearch} // Add this
            setShowSearch={setShowSearch} // Add this
          />
        );
      case "epub":
        return (
          <EpubReader
            ref={epubReaderRef}
            epubUrl={currentBook.url!}
            isNotesOpen={isNotesOpen}
            currentBook={currentBook}
            onRenditionReady={setRendition}
            showTTS={showTTS}
            setShowTTS={setShowTTS}
            isTocOpen={isTocOpen} // Add this
            setIsTocOpen={setIsTocOpen} // Add this
            showSearch={showSearch} // Add this
            setShowSearch={setShowSearch} // Add this
          />
        );
      case "audio":
        return (
          <AudioPlayer
            ref={audioPlayerRef}
            audioUrl={currentBook.url!}
            title={currentBook.metadata.title}
            author={currentBook.metadata.author}
            currentBook={currentBook}
          />
        );
      default:
        return null;
    }
  };

  const displayReference = getDisplayReference();

  return (
    <div
      ref={viewerRef}
      className={`h-[100dvh] flex flex-col theme-bg-primary ${
        isFullscreen ? "fixed inset-0 z-50" : ""
      }`}
    >
      {/* Desktop header */}
      {!isMobile && (
        <header className="border-b theme-border theme-bg-primary/80 backdrop-blur-sm flex-shrink-0 relative z-30">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setCurrentBook(null)}
                  className="inline-flex items-center gap-2 rounded-lg border theme-border px-4 py-2 text-sm font-medium theme-text-primary hover\:theme-bg-secondary transition-colors cursor-pointer"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
                    />
                  </svg>
                  Back to Library
                </button>

                <div>
                  <h1 className="font-semibold text-lg theme-text-primary leading-tight">
                    {currentBook.metadata.title}
                  </h1>
                  {currentBook.metadata.author && (
                    <p className="text-sm theme-text-secondary">
                      {currentBook.metadata.author}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {displayReference && (
                  <div className="px-3 py-1.5 rounded-full theme-bg-tertiary text-xs theme-text-secondary mr-2">
                    {displayReference}
                  </div>
                )}
                {/* Fullscreen Button */}
                <button
                  onClick={toggleFullscreen}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                    isFullscreen
                      ? "theme-btn-primary"
                      : "theme-bg-tertiary theme-text-primary hover:theme-bg-tertiary"
                  }`}
                  title="Toggle Fullscreen"
                >
                  {isFullscreen ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="h-5 w-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25"
                      />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="h-5 w-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
                      />
                    </svg>
                  )}
                </button>
                {/* TTS Button - NEW */}
                {(format === "pdf" || format === "epub") && (
                  <button
                    onClick={() => setShowTTS(!showTTS)}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                      showTTS
                        ? "theme-btn-primary"
                        : "theme-bg-tertiary theme-text-primary hover:theme-bg-tertiary"
                    }`}
                    title="Text-to-Speech"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.5c-.69 0-1.25-.56-1.25-1.25v-6.5c0-.69.56-1.25 1.25-1.25h2.25Z"
                      />
                    </svg>
                    TTS
                  </button>
                )}
                {/* Search Button - NEW */}
                {(format === "pdf" || format === "epub") && (
                  <button
                    onClick={() => setShowSearch(!showSearch)}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                      showSearch
                        ? "theme-btn-primary"
                        : "theme-bg-tertiary theme-text-primary hover:theme-bg-tertiary"
                    }`}
                    title="Search in Book"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                      />
                    </svg>
                    Search
                  </button>
                )}

                {/* Notes Button */}
                <button
                  onClick={toggleNotes}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                    isNotesOpen
                      ? "theme-btn-primary"
                      : "theme-bg-tertiary theme-text-primary hover:theme-bg-tertiary"
                  }`}
                  title="Toggle Notes"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z"
                    />
                  </svg>
                  Notes
                </button>
                {/* Format Badge */}
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                    format === "pdf"
                      ? "bg-red-100 text-red-700"
                      : format === "epub"
                      ? "bg-green-100 text-green-700"
                      : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {format.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </header>
      )}

      {/* CONTENT + notes drawer */}
      <div
        className={`flex-1 flex overflow-y-hidden relative min-h-0 ${
          isMobile ? "pt-[calc(env(safe-area-inset-top)+52px)]" : ""
        }`}
      >
        <div
          className={`flex-1 relative transition-all duration-300 min-h-0 ${
            !isMobile && isNotesOpen ? "mr-80" : "mr-0"
          }`}
        >
          {renderReader()}
        </div>

        {/* Notes on desktop: right rail; on mobile: overlay from right */}
        <div
          className={`${
            isMobile
              ? "fixed inset-y-0 right-0 w-[88%] max-w-[26rem]"
              : "fixed right-0 h-[calc(100%-64px)] w-80"
          } z-40 transition-transform duration-300 theme-bg-primary border-l theme-border shadow-lg`}
          style={{
            transform: isNotesOpen ? "translateX(0)" : "translateX(100%)",
            paddingTop: isMobile ? "env(safe-area-inset-top)" : undefined,
            paddingBottom: isMobile ? "env(safe-area-inset-bottom)" : undefined,
          }}
          aria-hidden={!isNotesOpen}
          role="dialog"
          aria-label="Notes"
        >
          <NotesSidebar
            book={currentBook}
            isOpen={true}
            onToggle={toggleNotes}
            selectedText={selectedText}
            onNavigateToNote={handleNavigateToNote}
          />
        </div>

        {/* Backdrop for mobile notes */}
        {isMobile && isNotesOpen && (
          <button
            className="fixed inset-0 bg-black/40 z-30"
            onClick={toggleNotes}
            aria-label="Close notes"
          />
        )}
      </div>

      {/* Mobile Top Bar */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 z-30 theme-bg-primary/90 backdrop-blur-sm border-b theme-border pt-[env(safe-area-inset-top)]">
          <div className="px-3 py-2 flex items-center justify-between">
            <button
              onClick={() => setCurrentBook(null)}
              className="px-3 py-2 rounded-lg border theme-border theme-text-primary text-sm"
            >
              Back
            </button>
            <div className="min-w-0 flex-1 px-3">
              <p className="text-sm font-medium truncate theme-text-primary">
                {currentBook.metadata.title}
              </p>
              {currentBook.metadata.author && (
                <p className="text-xs theme-text-secondary truncate">
                  by {currentBook.metadata.author}
                </p>
              )}
            </div>
            <button
              onClick={() => setIsMenuOpen((v) => !v)}
              className="p-2 rounded-lg theme-bg-tertiary theme-text-primary"
              aria-label="Open menu"
            >
              {/* menu icon */}
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16m-7 6h7"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Mobile overflow menu */}
      {isMobile && isMenuOpen && (
        <div className="fixed inset-0 z-40">
          <button
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsMenuOpen(false)}
            aria-label="Close menu backdrop"
          />
          <div className="absolute right-2 top-[56px] rounded-xl theme-bg-primary shadow-2xl border theme-border w-60 overflow-hidden">
            <div className="p-2">
              {/* TTS Toggle Button - Only show for PDF and EPUB */}
              {(format === "pdf" || format === "epub") && (
                <button
                  onClick={() => {
                    setShowTTS(!showTTS);
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover\:theme-bg-secondary flex items-center gap-2"
                >
                  <svg
                    className="h-5 w-5 theme-text-secondary"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.5c-.69 0-1.25-.56-1.25-1.25v-6.5c0-.69.56-1.25 1.25-1.25h2.25Z"
                    />
                  </svg>
                  <span>
                    {showTTS ? "Hide Text-to-Speech" : "Open Text-to-Speech"}
                  </span>
                </button>
              )}

              {/* Search Button (mobile) */}
              {(format === "pdf" || format === "epub") && (
                <button
                  onClick={() => {
                    // Toggle search UI and close menu
                    setShowSearch(!showSearch);
                    // Optional: close TOC so panels don’t overlap
                    if (!showSearch) setIsTocOpen(false);
                    // Optional: close notes if you want a single panel at a time
                    // if (!showSearch && isNotesOpen) toggleNotes();
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover\:theme-bg-secondary flex items-center gap-2"
                >
                  <svg
                    className="h-5 w-5 theme-text-secondary"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                    />
                  </svg>
                  <span>{showSearch ? "Hide Search" : "Open Search"}</span>
                </button>
              )}

              {/* Table of Contents Button - ADD THIS */}
              {(format === "pdf" || format === "epub") && (
                <button
                  onClick={() => {
                    setIsTocOpen(!isTocOpen);
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover\:theme-bg-secondary flex items-center gap-2"
                >
                  <svg
                    className="h-5 w-5 theme-text-secondary"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                    />
                  </svg>
                  <span>
                    {isTocOpen ? "Hide Contents" : "Table of Contents"}
                  </span>
                </button>
              )}

              <button
                onClick={() => {
                  toggleNotes();
                  setIsMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover\:theme-bg-secondary"
              >
                {isNotesOpen ? "Hide notes" : "Open notes"}
              </button>
              <button
                onClick={() => {
                  toggleFullscreen();
                  setIsMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover\:theme-bg-secondary"
              >
                {isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
