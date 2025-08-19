// src/components/CategoriesInput.tsx
import React, { useState, useRef } from "react";

interface TagInputProps {
  value: string[] | undefined;
  onChange: (categories: string[]) => void;
  placeholder?: string;
  className?: string;
}

export const TagInput: React.FC<TagInputProps> = ({
  value = [],
  onChange,
  placeholder = "Type and press Enter to add",
  className = "w-full",
}) => {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (trimmedTag && !value.includes(trimmedTag)) {
      onChange([...value, trimmedTag]);
    }
    setInputValue("");
  };

  const removeTag = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (inputValue.trim()) {
        addTag(inputValue);
      }
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      // Remove last tag when backspace is pressed with empty input
      removeTag(value.length - 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text");
    const categories = pastedText
      .split(",")
      .map((cat) => cat.trim())
      .filter(Boolean);

    const newCategories = [...value];
    categories.forEach((cat) => {
      if (!newCategories.includes(cat)) {
        newCategories.push(cat);
      }
    });

    onChange(newCategories);
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2 mb-2 min-h-[32px]">
        {value.map((tag, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm theme-bg-tertiary theme-text-primary hover:bg-slate-200 transition-colors"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(index)}
              className="ml-1 theme-text-secondary hover:theme-text-primary focus:outline-none"
              aria-label={`Remove ${tag}`}
            >
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </span>
        ))}
      </div>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/20"
        placeholder={
          value.length === 0
            ? "Fiction, Science Fiction, Classic..."
            : placeholder
        }
      />
      <p className="mt-1 text-xs text-gray-500">
        Press Enter or use commas to add categories
      </p>
    </div>
  );
};
