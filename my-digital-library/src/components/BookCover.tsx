// src/components/BookCover.tsx
import React, { memo, useState, useEffect, useRef } from "react";
import { Image } from "@unpic/react";
import { Book } from "../types";
import {
  BookOpenIcon,
  DocumentIcon,
  PlayIcon,
} from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/solid";
import { getCoverImageSrc } from "../utils/coverUtils";

interface BookCoverProps {
  book: Book;
  hideStarOverlay?: boolean;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
}

// Helper function for format icons
const getIconForFormat = (format: string) => {
  switch (format) {
    case "pdf":
      return <DocumentIcon className="h-16 w-16 theme-text-muted" />;
    case "epub":
      return <BookOpenIcon className="h-16 w-16 theme-text-muted" />;
    case "audio":
      return <PlayIcon className="h-16 w-16 theme-text-muted" />;
    default:
      return <BookOpenIcon className="h-16 w-16 theme-text-muted" />;
  }
};

const BookCover = memo<BookCoverProps>(
  ({
    book,
    hideStarOverlay = false,
    className = "relative aspect-[2/3] overflow-hidden rounded-xl ",
    width = 400,
    height = 600,
    priority = false,
  }) => {
    const [coverSrc, setCoverSrc] = useState<string | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const imgRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        },
        { rootMargin: "50px" }
      );

      if (imgRef.current) {
        observer.observe(imgRef.current);
      }

      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      if (isVisible) {
        getCoverImageSrc(book).then(setCoverSrc);
      }
    }, [book, isVisible]);

    return (
      <div ref={imgRef} className={className}>
        {isVisible && coverSrc ? (
          <Image
            src={coverSrc}
            alt={book.metadata.title}
            width={width}
            height={height}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] md:group-hover:scale-[1.03]"
            loading={priority ? "eager" : "lazy"}
            priority={priority}
            breakpoints={[200, 300, 400, 600]}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-8">
            {isVisible ? (
              getIconForFormat(book.format)
            ) : (
              <div className="h-16 w-16 rounded-lg theme-bg-tertiary animate-pulse" />
            )}
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 transition-colors duration-300 md:group-hover:bg-black/5" />

        {/* Favorite Star Overlay */}
        {book.metadata.isFavorite && !hideStarOverlay && (
          <div className="absolute top-2 left-2">
            <div className="bg-yellow-400 rounded-full p-1.5 shadow-lg">
              <StarIcon className="h-4 w-4 text-white" />
            </div>
          </div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison - only re-render if relevant props change
    return (
      prevProps.book.id === nextProps.book.id &&
      prevProps.book.metadata.isFavorite ===
        nextProps.book.metadata.isFavorite &&
      prevProps.book.metadata.coverUrl === nextProps.book.metadata.coverUrl &&
      prevProps.book.metadata.coverFile === nextProps.book.metadata.coverFile &&
      prevProps.hideStarOverlay === nextProps.hideStarOverlay &&
      prevProps.className === nextProps.className &&
      prevProps.width === nextProps.width &&
      prevProps.height === nextProps.height
    );
  }
);

BookCover.displayName = "BookCover";

export default BookCover;
