import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { useReading } from "../../ReadingContext";
import { useStore } from "../../../store";
import { PdfHighlighting } from "./PdfHighlighting";
import TableOfContents, { TocItem } from "./ToCForPdfReader";
import { PDFSearchService } from "../../../services/PDFSearchService";
import {
  PlusIcon,
  MinusIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  Bars3Icon,
} from "@heroicons/react/24/outline";
import { TTSPlayer } from "../../TTSPlayer";
import { ProgressBar } from "../../ProgressBar";
import { ReaderSearchBar } from "../shared/ReaderSearchBar";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface PdfReaderRef {
  goToPage: (pageNumber: number) => void;
}

interface PdfReaderProps {
  pdfUrl: string;
  currentBook: any;
  showTTS?: boolean; // Add this line
  setShowTTS?: (show: boolean) => void; // Add this line
  isTocOpen?: boolean; // Add this
  setIsTocOpen?: (open: boolean) => void; // Add this
  showSearch?: boolean; // Add this
  setShowSearch?: (show: boolean) => void; // Add this
}

const TOOLBAR_MOBILE_HEIGHT = 64; // px, for safe padding

const PdfReader = forwardRef<PdfReaderRef, PdfReaderProps>(
  (
    {
      pdfUrl,
      currentBook,
      showTTS = false,
      setShowTTS,
      isTocOpen: tocOpenProp, // Add this
      setIsTocOpen: setTocOpenProp, // Add this
      showSearch = false, // Add this
      setShowSearch, // Add this
    },
    ref
  ) => {
    const {
      setCurrentReference,
      registerHighlightService,
      highlights,
      highlightsVisible,
      setSelectedText,
    } = useReading();
    const { updateBookMetadata } = useStore();

    const [numPages, setNumPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [scale, setScale] = useState(1); // desktop zoom
    const [tableOfContents, setTableOfContents] = useState<TocItem[]>([]);
    const [localTocOpen, setLocalTocOpen] = useState(false);
    const isTocOpen = tocOpenProp !== undefined ? tocOpenProp : localTocOpen;
    const setIsTocOpen = setTocOpenProp || setLocalTocOpen;
    const [openChapters, setOpenChapters] = useState<Set<string>>(new Set());
    const [currentChapterId, setCurrentChapterId] = useState<string>("");
    const [pdfDocument, setPdfDocument] = useState<any>(null);

    // Search functionality
    const [searchService, setSearchService] = useState<PDFSearchService | null>(
      null
    );
    const [searchMatches, setSearchMatches] = useState(0);
    const [currentMatch, setCurrentMatch] = useState(0);
    const [searchReady, setSearchReady] = useState(false);

    // ⭐ NEW: optional local progress if you later want to display it
    const [cacheProgress, setCacheProgress] = useState(0); // 0..100

    // Get Page Size
    const [pageSize, setPageSize] = useState({ width: 595, height: 842 }); // default A4

    // Layout measurement for responsive fit-to-width on mobile
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    const progressSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const clamp = (n: number, min: number, max: number) =>
      Math.max(min, Math.min(max, n));

    const isMobile = containerWidth > 0 && containerWidth < 768;

    // Initialize search service when PDF document is loaded
    useEffect(() => {
      if (pdfDocument && containerRef.current) {
        // ⭐ NEW: create with progress + complete callbacks; start caching
        const service = new PDFSearchService(
          pdfDocument,
          containerRef,
          (page: number) => setCurrentPage(page),
          (p: number) =>
            setCacheProgress(Math.max(0, Math.min(100, Math.round(p)))), // onCachingProgress
          () => setSearchReady(true) // onCachingComplete -> enable search
        );
        setSearchService(service);

        // Until caching completes, keep the bar disabled
        setSearchReady(false);
        setCacheProgress(0);
        void service.cacheAllPages(); // warm the text index
        console.log("PDF search service initialized (caching started)");
      }

      return () => {
        searchService?.clear();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pdfDocument]);

    // Update search service when container ref changes
    useEffect(() => {
      if (searchService && containerRef.current) {
        searchService.updateContainerRef(containerRef);
      }
    }, [searchService, containerRef.current]);

    // Observe container width changes
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        const cr = entries[0]?.contentRect;
        if (cr?.width) setContainerWidth(cr.width);
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    const saveProgress = useCallback(
      (page: number, totalPages: number = numPages) => {
        if (progressSaveTimeoutRef.current) {
          clearTimeout(progressSaveTimeoutRef.current);
        }

        progressSaveTimeoutRef.current = setTimeout(async () => {
          try {
            const progressPercentage =
              totalPages > 0 ? (page / totalPages) * 100 : 0;
            await updateBookMetadata(currentBook.id, {
              readingProgress: Math.round(progressPercentage),
              lastRead: new Date().toISOString(),
              lastReadPosition: page,
              pageCount: totalPages,
            });
          } catch (e) {
            console.error("Failed to save PDF reading progress:", e);
          }
        }, 2000);
      },
      [numPages, currentBook.id, updateBookMetadata]
    );

    const goToPage = useCallback(
      (page: number) => {
        if (page < 1 || page > numPages) return;
        setCurrentPage(page);
        setCurrentReference({
          type: "page",
          value: `Page ${page}`,
          raw: page,
        });
        saveProgress(page);
      },
      [numPages, setCurrentReference, saveProgress]
    );

    useImperativeHandle(ref, () => ({ goToPage }), [goToPage]);

    // Helpers for keyboard + buttons
    const goPrev = useCallback(() => {
      if (currentPage > 1) goToPage(currentPage - 1);
    }, [currentPage, goToPage]);

    const goNext = useCallback(() => {
      if (currentPage < numPages) goToPage(currentPage + 1);
    }, [currentPage, numPages, goToPage]);

    const zoomIn = useCallback(() => {
      setScale((s) => clamp(Number((s + 0.1).toFixed(2)), 0.5, 2));
    }, []);

    const zoomOut = useCallback(() => {
      setScale((s) => clamp(Number((s - 0.1).toFixed(2)), 0.5, 2));
    }, []);

    const handleTocLinkClick = useCallback(
      (page: number, chapterId: string) => {
        goToPage(page);
        setCurrentChapterId(chapterId);
        if (isMobile) setIsTocOpen(false);
      },
      [goToPage, isMobile]
    );

    // Search handler functions
    const handleSearch = async (query: string) => {
      if (!searchService || !searchReady) {
        console.warn("Search service not ready yet");
        return;
      }

      const matches = await searchService.search(query);
      setSearchMatches(matches.length);

      if (matches.length > 0) {
        await searchService.navigateToMatch(0);
        setCurrentMatch(1);
      } else {
        setCurrentMatch(0);
      }
    };

    const handleNext = () => {
      if (!searchService || searchMatches === 0) return;
      searchService.next();
      setCurrentMatch((prev) => (prev % searchMatches) + 1);
    };

    const handlePrevious = () => {
      if (!searchService || searchMatches === 0) return;
      searchService.previous();
      setCurrentMatch((prev) => {
        const next = prev - 1;
        return next <= 0 ? searchMatches : next;
      });
    };

    const handleCloseSearch = () => {
      setShowSearch?.(false);
      searchService?.clear();
      setSearchMatches(0);
      setCurrentMatch(0);
    };

    // Add swipe gesture support
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      let startX: number | null = null;
      let startY: number | null = null;

      const handleTouchStart = (e: TouchEvent) => {
        startX = e.touches[0]?.clientX || null;
        startY = e.touches[0]?.clientY || null;
      };

      const handleTouchEnd = (e: TouchEvent) => {
        if (!startX || !startY) return;

        const endX = e.changedTouches[0]?.clientX;
        const endY = e.changedTouches[0]?.clientY;
        if (!endX || !endY) return;

        const deltaX = startX - endX;
        const deltaY = startY - endY;

        // Only trigger if horizontal swipe is dominant and significant
        if (
          Math.abs(deltaX) > 50 && // Lower threshold for better responsiveness
          Math.abs(deltaX) > Math.abs(deltaY) && // Horizontal swipe dominant
          !window.getSelection()?.toString().trim() // No text selected
        ) {
          if (deltaX > 0) {
            // Swipe left - go to next page
            goNext();
          } else {
            // Swipe right - go to previous page
            goPrev();
          }
        }

        startX = null;
        startY = null;
      };

      container.addEventListener("touchstart", handleTouchStart, {
        passive: true,
      });
      container.addEventListener("touchend", handleTouchEnd, { passive: true });

      return () => {
        container.removeEventListener("touchstart", handleTouchStart);
        container.removeEventListener("touchend", handleTouchEnd);
      };
    }, [goNext, goPrev]);

    const handleTocToggle = useCallback((chapterId: string) => {
      setOpenChapters((prev) => {
        const next = new Set(prev);
        if (next.has(chapterId)) next.delete(chapterId);
        else next.add(chapterId);
        return next;
      });
    }, []);

    const findParentPath = useCallback(
      (items: any[], targetId: string, path: string[] = []): string[] => {
        for (const it of items) {
          const newPath = [...path, it.id];
          if (it.id === targetId) return newPath;
          if (it.subitems) {
            const found = findParentPath(it.subitems, targetId, newPath);
            if (found.length) return found;
          }
        }
        return [];
      },
      []
    );

    const findCurrentToc = useCallback(
      (items: any[], page: number, current: any = null): any => {
        let match = current;
        for (const it of items) {
          if (it.pageNumber <= page) {
            if (!match || it.pageNumber > match.pageNumber) match = it;
          }
          if (it.subitems) {
            const sub = findCurrentToc(it.subitems, page, match);
            if (sub && sub.pageNumber <= page) {
              if (!match || sub.pageNumber > match.pageNumber) match = sub;
            }
          }
        }
        return match;
      },
      []
    );

    const onDocumentLoadSuccess = useCallback(
      async (pdf: any) => {
        setPdfDocument(pdf);
        setNumPages(pdf.numPages);

        // Get actual page dimensions
        const firstPage = await pdf.getPage(1);
        const viewport = firstPage.getViewport({ scale: 1 });
        setPageSize({
          width: viewport.width,
          height: viewport.height,
        });

        // Set initial scale to fit width on mobile
        if (containerWidth > 0 && containerWidth < 768) {
          const targetWidth = Math.min(containerWidth - 24, 560);
          setScale(targetWidth / viewport.width); // ← USE ACTUAL WIDTH HERE
        }

        const initialPage = currentBook.metadata.lastReadPosition || 1;
        setCurrentPage(initialPage);
        setCurrentReference({
          type: "page",
          value: `Page ${initialPage}`,
          raw: initialPage,
        });
        saveProgress(initialPage, pdf.numPages);

        const outline = await pdf.getOutline();
        if (outline) {
          const buildToc = async (
            items: any[],
            level = 1,
            prefix = ""
          ): Promise<any[]> => {
            const result: any[] = [];
            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              const id = prefix ? `${prefix}-${i}` : `${i}`;
              let pageNumber = 1;
              try {
                let dest = item.dest;
                if (typeof dest === "string")
                  dest = await pdf.getDestination(dest);
                if (Array.isArray(dest)) {
                  const [ref] = dest;
                  const pageIndex = await pdf.getPageIndex(ref);
                  pageNumber = pageIndex + 1;
                }
              } catch (e) {
                console.error("Failed to resolve outline destination", e);
              }
              result.push({
                id,
                label: item.title || `Section ${id}`,
                pageNumber,
                level,
                subitems: item.items
                  ? await buildToc(item.items, level + 1, id)
                  : [],
              });
            }
            return result;
          };

          const toc = await buildToc(outline);
          setTableOfContents(toc);
          const current = findCurrentToc(toc, initialPage);
          if (current) {
            setCurrentChapterId(current.id);
            setOpenChapters(new Set(findParentPath(toc, current.id)));
          }
        }
      },
      [
        currentBook.metadata.lastReadPosition,
        setCurrentReference,
        saveProgress,
        findCurrentToc,
        findParentPath,
        containerWidth,
      ]
    );

    // Capture selected text for note quoting
    // Capture selected text for note quoting
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const handleSelection = () => {
        const text = window.getSelection()?.toString().trim() || "";
        setSelectedText(text || null);
        console.log(
          "[PdfReader] Setting selected text:",
          text?.substring(0, 50)
        );
      };

      // Desktop
      el.addEventListener("mouseup", handleSelection);

      // Mobile - add delay for selection to finalize
      const handleTouchEnd = () => {
        setTimeout(handleSelection, 100);
      };
      el.addEventListener("touchend", handleTouchEnd);

      // Alternative: listen to selection changes
      const handleSelectionChange = () => {
        const selection = window.getSelection();
        if (selection && selection.toString().trim()) {
          const range = selection.getRangeAt(0);
          if (el.contains(range.commonAncestorContainer as Node)) {
            handleSelection();
          }
        }
      };
      document.addEventListener("selectionchange", handleSelectionChange);

      return () => {
        el.removeEventListener("mouseup", handleSelection);
        el.removeEventListener("touchend", handleTouchEnd);
        document.removeEventListener("selectionchange", handleSelectionChange);
      };
    }, [setSelectedText]);

    useEffect(() => {
      const current = findCurrentToc(tableOfContents, currentPage);
      if (current) {
        setCurrentChapterId(current.id);
        setOpenChapters(new Set(findParentPath(tableOfContents, current.id)));
      }
    }, [currentPage, tableOfContents, findCurrentToc, findParentPath]);

    // Keyboard navigation: arrows for pages, +/- for zoom (desktop helpful)
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement | null;
        const isEditable =
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            (target as HTMLElement).isContentEditable);

        if (isEditable) return;

        if (e.key === "ArrowLeft") {
          e.preventDefault();
          goPrev();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          goNext();
        } else if (
          e.key === "-" ||
          e.code === "NumpadSubtract" ||
          e.key === "Subtract"
        ) {
          e.preventDefault();
          zoomOut();
        } else if (
          e.key === "+" ||
          e.key === "=" ||
          e.code === "NumpadAdd" ||
          e.key === "Add"
        ) {
          e.preventDefault();
          zoomIn();
        }
      };

      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [goPrev, goNext, zoomIn, zoomOut]);

    useEffect(() => {
      return () => {
        if (progressSaveTimeoutRef.current) {
          // Change from progressTimeoutRef to progressSaveTimeoutRef
          clearTimeout(progressSaveTimeoutRef.current);
        }
        // Clean up search service
        searchService?.destroy();
      };
    }, [searchService]);

    return (
      <div className="flex h-full theme-bg-secondary relative">
        {/* Search Bar */}
        <ReaderSearchBar
          isVisible={showSearch}
          isReady={searchReady}
          onSearch={handleSearch}
          onNext={handleNext}
          onPrevious={handlePrevious}
          onClose={handleCloseSearch}
          currentMatch={currentMatch}
          totalMatches={searchMatches}
        />
        {/* ToC FAB on desktop; on mobile it sits bottom-right by CSS below */}
        {!isTocOpen && tableOfContents.length > 0 && (
          <button
            onClick={() => setIsTocOpen(true)}
            className="fixed z-40 md:left-4 md:top-1/2 md:-translate-y-1/2 right-3 md:right-auto md:bottom-auto bottom-[calc(60px+env(safe-area-inset-bottom))] h-11 w-11 md:h-12 md:w-12 hidden md:flex items-center justify-center rounded-full theme-bg-primary shadow-lg border theme-border theme-text-secondary hover\:theme-bg-secondary hover:shadow-xl transition-all cursor-pointer"
            title="Show Contents"
            aria-label="Table of Contents"
          >
            <Bars3Icon className="h-6 w-6" />
          </button>
        )}

        {/* 🔥 ADD THE TTS COMPONENTS RIGHT HERE 🔥 */}
        {/* TTS Player - only show when enabled */}
        {showTTS && pdfDocument && containerRef.current && (
          <div className="fixed bottom-16 right-4 z-50 pb-[env(safe-area-inset-bottom)]">
            <TTSPlayer
              bookId={currentBook.id}
              bookType="pdf"
              pdfDocument={pdfDocument}
              pdfContainer={containerRef.current}
              onClose={() => setShowTTS?.(false)}
            />
          </div>
        )}

        {/* 🔥 END OF TTS COMPONENTS 🔥 */}

        <TableOfContents
          tableOfContents={tableOfContents}
          currentChapterId={currentChapterId}
          openChapters={openChapters}
          isTocOpen={isTocOpen}
          onTocLinkClick={handleTocLinkClick}
          onTocToggle={handleTocToggle}
          onTocClose={() => setIsTocOpen(false)}
        />

        {/* Main column */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Wrapper that shifts with the ToC */}
          <div
            className={`flex-1 flex flex-col transition-all duration-300 min-h-0 ${
              isTocOpen ? "md:ml-80" : "md:ml-0"
            }`}
          >
            {/* Scrollable PDF area */}
            <div
              ref={containerRef}
              className="flex-1 overflow-auto relative p-3 md:p-4 min-h-0"
              style={{
                paddingBottom: `max(${
                  TOOLBAR_MOBILE_HEIGHT + 16
                }px, env(safe-area-inset-bottom))`,
              }}
            >
              <div
                className={isMobile && scale > 1 ? "" : "flex justify-center"}
              >
                <Document
                  file={pdfUrl}
                  onLoadSuccess={onDocumentLoadSuccess}
                  loading={
                    <div className="flex items-center justify-center min-h-[400px] w-full">
                      <div className="text-center p-6 rounded-xl shadow-lg max-w-md mx-4">
                        <div className="mb-3 flex h-14 w-14 items-center justify-center mx-auto rounded-full theme-bg-tertiary">
                          <svg
                            className="h-7 w-7 theme-text-secondary animate-spin"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                        </div>
                        <h2 className="text-lg font-sans font-semibold theme-text-primary mb-1">
                          Loading PDF…
                        </h2>
                        <p className="text-sm font-serif theme-text-secondary">
                          Preparing your document
                        </p>
                      </div>
                    </div>
                  }
                  className={isMobile && scale > 1 ? "" : "flex justify-center"}
                >
                  {/* Wrapper div for the page with positioning and data attribute */}
                  <div
                    className="relative inline-block"
                    data-page-number={currentPage}
                  >
                    <Page
                      pageNumber={currentPage}
                      scale={scale}
                      renderAnnotationLayer
                      renderTextLayer
                      loading={
                        <div
                          style={{
                            width: `${pageSize.width * scale}px`,
                            height: `${pageSize.height * scale}px`,
                          }}
                        />
                      }
                    />
                  </div>
                </Document>

                <PdfHighlighting
                  containerRef={containerRef}
                  highlights={highlights}
                  visible={highlightsVisible}
                  scale={scale}
                  currentPage={currentPage}
                  onRegisterService={registerHighlightService}
                />
              </div>
            </div>

            {/* Toolbar: sticky on mobile, static on desktop */}
            <div
              className="theme-bg-primary border-t theme-border md:static fixed bottom-0 left-0 right-0 z-30"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              <div className="px-3 py-2 md:px-4 md:py-3 grid grid-cols-3 items-center gap-2">
                {/* Prev/Next */}
                <div className="flex items-center gap-2 justify-start">
                  <button
                    onClick={goPrev}
                    disabled={currentPage <= 1}
                    className={`inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                      currentPage <= 1
                        ? "theme-bg-tertiary theme-text-muted cursor-not-allowed"
                        : "theme-btn-primary hover:theme-btn-primary"
                    }`}
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                    <span className="hidden xs:inline">Prev</span>
                  </button>
                  <button
                    onClick={goNext}
                    disabled={currentPage >= numPages}
                    className={`inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                      currentPage >= numPages
                        ? "theme-bg-tertiary theme-text-muted cursor-not-allowed"
                        : "theme-btn-primary hover:theme-btn-primary"
                    }`}
                  >
                    <span className="hidden xs:inline">Next</span>
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                </div>

                {/* Zoom */}
                <div className="flex items-center justify-center gap-3">
                  <button
                    aria-label="Zoom out"
                    onClick={zoomOut}
                    className="h-8 w-8 grid place-items-center rounded-md border theme-border theme-bg-primary theme-text-primary hover\:theme-bg-secondary active\:theme-bg-tertiary cursor-pointer"
                  >
                    <MinusIcon className="h-4 w-4" />
                  </button>
                  <span className="tabular-nums text-sm theme-text-primary min-w-[3ch] text-center">
                    {`${Math.round(scale * 100)}%`}
                  </span>
                  <button
                    aria-label="Zoom in"
                    onClick={zoomIn}
                    className="h-8 w-8 grid place-items-center rounded-md border theme-border theme-bg-primary theme-text-primary hover\:theme-bg-secondary active\:theme-bg-tertiary cursor-pointer"
                  >
                    <PlusIcon className="h-4 w-4" />
                  </button>
                </div>

                {/* Progress */}
                <div className="flex items-center justify-end">
                  {numPages > 0 && (
                    <div className="flex items-center justify-end gap-2">
                      <ProgressBar
                        progress={
                          numPages > 0
                            ? Math.round((currentPage / numPages) * 100)
                            : 0
                        }
                        variant="reader"
                        size="md"
                        className="w-24 md:w-28"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

PdfReader.displayName = "PdfReader";

export default PdfReader;
