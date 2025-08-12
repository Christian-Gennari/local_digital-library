import { memo, useEffect } from "react";

export interface TocItem {
  id: string;
  label: string;
  pageNumber: number;
  level: number;
  subitems?: TocItem[];
}

interface TocProps {
  tableOfContents: TocItem[];
  currentChapterId: string;
  openChapters: Set<string>;
  isTocOpen: boolean;
  onTocLinkClick: (pageNumber: number, chapterId: string) => void;
  onTocToggle: (chapterId: string) => void;
  onTocClose: () => void;
}

const HEADER_PX = 73;

// ---------------- Item ----------------
const TOCItem = memo(function TOCItem({
  item,
  currentChapterId,
  openChapters,
  onTocLinkClick,
  onTocToggle,
}: {
  item: TocItem;
  currentChapterId: string;
  openChapters: Set<string>;
  onTocLinkClick: (pageNumber: number, chapterId: string) => void;
  onTocToggle: (chapterId: string) => void;
}) {
  const isOpen = openChapters.has(item.id);
  const isCurrent = currentChapterId === item.id;
  const hasSubitems = !!(item.subitems && item.subitems.length);

  return (
    <li
      id={`toc-${item.id}`}
      className={`mb-1 ${isCurrent ? "currentChapter" : ""} ${
        isOpen ? "openChapter" : ""
      }`}
    >
      <div className="flex items-center gap-1 w-full">
        {hasSubitems ? (
          <button
            onClick={() => onTocToggle(item.id)}
            className="flex h-6 w-6 items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer flex-shrink-0"
            aria-label={isOpen ? "Collapse section" : "Expand section"}
          >
            <svg
              className={`h-3.5 w-3.5 transition-transform ${
                isOpen ? "rotate-90" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m8.25 4.5 7.5 7.5-7.5 7.5"
              />
            </svg>
          </button>
        ) : (
          <div className="w-6 flex-shrink-0" />
        )}

        <button
          onClick={() => onTocLinkClick(item.pageNumber, item.id)}
          className={`flex-1 text-left px-2 py-1.5 rounded-lg text-sm transition-colors cursor-pointer w-full ${
            isCurrent
              ? "bg-amber-50 text-amber-900 border border-amber-200"
              : "hover:bg-slate-50 text-slate-700 border border-transparent"
          }`}
          // indent by level
          style={{ paddingLeft: `${8 + (item.level - 1) * 12}px` }}
        >
          <div className="font-medium font-sans truncate">{item.label}</div>
          <div className="text-xs text-slate-500">Page {item.pageNumber}</div>
        </button>
      </div>

      {hasSubitems && isOpen && (
        <ul className="ml-2">
          {item.subitems!.map((sub) => (
            <TOCItem
              key={sub.id}
              item={sub}
              currentChapterId={currentChapterId}
              openChapters={openChapters}
              onTocLinkClick={onTocLinkClick}
              onTocToggle={onTocToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
});

// ---------------- Main ----------------
const TableOfContents = memo(function TableOfContents({
  tableOfContents,
  currentChapterId,
  openChapters,
  isTocOpen,
  onTocLinkClick,
  onTocToggle,
  onTocClose,
}: TocProps) {
  // Close on Escape (matches EPUB UX)
  useEffect(() => {
    if (!isTocOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onTocClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isTocOpen, onTocClose]);

  if (!isTocOpen) return null;

  return (
    <>
      {/* Backdrop on mobile */}
      <div
        className="fixed inset-0 z-40 bg-black/30 md:hidden"
        onClick={onTocClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        // Desktop: left sidebar under sticky app header
        // Mobile: full-screen drawer under header with safe-area padding
        className="
          fixed z-50 bg-white border-slate-200 shadow-xl
          md:left-0 md:top-[73px] md:h-[calc(100vh-73px)] md:w-80 md:border-r
          left-0 top-0 h-screen w-full md:rounded-none
        "
        role="dialog"
        aria-modal="true"
        aria-label="Table of contents"
        style={{
          paddingTop: `max(${HEADER_PX}px, env(safe-area-inset-top))`,
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex flex-col h-full overflow-x-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/40">
            <div className="flex items-center justify-between">
              <h3 className="font-sans font-semibold text-lg text-slate-900 flex items-center gap-2">
                <svg
                  className="h-5 w-5 text-slate-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                  />
                </svg>
                Contents
              </h3>
              <button
                onClick={onTocClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Close"
                aria-label="Close contents"
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
                    d="M15.75 19.5 8.25 12l7.5-7.5"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {tableOfContents.length > 0 ? (
              <ul className="p-2" id="tocView">
                {tableOfContents.map((item) => (
                  <TOCItem
                    key={item.id}
                    item={item}
                    currentChapterId={currentChapterId}
                    openChapters={openChapters}
                    onTocLinkClick={onTocLinkClick}
                    onTocToggle={onTocToggle}
                  />
                ))}
              </ul>
            ) : (
              <div className="p-4 text-center">
                <p className="text-sm font-sans font-medium text-slate-900 mb-1">
                  No contents available
                </p>
                <p className="text-xs font-serif text-slate-500">
                  This PDF doesn’t include an outline.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
});

export default TableOfContents;
