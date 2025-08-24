// src/components/CoverPreview.tsx
import React, { useRef, useState, useEffect } from "react";
import { Image } from "@unpic/react";

interface CoverPreviewProps {
  coverPreview: string | null;
  onCoverSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveCover: () => void;
  className?: string;
  containerClassName?: string;
}

const CoverPreview: React.FC<CoverPreviewProps> = ({
  coverPreview,
  onCoverSelect,
  onRemoveCover,
  className = "w-28 h-40 md:w-32 md:h-48",
  containerClassName = "mb-8 flex gap-4 md:gap-6 items-start flex-col sm:flex-row",
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  // Measure container width for responsive sizing
  useEffect(() => {
    const measureWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };

    measureWidth();
    window.addEventListener("resize", measureWidth);

    // Re-measure after fonts load
    if (document.fonts?.ready) {
      document.fonts.ready.then(measureWidth);
    }

    return () => window.removeEventListener("resize", measureWidth);
  }, []);

  // Calculate optimal breakpoints for preview context
  const getOptimalBreakpoints = (): number[] => {
    const dpr = window.devicePixelRatio || 1;

    // Preview-specific breakpoints (smaller than main covers)
    const baseBreakpoints = [
      128, // Tiny mobile preview
      192, // Small mobile preview
      256, // Standard mobile preview
      384, // Large mobile / small tablet
      512, // Tablet
      640, // Large tablet
      768, // Small desktop
      1024, // Desktop
      1280, // Large desktop
    ];

    // For high DPI screens, add larger sizes
    if (dpr > 1.5) {
      baseBreakpoints.push(1536, 1920);
    }

    // Filter based on actual container size if known
    if (containerWidth > 0) {
      const maxNeeded = Math.ceil(containerWidth * dpr * 1.5);
      return baseBreakpoints.filter((bp) => bp <= maxNeeded);
    }

    return baseBreakpoints;
  };

  // Generate sizes attribute for preview context
  const getSizesAttribute = (): string => {
    // Preview images are smaller, so different sizing logic
    return `
      (max-width: 640px) 112px,
      (max-width: 768px) 128px,
      192px
    `.trim();
  };

  return (
    <div className={containerClassName}>
      <div className="flex-shrink-0" ref={containerRef}>
        <div
          className={`${className} theme-bg-secondary rounded-lg border theme-border overflow-hidden flex items-center justify-center`}
        >
          {coverPreview ? (
            <div className="h-full w-full [&>img]:h-full [&>img]:w-full">
              <Image
                src={coverPreview}
                alt="Book cover preview"
                width={768} // Higher base resolution for quality
                height={1152} // Maintain 2:3 aspect ratio
                className="w-full h-full object-cover [image-rendering:high-quality] [-webkit-backface-visibility:hidden] [backface-visibility:hidden] [transform:translateZ(0)]"
                priority={true}
                breakpoints={getOptimalBreakpoints()}
                sizes={getSizesAttribute()}
                loading="eager" // Always eager for preview since it's user-interactive
              />
            </div>
          ) : (
            <svg
              className="h-10 w-10 md:h-12 md:w-12 theme-text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
          )}
        </div>
      </div>

      <div className="flex-1 w-full">
        <label className="block text-sm font-medium theme-text-secondary mb-2">
          Book Cover
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={onCoverSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 theme-bg-secondary theme-text-secondary rounded-lg hover\:theme-bg-tertiary text-sm font-medium transition-colors cursor-pointer"
          >
            Upload Cover
          </button>
          {coverPreview && (
            <button
              onClick={onRemoveCover}
              className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-medium transition-colors cursor-pointer"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CoverPreview;
