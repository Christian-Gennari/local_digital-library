// src/components/CoverPreview.tsx
import React, { useRef } from "react";
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

  return (
    <div className={containerClassName}>
      <div className="flex-shrink-0">
        <div
          className={`${className} theme-bg-secondary rounded-lg border theme-border overflow-hidden flex items-center justify-center`}
        >
          {coverPreview ? (
            <Image
              src={coverPreview}
              alt="Book cover"
              width={200}
              height={300}
              className="w-full h-full object-cover"
              priority={true}
              breakpoints={[150, 200, 300]}
            />
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
