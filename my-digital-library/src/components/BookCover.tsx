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
    className = "relative aspect-[2/3] overflow-hidden rounded-xl",
    width = 800, // Increased default width for better quality
    height = 1200, // Increased default height for better quality
    priority = false,
  }) => {
    const [coverSrc, setCoverSrc] = useState<string | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const imgRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState<number>(0);

    // Measure container width for responsive sizing
    useEffect(() => {
      const measureWidth = () => {
        if (imgRef.current) {
          setContainerWidth(imgRef.current.offsetWidth);
        }
      };

      measureWidth();
      window.addEventListener("resize", measureWidth);

      // Re-measure after fonts load (can affect layout)
      if (document.fonts?.ready) {
        document.fonts.ready.then(measureWidth);
      }

      return () => window.removeEventListener("resize", measureWidth);
    }, []);

    // Intersection observer for lazy loading
    useEffect(() => {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        },
        {
          rootMargin: "100px", // Increased for earlier loading
          threshold: 0.01,
        }
      );

      if (imgRef.current) {
        observer.observe(imgRef.current);
      }

      return () => observer.disconnect();
    }, []);

    // Load cover source when visible
    useEffect(() => {
      if (isVisible) {
        getCoverImageSrc(book).then(setCoverSrc);
      }
    }, [book, isVisible]);

    // Calculate optimal breakpoints based on device capabilities
    const getOptimalBreakpoints = (): number[] => {
      const dpr = window.devicePixelRatio || 1;

      // Base breakpoints for different use cases
      const baseBreakpoints = [
        160, // Tiny thumbnails (mobile list view)
        240, // Small thumbnails
        320, // Medium thumbnails
        480, // Large thumbnails
        640, // Small cards
        800, // Medium cards (tablet)
        960, // Large cards
        1280, // Desktop standard
        1600, // Desktop large
        1920, // Full HD
        2560, // 2K
      ];

      // For high DPI screens, add even larger sizes
      if (dpr > 1.5) {
        baseBreakpoints.push(3200, 3840); // 4K support
      }

      // Filter to only include sizes up to 2x the container width (if known)
      if (containerWidth > 0) {
        const maxNeeded = Math.ceil(containerWidth * dpr * 1.5);
        return baseBreakpoints.filter((bp) => bp <= maxNeeded);
      }

      return baseBreakpoints;
    };

    // Generate sizes attribute for responsive loading
    const getSizesAttribute = (): string => {
      // This tells the browser what size the image will be at different viewport widths
      // Adjust based on your actual layout
      return `
        (max-width: 420px) 45vw,
        (max-width: 640px) 30vw,
        (max-width: 768px) 25vw,
        (max-width: 1024px) 20vw,
        (max-width: 1280px) 16vw,
        (max-width: 1536px) 14vw,
        12vw
      `.trim();
    };

    return (
      <div ref={imgRef} className={className}>
        {isVisible && coverSrc ? (
          <div className="h-full w-full [&>img]:h-full [&>img]:w-full">
            <Image
              src={coverSrc}
              alt={book.metadata.title}
              width={width}
              height={height}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] md:group-hover:scale-[1.03] [image-rendering:high-quality] [-webkit-backface-visibility:hidden] [backface-visibility:hidden] [transform:translateZ(0)]"
              loading={priority ? "eager" : "lazy"}
              priority={priority}
              breakpoints={getOptimalBreakpoints()}
              sizes={getSizesAttribute()}
            />
          </div>
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
      prevProps.height === nextProps.height &&
      prevProps.priority === nextProps.priority
    );
  }
);

BookCover.displayName = "BookCover";

export default BookCover;
