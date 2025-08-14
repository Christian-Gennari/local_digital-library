// src/components/EpubReader.tsx
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useStore } from "../../../store";
import { useReading } from "../../ReadingContext";
import { useNotesStore } from "../../../notesStore";
import ePub from "epubjs";
import { HighlightService } from "../../../types";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import TableOfContents from "./ToCForEpubReader";
import { EpubHighlighting } from "./EpubHighlighting";
import {
  generateTocItems,
  matchSectionToToc,
  chapterNameFromSection,
  findParentPath,
  sectionRefFromLocation,
} from "../../../utils/epubToc";
import {
  PlusIcon,
  MinusIcon,
  Bars3Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { TTSPlayer } from "../../TTSPlayer"; // Adjust path as needed

export interface EpubReaderRef {
  displayCFI: (cfi: string) => void;
}

interface EpubReaderProps {
  epubUrl: string;
  isNotesOpen: boolean;
  currentBook: any;
  onRenditionReady?: (rendition: any) => void;
  showTTS?: boolean;
  setShowTTS?: (show: boolean) => void;
  isTocOpen?: boolean; // Make sure this line exists
  setIsTocOpen?: (open: boolean) => void;
}

const TOOLBAR_MOBILE_HEIGHT = 64; // keep toolbar compact and predictable

const EpubReader = forwardRef<EpubReaderRef, EpubReaderProps>(
  (
    {
      epubUrl,
      isNotesOpen,
      currentBook,
      onRenditionReady,
      showTTS = false,
      setShowTTS,
      isTocOpen: tocOpenProp, // Add this
      setIsTocOpen: setTocOpenProp, // Add this
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerShellRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<HTMLDivElement>(null);

    const [book, setBook] = useState<any>(null);
    const [rendition, setRendition] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [currentChapter, setCurrentChapter] = useState(1);
    const [totalChapters, setTotalChapters] = useState(0);

    const [fontSize, setFontSize] = useState<number>(100);

    const [tableOfContents, setTableOfContents] = useState<any[]>([]);
    const [localTocOpen, setLocalTocOpen] = useState(false);
    const isTocOpen = tocOpenProp !== undefined ? tocOpenProp : localTocOpen;
    const setIsTocOpen = setTocOpenProp || setLocalTocOpen;
    const [openChapters, setOpenChapters] = useState<Set<string>>(new Set());
    const [currentChapterId, setCurrentChapterId] = useState<string>("");
    // Touch swipe (mobile)
    const touchStartX = useRef<number | null>(null);
    const touchEndX = useRef<number | null>(null);

    const {
      setCurrentReference,
      handleEpubSelection,
      registerHighlightService,
      highlights,
      highlightsVisible,
    } = useReading();
    const { updateBookMetadata } = useStore();
    useNotesStore(); // kept if you rely on side-effects elsewhere

    const progressSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const locationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const clickByActionRef = useRef<(action: string) => void>(() => {});
    const selectionHandlerRef = useRef<(text: string | null) => void>(() => {});
    const restorePositionRef = useRef<(rend: any) => Promise<boolean>>(
      async () => false
    );

    // robust href → title mapping
    const [hrefTitleMap, setHrefTitleMap] = useState<Map<string, string>>(
      new Map()
    );
    const hrefTitleMapRef = useRef<Map<string, string>>(new Map());
    useEffect(() => {
      hrefTitleMapRef.current = hrefTitleMap;
    }, [hrefTitleMap]);

    const handleRegisterHighlightService = useCallback(
      (service: HighlightService) => {
        registerHighlightService(service);
      },
      [registerHighlightService]
    );

    const normalizeHref = (href?: string | null) => {
      if (!href) return "";
      try {
        const base = new URL(window.location.href);
        const u = new URL(href, base);
        u.hash = "";
        return u.pathname + u.search;
      } catch {
        return href.split("#")[0];
      }
    };

    const flattenToc = (
      items: Array<{
        href?: string;
        label?: string;
        subitems?: any[];
        children?: any[];
      }>,
      acc: Array<{ href: string; title: string }> = []
    ) => {
      if (!Array.isArray(items)) return acc;
      for (const it of items) {
        const href = it?.href || "";
        const title = it?.label || "";
        if (href && title) acc.push({ href, title });
        if (it?.subitems?.length) flattenToc(it.subitems, acc);
        if (it?.children?.length) flattenToc(it.children, acc);
      }
      return acc;
    };

    useImperativeHandle(
      ref,
      () => ({
        displayCFI: (cfi: string) => {
          if (rendition) {
            try {
              rendition.display(cfi);
            } catch (error) {
              console.error("Error navigating to CFI:", error);
            }
          }
        },
      }),
      [rendition]
    );

    const saveProgress = useCallback(
      (cfi: string, progressPercentage: number) => {
        if (progressSaveTimeoutRef.current) {
          clearTimeout(progressSaveTimeoutRef.current);
        }
        progressSaveTimeoutRef.current = setTimeout(async () => {
          try {
            await updateBookMetadata(currentBook.id, {
              readingProgress: Math.round(progressPercentage),
              lastRead: new Date().toISOString(),
              lastReadPosition: cfi,
            });
          } catch (error) {
            console.error("Failed to save reading progress:", error);
          }
        }, 2000);
      },
      [currentBook.id, updateBookMetadata]
    );

    const calculateProgress = useCallback((location: any, bookSpine: any) => {
      try {
        if (!location || !bookSpine) return 0;
        const spineItems = bookSpine.spineItems || bookSpine.items || [];
        if (spineItems.length === 0) return 0;
        const currentSection = bookSpine.get
          ? bookSpine.get(location.start.cfi)
          : null;
        const currentChapterIndex = currentSection
          ? spineItems.indexOf(currentSection)
          : 0;
        const pageInfo = location.start.displayed;
        const pageProgress = pageInfo
          ? (pageInfo.page - 1) / pageInfo.total
          : 0;
        const chapterProgress =
          (currentChapterIndex + pageProgress) / spineItems.length;
        return Math.max(0, Math.min(100, chapterProgress * 100));
      } catch (error) {
        console.warn("Error calculating progress:", error);
        return 0;
      }
    }, []);

    const restorePosition = useCallback(
      async (rend: any) => {
        if (!currentBook.metadata.lastReadPosition || !rend) return false;
        try {
          await rend.display(currentBook.metadata.lastReadPosition);
          return true;
        } catch (error) {
          console.warn("Could not restore reading position:", error);
          return false;
        }
      },
      [currentBook.metadata.lastReadPosition]
    );

    useEffect(() => {
      restorePositionRef.current = restorePosition;
    }, [restorePosition]);

    const handleTocLinkClick = useCallback(
      (href: string, chapterId: string) => {
        if (!rendition) return;
        try {
          rendition.display(href);
          setCurrentChapterId(chapterId);
          setOpenChapters((prev) => new Set([...prev, chapterId]));
          if (window.innerWidth < 768) setIsTocOpen(false);
        } catch (error) {
          console.error("Error navigating to chapter:", error);
        }
      },
      [rendition]
    );

    const handleTocToggle = useCallback((chapterId: string) => {
      setOpenChapters((prev) => {
        const next = new Set(prev);
        next.has(chapterId) ? next.delete(chapterId) : next.add(chapterId);
        return next;
      });
    }, []);

    // React to chapter changes to sync ToC expansion
    useEffect(() => {
      if (!book || !tableOfContents.length) return;
      const handleChapterChange = (location: any) => {
        setTimeout(() => {
          try {
            if (!location) return;
            const spine = book.spine;
            const currentSection = spine.get
              ? spine.get(location.start.cfi)
              : null;
            const sectionRef = currentSection
              ? { idref: currentSection.idref, href: currentSection.href }
              : sectionRefFromLocation(location);
            const matched = matchSectionToToc(tableOfContents, sectionRef);
            if (matched) {
              setCurrentChapterId(matched.id);
              const path = findParentPath(tableOfContents, matched.id);
              if (path.length)
                setOpenChapters((prev) => new Set([...prev, ...path]));
            }
          } catch {}
        }, 80);
      };
      if (rendition) {
        rendition.on("relocated", handleChapterChange);
        return () => rendition.off("relocated", handleChapterChange);
      }
    }, [book, tableOfContents, rendition]);

    // Resize when side panels change
    useEffect(() => {
      if (rendition && viewerRef.current) {
        const t = setTimeout(() => {
          try {
            const el = viewerRef.current!;
            rendition.resize(el.clientWidth, el.clientHeight);
          } catch {}
        }, 240);
        return () => clearTimeout(t);
      }
    }, [isNotesOpen, isTocOpen, rendition]);

    const goToPrevious = useCallback(() => rendition?.prev?.(), [rendition]);
    const goToNext = useCallback(() => rendition?.next?.(), [rendition]);

    const clamp = (n: number, min: number, max: number) =>
      Math.max(min, Math.min(max, n));

    const applyTheme = useCallback((r: any, size: number) => {
      if (!r) return;
      try {
        // Ensure centered, readable line length and consistent padding
        r.themes.register("reader-layout", {
          "html, body": {
            margin: "0",
            padding: "0",
            background: "#ffffff",
          },
          body: {
            margin: "0 auto",
            padding: "0 1rem",
            maxWidth: "min(720px, 92vw)", // Keep this as-is for mobile
            lineHeight: "1.65",
            color: "#0f172a",
          },
          // Add desktop-specific padding
          "@media (min-width: 768px)": {
            body: {
              padding: "2rem 2rem", // More generous padding on desktop
              maxWidth: "800px", // Fixed width on desktop for consistency
            },
          },
          p: {
            margin: "0 0 1rem 0",
          },
          img: {
            maxWidth: "100%",
            height: "auto",
          },
        });
        r.themes.select("reader-layout");
        r.themes.fontSize(`${size}%`);
      } catch {}
    }, []);

    const applyFontSize = useCallback(
      (size: number) => {
        if (!rendition) return;
        try {
          rendition.themes.fontSize(`${size}%`);
        } catch {}
      },
      [rendition]
    );

    const zoomIn = useCallback(() => {
      setFontSize((s) => {
        const next = clamp(Math.round(s + 5), 70, 200);
        setTimeout(() => applyFontSize(next), 0);
        return next;
      });
    }, [applyFontSize]);

    const zoomOut = useCallback(() => {
      setFontSize((s) => {
        const next = clamp(Math.round(s - 5), 70, 200);
        setTimeout(() => applyFontSize(next), 0);
        return next;
      });
    }, [applyFontSize]);

    const clickByAction = useCallback((action: string) => {
      const root = containerRef.current || document;
      const btn = root.querySelector<HTMLButtonElement>(
        `[data-epub-action="${action}"]`
      );
      if (btn && !btn.disabled) btn.click();
    }, []);
    useEffect(() => {
      clickByActionRef.current = clickByAction;
    }, [clickByAction]);

    useEffect(() => {
      selectionHandlerRef.current = (text: string | null) =>
        handleEpubSelection(text);
    }, [handleEpubSelection]);

    useEffect(() => {
      if (rendition) {
        try {
          applyTheme(rendition, fontSize);
        } catch {}
      }
    }, [rendition, fontSize, applyTheme]);

    // INIT
    useEffect(() => {
      if (!viewerRef.current || !epubUrl) return;
      setIsLoading(true);
      setError(null);

      let isCancelled = false;
      let resizeTimeout: NodeJS.Timeout | null = null;
      let newRendition: any = null;

      const newBook = ePub(epubUrl, { openAs: "epub" });
      setBook(newBook);

      const handleResize = () => {
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          if (newRendition && viewerRef.current) {
            const container = viewerRef.current;
            newRendition.resize(container.clientWidth, container.clientHeight);
          }
        }, 120);
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        const target = event.target as HTMLElement | null;
        const isEditable =
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            (target as any).isContentEditable);
        if (isEditable) return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;

        switch (event.key) {
          case "ArrowLeft":
            event.preventDefault();
            clickByActionRef.current("prev");
            break;
          case "ArrowRight":
            event.preventDefault();
            clickByActionRef.current("next");
            break;
          case "-":
          case "_":
          case "Subtract":
          case "NumpadSubtract":
            event.preventDefault();
            clickByActionRef.current("zoom-out");
            break;
          case "+":
          case "=":
          case "Add":
          case "NumpadAdd":
            event.preventDefault();
            clickByActionRef.current("zoom-in");
            break;
        }
      };

      const addIframeKeyListener = (view: any) => {
        try {
          const doc: Document | undefined =
            view?.document || view?.contents?.document;
          if (!doc) return;
          doc.addEventListener("keydown", handleKeyDown);
        } catch {}
      };
      const removeIframeKeyListener = (view: any) => {
        try {
          const doc: Document | undefined =
            view?.document || view?.contents?.document;
          if (!doc) return;
          doc.removeEventListener("keydown", handleKeyDown);
        } catch {}
      };

      const cleanUp = () => {
        if (locationTimeoutRef.current)
          clearTimeout(locationTimeoutRef.current);
        if (progressSaveTimeoutRef.current)
          clearTimeout(progressSaveTimeoutRef.current);
        if (resizeTimeout) clearTimeout(resizeTimeout);

        window.removeEventListener("resize", handleResize);
        window.removeEventListener("keydown", handleKeyDown);

        if (newRendition) {
          try {
            newRendition
              .views?.()
              ?.forEach?.((v: any) => removeIframeKeyListener(v));
            newRendition.off?.("rendered", onRendered);
            newRendition.off?.("removed", onRemoved);
          } catch {}
        }

        if (newBook) {
          try {
            newBook.destroy();
          } catch {}
        }
      };

      const onRendered = (_section: any, view: any) =>
        addIframeKeyListener(view);
      const onRemoved = (_view: any) => removeIframeKeyListener(_view);

      newBook.ready
        .then(async () => {
          if (isCancelled) return;

          const spine = newBook.spine as any;
          const spineLength =
            spine.spineItems?.length || spine.items?.length || 0;
          setTotalChapters(spineLength);

          // ToC
          try {
            const nav = await newBook.loaded.navigation;
            if (isCancelled) return;
            const toc = nav.toc || [];
            const processedToc = generateTocItems(toc);
            setTableOfContents(processedToc);

            const flat = flattenToc(toc);
            const map = new Map<string, string>();
            for (const { href, title } of flat)
              map.set(normalizeHref(href), title);
            setHrefTitleMap(map);
          } catch {}

          newRendition = newBook.renderTo(viewerRef.current!, {
            width: "100%",
            height: "100%",
            flow: "paginated",
            manager: "default",
            allowScriptedContent: true,
            snap: true,
            minSpreadWidth: 600,
            spread: "none",
          });

          setRendition(newRendition);
          onRenditionReady?.(newRendition);
          applyTheme(newRendition, fontSize);

          newRendition.on("selected", (_cfiRange: string, contents: any) => {
            try {
              const selection = contents.window.getSelection();
              const selectedText = selection?.toString().trim();
              if (selectedText && selectedText.length > 0) {
                selectionHandlerRef.current(selectedText);
              }
            } catch {}
          });
          newRendition.on("unselected", () =>
            selectionHandlerRef.current(null)
          );

          newRendition.on("relocated", (location: any) => {
            if ((newRendition as any).ttsNavigating) {
              console.log("📍 Skipping progress save - TTS is navigating");
              return;
            }

            selectionHandlerRef.current(null);

            if (locationTimeoutRef.current)
              clearTimeout(locationTimeoutRef.current);

            locationTimeoutRef.current = setTimeout(() => {
              try {
                const pageInfo = location.start.displayed;
                if (pageInfo) {
                  const page = pageInfo.page || 1;
                  const total = pageInfo.total || 1;
                  setCurrentPage(page);
                  setTotalPages(total);

                  const spine = newBook.spine as any;
                  const currentSection = spine.get
                    ? spine.get(location.start.cfi)
                    : null;

                  if (currentSection) {
                    const spineItems = spine.spineItems || spine.items || [];
                    const chapterIndex = spineItems.indexOf(currentSection) + 1;
                    setCurrentChapter(chapterIndex);

                    const rawHref: string =
                      (location?.start?.href as string) ||
                      (currentSection?.href as string) ||
                      "";
                    const normalized = normalizeHref(rawHref);
                    const titleFromMap =
                      hrefTitleMapRef.current.get(normalized) || null;

                    const sectionRef = {
                      idref: currentSection.idref,
                      href: currentSection.href,
                    };
                    const titleFromUtil =
                      chapterNameFromSection(tableOfContents, sectionRef) ||
                      null;

                    const chapterName =
                      titleFromMap || titleFromUtil || "Current Chapter";

                    setCurrentReference({
                      type: "cfi",
                      value: chapterName,
                      raw: location.start.cfi,
                    });
                  } else {
                    const rawHref: string =
                      (location?.start?.href as string) || "";
                    const normalized = normalizeHref(rawHref);
                    const titleFromMap =
                      hrefTitleMapRef.current.get(normalized) || null;

                    setCurrentReference({
                      type: "cfi",
                      value:
                        titleFromMap ||
                        chapterNameFromSection(
                          tableOfContents,
                          sectionRefFromLocation(location)
                        ) ||
                        "Current Location",
                      raw: location.start.cfi,
                    });
                  }

                  const progressPercentage = calculateProgress(location, spine);
                  if (progressPercentage > 0) {
                    saveProgress(location.start.cfi, progressPercentage);
                  }
                }
              } catch {}
            }, 160);
          });

          window.addEventListener("keydown", handleKeyDown);
          try {
            newRendition
              .views?.()
              ?.forEach?.((v: any) => addIframeKeyListener(v));
          } catch {}
          newRendition.on("rendered", onRendered);
          newRendition.on("removed", onRemoved);

          const restored = await restorePositionRef.current(newRendition);
          if (!restored) await newRendition.display();

          setIsLoading(false);
          setCurrentReference({
            type: "cfi",
            value: "Starting Chapter",
            raw: "start",
          });

          window.addEventListener("resize", handleResize);
        })
        .catch(() => {
          setError(
            "Failed to load EPUB file. The file may be corrupted or unsupported."
          );
          setIsLoading(false);
        });

      return () => {
        isCancelled = true;
        cleanUp();
      };
    }, [epubUrl, applyTheme]);

    // Touch swipe handlers (mobile)
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
      if (delta > 0) clickByActionRef.current("next");
      else clickByActionRef.current("prev");
    };

    const progressPercent =
      totalChapters > 0
        ? Math.round(
            ((currentChapter -
              1 +
              (totalPages ? currentPage / totalPages : 0)) /
              totalChapters) *
              100
          )
        : 0;

    return (
      <div ref={containerRef} className="flex h-full bg-slate-50 relative">
        {/* Highlighting */}
        <EpubHighlighting
          rendition={rendition}
          highlights={highlights}
          visible={highlightsVisible}
          onRegisterService={handleRegisterHighlightService}
        />

        {/* 🔥 ADD THE TTS COMPONENTS RIGHT HERE 🔥 */}
        {/* TTS Player - only show when enabled */}
        {showTTS && book && rendition && (
          <div className="fixed bottom-4 right-4 z-50 pb-[env(safe-area-inset-bottom)]">
            <TTSPlayer
              bookId={currentBook.id}
              bookType="epub"
              epubBook={book}
              epubRendition={rendition}
              className="bg-white shadow-lg rounded-lg border border-slate-200"
              onClose={() => setShowTTS?.(false)}
            />
          </div>
        )}

        {/* TTS Toggle Button - position it near your ToC button */}
        {!showTTS && (
          <button
            onClick={() => setShowTTS?.(true)} // Note the optional chaining
            className="fixed z-40 right-3 bottom-[calc(120px+env(safe-area-inset-bottom))] md:right-20 md:bottom-auto md:top-1/2 md:-translate-y-1/2 h-11 w-11 md:h-12 md:w-12 hidden md:flex items-center justify-center rounded-full bg-blue-600 shadow-lg text-white hover:bg-blue-700 hover:shadow-xl transition-all cursor-pointer"
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

        {/* 🔥 END OF TTS COMPONENTS 🔥 */}

        {/* ToC FAB — bottom-right on mobile, mid-left on desktop */}
        {!isTocOpen && (
          <button
            onClick={() => setIsTocOpen(true)}
            className="fixed z-40 md:left-4 md:top-1/2 md:-translate-y-1/2 right-3 md:right-auto md:bottom-auto bottom-[calc(60px+env(safe-area-inset-bottom))] h-11 w-11 md:h-12 md:w-12 hidden md:flex items-center justify-center rounded-full bg-white shadow-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:shadow-xl transition-all cursor-pointer"
            title="Table of Contents"
            aria-label="Table of Contents"
          >
            <Bars3Icon className="h-6 w-6" />
          </button>
        )}

        {/* ToC Sidebar / Drawer */}
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
          <div
            className={`flex-1 flex flex-col transition-all duration-300 min-h-0 ${
              isTocOpen ? "md:ml-80" : "md:ml-0"
            }`}
          >
            {/* Reading area shell keeps the content centered and above toolbar */}
            <div
              ref={viewerShellRef}
              className="flex-1 overflow-auto grid place-items-center p-3 md:p-8 lg:p-12 min-h-0"
              style={{
                paddingBottom: `max(${
                  TOOLBAR_MOBILE_HEIGHT + 16
                }px, env(safe-area-inset-bottom))`,
              }}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-20">
                  <div className="text-center p-6 bg-white rounded-xl shadow-lg max-w-md w-[92vw]">
                    <div className="mb-3 flex h-14 w-14 items-center justify-center mx-auto rounded-full bg-slate-100">
                      <svg
                        className="h-7 w-7 text-slate-600 animate-spin"
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
                    <h2 className="text-lg font-sans font-semibold text-slate-900 mb-1">
                      Loading EPUB…
                    </h2>
                    <p className="text-sm font-serif text-slate-600">
                      Preparing your book
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-20">
                  <div className="text-center p-6 bg-white rounded-xl shadow-lg max-w-md w-[92vw]">
                    <div className="mb-3 flex h-14 w-14 items-center justify-center mx-auto rounded-full bg-red-100">
                      <svg
                        className="h-7 w-7 text-red-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.1c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                        />
                      </svg>
                    </div>
                    <h2 className="text-lg font-sans font-semibold text-red-600 mb-1">
                      Error Loading Book
                    </h2>
                    <p className="text-sm font-serif text-slate-600 mb-4">
                      {error}
                    </p>
                    <button
                      onClick={() => window.location.reload()}
                      className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-sans font-medium text-white hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}

              {/* Centered white canvas that the rendition fills */}
              <div className="w-full h-full grid place-items-center">
                <div
                  ref={viewerRef}
                  className="w-full h-full bg-white rounded md:rounded-lg shadow-sm md:shadow-lg overflow-hidden
               md:max-w-5xl md:max-h-[90vh] md:mx-auto"
                  tabIndex={0}
                  style={{
                    userSelect: "text",
                    WebkitUserSelect: "text",
                  }}
                />
              </div>
            </div>

            {/* Compact bottom toolbar (mobile sticky, desktop static) */}
            <div
              className="bg-white border-t border-slate-200 md:static fixed bottom-0 left-0 right-0 z-30"
              style={{
                paddingBottom: "env(safe-area-inset-bottom)",
              }}
            >
              <div className="px-3 py-2 md:px-4 md:py-3 grid grid-cols-3 items-center gap-2">
                {/* Prev / Next */}
                <div className="flex items-center gap-2 justify-start">
                  <button
                    data-epub-action="prev"
                    onClick={goToPrevious}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer bg-slate-900 text-white hover:bg-slate-800"
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                    <span className="hidden xs:inline">Prev</span>
                  </button>
                  <button
                    data-epub-action="next"
                    onClick={goToNext}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer bg-slate-900 text-white hover:bg-slate-800"
                  >
                    <span className="hidden xs:inline">Next</span>
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                </div>

                {/* Zoom (center on desktop) */}
                <div className="flex items-center justify-center gap-3">
                  <button
                    data-epub-action="zoom-out"
                    aria-label="Font smaller"
                    onClick={zoomOut}
                    className="h-8 w-8 grid place-items-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 cursor-pointer"
                  >
                    <MinusIcon className="h-4 w-4" />
                  </button>
                  <span className="tabular-nums text-sm text-slate-700 min-w-[3ch] text-center">
                    {fontSize}%
                  </span>
                  <button
                    data-epub-action="zoom-in"
                    aria-label="Font larger"
                    onClick={zoomIn}
                    className="h-8 w-8 grid place-items-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 cursor-pointer"
                  >
                    <PlusIcon className="h-4 w-4" />
                  </button>
                </div>

                {/* Progress (right) */}
                <div className="flex items-center justify-end gap-2">
                  <div className="w-24 md:w-28 h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <span className="text-sm text-slate-600 font-medium tabular-nums">
                    {progressPercent}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

EpubReader.displayName = "EpubReader";

export default EpubReader;
