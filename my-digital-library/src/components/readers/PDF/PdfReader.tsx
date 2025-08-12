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
import { PlusIcon, MinusIcon } from "@heroicons/react/24/outline";
import { TTSPlayer } from "../../TTSPlayer";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface PdfReaderRef {
  goToPage: (pageNumber: number) => void;
}

interface PdfReaderProps {
  pdfUrl: string;
  currentBook: any;
}

const TOOLBAR_MOBILE_HEIGHT = 64; // px, for safe padding

const PdfReader = forwardRef<PdfReaderRef, PdfReaderProps>(
  ({ pdfUrl, currentBook }, ref) => {
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
    const [isTocOpen, setIsTocOpen] = useState(false);
    const [openChapters, setOpenChapters] = useState<Set<string>>(new Set());
    const [currentChapterId, setCurrentChapterId] = useState<string>("");

    const [showTTS, setShowTTS] = useState(false);
    const [pdfDocument, setPdfDocument] = useState<any>(null);

    // Layout measurement for responsive fit-to-width on mobile
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    // Touch swipe (mobile)
    const touchStartX = useRef<number | null>(null);
    const touchEndX = useRef<number | null>(null);

    const progressSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const clamp = (n: number, min: number, max: number) =>
      Math.max(min, Math.min(max, n));

    const isMobile = containerWidth > 0 && containerWidth < 768;
    // On mobile we clamp the page width for readability and consistent look.
    const mobilePageWidth = isMobile
      ? clamp(Math.floor(containerWidth - 24), 320, 560) // 12px side padding each side → 24
      : undefined;

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
      ]
    );

    // Capture selected text for note quoting
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const handleMouseUp = () => {
        const text = window.getSelection()?.toString().trim() || "";
        setSelectedText(text || null);
      };
      el.addEventListener("mouseup", handleMouseUp);
      return () => el.removeEventListener("mouseup", handleMouseUp);
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

    // Touch swipe navigation (mobile)
    const onTouchStart = (e: React.TouchEvent) => {
      touchEndX.current = null;
      touchStartX.current = e.touches[0]?.clientX ?? null;
    };
    const onTouchMove = (e: React.TouchEvent) => {
      touchEndX.current = e.touches[0]?.clientX ?? null;
    };
    const onTouchEnd = () => {
      if (touchStartX.current == null || touchEndX.current == null) return;
      const delta = touchStartX.current - touchEndX.current;
      const threshold = 60;
      if (Math.abs(delta) < threshold) return;
      if (delta > 0) goNext();
      else goPrev();
    };

    return (
      <div className="flex h-full bg-slate-50 relative">
        {/* ToC FAB on desktop; on mobile it sits bottom-right by CSS below */}
        {!isTocOpen && tableOfContents.length > 0 && (
          <button
            onClick={() => setIsTocOpen(true)}
            className="fixed z-30 md:left-4 md:top-1/2 md:-translate-y-1/2 right-3 md:right-auto md:bottom-auto bottom-[calc(60px+env(safe-area-inset-bottom))] flex h-11 w-11 md:h-12 md:w-12 items-center justify-center rounded-full bg-white shadow-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:shadow-xl transition-all duration-200 cursor-pointer"
            title="Show Contents"
            aria-label="Table of Contents"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              {/* SVG path */}
            </svg>
          </button>
        )}

        {/* 🔥 ADD THE TTS COMPONENTS RIGHT HERE 🔥 */}
        {/* TTS Player - only show when enabled */}
        {showTTS && pdfDocument && containerRef.current && (
          <div className="fixed top-4 right-4 z-50">
            <TTSPlayer
              bookId={currentBook.id}
              bookType="pdf"
              pdfDocument={pdfDocument}
              pdfContainer={containerRef.current}
              className="bg-white shadow-lg rounded-lg border border-slate-200"
              compact={true}
            />
          </div>
        )}

        {/* TTS Toggle Button */}
        {!showTTS && (
          <button
            onClick={() => setShowTTS(true)}
            className="fixed z-30 right-3 bottom-[calc(120px+env(safe-area-inset-bottom))] md:right-20 md:bottom-auto md:top-1/3 h-11 w-11 md:h-12 md:w-12 flex items-center justify-center rounded-full bg-blue-600 shadow-lg text-white hover:bg-blue-700 hover:shadow-xl transition-all duration-200 cursor-pointer"
            title="Text-to-Speech"
            aria-label="Text-to-Speech"
          >
            <svg
              className="h-6 w-6"
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
          </button>
        )}

        {/* Close TTS button when TTS is open */}
        {showTTS && (
          <button
            onClick={() => setShowTTS(false)}
            className="fixed z-50 top-4 right-[calc(100%+1rem)] md:right-4 md:top-16 h-8 w-8 flex items-center justify-center rounded-full bg-slate-600 text-white hover:bg-slate-700 transition-all cursor-pointer"
            title="Close TTS"
            aria-label="Close TTS"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
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
              className="flex-1 overflow-auto relative grid place-items-center p-3 md:p-4 min-h-0"
              style={{
                paddingBottom: `max(${
                  TOOLBAR_MOBILE_HEIGHT + 16
                }px, env(safe-area-inset-bottom))`,
              }}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              <div className="w-full">
                <Document
                  file={pdfUrl}
                  onLoadSuccess={onDocumentLoadSuccess}
                  loading={
                    <div className="p-8 text-center">Loading PDF...</div>
                  }
                  className="flex justify-center"
                >
                  {/* On mobile we fit to width; on desktop we honor scale */}
                  {mobilePageWidth ? (
                    <Page
                      pageNumber={currentPage}
                      width={mobilePageWidth}
                      renderAnnotationLayer
                      renderTextLayer
                    />
                  ) : (
                    <Page
                      pageNumber={currentPage}
                      scale={scale}
                      renderAnnotationLayer
                      renderTextLayer
                    />
                  )}
                </Document>

                <PdfHighlighting
                  containerRef={containerRef}
                  highlights={highlights}
                  visible={highlightsVisible}
                  scale={
                    mobilePageWidth
                      ? mobilePageWidth / 800
                      : scale /* fallback scale for overlay */
                  }
                  currentPage={currentPage}
                  onRegisterService={registerHighlightService}
                />
              </div>
            </div>

            {/* Toolbar: sticky on mobile, static on desktop */}
            <div
              className="bg-white border-t border-slate-200 md:static fixed bottom-0 left-0 right-0 z-30"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              <div className="px-3 py-2 md:px-4 md:py-3 grid grid-cols-3 items-center gap-2">
                {/* Prev/Next */}
                <div className="flex items-center gap-2 justify-start">
                  <button
                    onClick={goPrev}
                    disabled={currentPage <= 1}
                    className={`inline-flex items-center justify-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                      currentPage <= 1
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                  >
                    <span className="hidden xs:inline">Prev</span>
                    <span className="xs:hidden">←</span>
                  </button>
                  <button
                    onClick={goNext}
                    disabled={currentPage >= numPages}
                    className={`inline-flex items-center justify-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                      currentPage >= numPages
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                  >
                    <span className="hidden xs:inline">Next</span>
                    <span className="xs:hidden">→</span>
                  </button>
                </div>

                {/* Zoom + Page indicator */}
                <div className="flex items-center justify-center gap-3">
                  <button
                    aria-label="Zoom out"
                    onClick={zoomOut}
                    className="h-8 w-8 grid place-items-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 cursor-pointer disabled:opacity-50"
                    disabled={
                      !!mobilePageWidth /* disable on mobile fit-to-width */
                    }
                    title={
                      mobilePageWidth ? "Zoom disabled on mobile" : "Zoom out"
                    }
                  >
                    <MinusIcon className="h-4 w-4" />
                  </button>
                  <span className="tabular-nums text-sm text-slate-700 min-w-[3ch] text-center">
                    {mobilePageWidth ? "Fit" : `${Math.round(scale * 100)}%`}
                  </span>
                  <button
                    aria-label="Zoom in"
                    onClick={zoomIn}
                    className="h-8 w-8 grid place-items-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 cursor-pointer disabled:opacity-50"
                    disabled={!!mobilePageWidth}
                    title={
                      mobilePageWidth ? "Zoom disabled on mobile" : "Zoom in"
                    }
                  >
                    <PlusIcon className="h-4 w-4" />
                  </button>
                </div>

                {/* Progress */}
                <div className="flex items-center justify-end gap-2">
                  {numPages > 0 && (
                    <>
                      <div className="w-24 md:w-28 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{
                            width: `${(currentPage / numPages) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm text-slate-600 font-medium tabular-nums">
                        {Math.round((currentPage / numPages) * 100)}%
                      </span>
                    </>
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
