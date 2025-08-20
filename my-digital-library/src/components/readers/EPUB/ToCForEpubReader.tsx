// src/components/ToCForEpubReader.tsx
import { memo } from "react";

interface TocItem {
  id: string;
  label: string;
  href: string;
  level: number;
  subitems?: TocItem[];
}

interface TocProps {
  tableOfContents: TocItem[];
  currentChapterId: string;
  openChapters: Set<string>;
  isTocOpen: boolean;
  onTocLinkClick: (href: string, chapterId: string) => void;
  onTocToggle: (chapterId: string) => void;
  onTocClose: () => void;
}

// Individual ToC Item Component
const TOCItem = memo(
  ({
    item,
    currentChapterId,
    openChapters,
    onTocLinkClick,
    onTocToggle,
  }: {
    item: TocItem;
    currentChapterId: string;
    openChapters: Set<string>;
    onTocLinkClick: (href: string, chapterId: string) => void;
    onTocToggle: (chapterId: string) => void;
  }) => {
    const isOpen = openChapters.has(item.id);
    const isCurrent =
      currentChapterId === item.id ||
      (item.href && item.href.includes(currentChapterId));
    const hasSubitems = item.subitems && item.subitems.length > 0;

    return (
      <li
        id={`toc-${item.id}`}
        className={`list_item mb-1 ${isCurrent ? "currentChapter" : ""} ${
          isOpen ? "openChapter" : ""
        }`}
      >
        <div className="flex items-center gap-1 w-full">
          {hasSubitems ? (
            <button
              onClick={() => onTocToggle(item.id)}
              className="toc_toggle flex h-5 w-5 items-center justify-center theme-text-muted hover\:theme-text-secondary cursor-pointer flex-shrink-0"
            >
              <svg
                className={`h-3 w-3 transition-transform ${
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
            <div className="w-5 flex-shrink-0" />
          )}
          <button
            onClick={() => onTocLinkClick(item.href, item.id)}
            className={`toc_link flex-1 text-left px-2 py-1 rounded-lg text-sm transition-colors cursor-pointer ${
              isCurrent
                ? "bg-amber-50 text-amber-900 border border-amber-200"
                : "hover:theme-bg-secondary theme-text-primary border border-transparent"
            } w-full`}
            style={{ paddingLeft: `${8 + (item.level - 1) * 12}px` }}
          >
            <div className="font-medium font-sans">{item.label}</div>
          </button>
        </div>
        {hasSubitems && isOpen && (
          <ul className="ml-2">
            {(item.subitems ?? []).map((subItem: TocItem) => (
              <TOCItem
                key={subItem.id}
                item={subItem}
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
  }
);

// Main ToC Component
const TableOfContents = memo(
  ({
    tableOfContents,
    currentChapterId,
    openChapters,
    isTocOpen,
    onTocLinkClick,
    onTocToggle,
    onTocClose,
  }: TocProps) => {
    if (!isTocOpen) return null;

    const isMobile =
      typeof window !== "undefined" ? window.innerWidth < 768 : false;

    return (
      <>
        {/* Backdrop only on mobile */}
        {isMobile && (
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={onTocClose}
            aria-hidden="true"
          />
        )}

        <div
          className={`fixed left-0 z-50 theme-bg-primary border-r theme-border shadow-xl ${
            isMobile ? "w-full top-0 h-[100dvh]" : "w-80"
          }`}
          style={
            !isMobile
              ? { top: "76px", height: "calc(100dvh - 73px)" }
              : undefined
          }
          role="dialog"
          aria-modal="true"
          aria-label="Table of contents"
        >
          <div className="theme-bg-primary flex flex-col h-full overflow-x-hidden">
            <div className="p-4 border-b theme-border theme-bg-secondary/30">
              <div className="flex items-center justify-between">
                <h3 className="font-sans font-semibold text-lg theme-text-primary flex items-center gap-2">
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
                      d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                    />
                  </svg>
                  Contents
                </h3>
                <button
                  onClick={onTocClose}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border theme-border theme-text-secondary hover\:theme-bg-tertiary transition-colors cursor-pointer"
                  title="Hide Contents"
                  aria-label="Hide Contents"
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
                  <p className="text-sm font-sans font-medium theme-text-primary mb-1">
                    No contents available
                  </p>
                  <p className="text-xs font-serif theme-text-secondary">
                    This book doesn't have a table of contents
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }
);

export default TableOfContents;
