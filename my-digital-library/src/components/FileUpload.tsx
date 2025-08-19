// src/components/FileUpload.tsx

import { useState } from "react";
import { useStore } from "../store";
import {
  PlusIcon,
  DocumentIcon,
  BookOpenIcon,
  PlayIcon,
} from "@heroicons/react/24/outline";

export function FileUpload() {
  const { addBookToFolder } = useStore();
  const [isOpen, setIsOpen] = useState(false);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      addBookToFolder(file);
    });

    event.target.value = "";
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 rounded-full px-2 sm:px-4 py-2 text-sm font-medium transition-all cursor-pointer ${
          isOpen
            ? "bg-slate-700 text-white shadow-md"
            : "bg-slate-900 text-white hover:bg-slate-800"
        }`}
      >
        <PlusIcon
          className={`h-5 w-5 transition-transform duration-300 ${
            isOpen ? "rotate-45" : ""
          }`}
        />
        <span className="hidden sm:inline">Add</span>
      </button>

      {isOpen && (
        <div
          className="absolute mt-2 w-72 origin-top-right rounded-md theme-bg-primary shadow-lg 
           ring-1 ring-black ring-opacity-5 focus:outline-none z-50
           -ml-55 sm:ml-0"
        >
          <div className="p-4">
            <h3 className="text-sm font-medium theme-text-primary mb-2">
              Add books to your library
            </h3>
            <p className="text-xs theme-text-secondary mb-4">
              Click to browse or drag and drop files here.
            </p>

            <div
              className="relative flex h-24 items-center justify-center rounded-lg border-2 border-dashed theme-border theme-bg-secondary hover:theme-border transition-colors cursor-pointer"
              onDrop={(e) => {
                e.preventDefault();
                const files = e.dataTransfer.files;
                Array.from(files).forEach((file) => {
                  addBookToFolder(file);
                });
                setIsOpen(false);
              }}
              onDragOver={(e) => e.preventDefault()}
            >
              <input
                type="file"
                multiple
                accept=".pdf,.epub,audio/*"
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="text-center">
                <p className="text-sm font-medium theme-text-muted">
                  Drag & Drop Files
                </p>
                <p className="text-xs theme-text-muted">or click to browse</p>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-medium theme-text-secondary mb-1">
                Supported Formats:
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="flex items-center gap-1 rounded-full theme-bg-tertiary px-2 py-1 text-xs theme-text-secondary">
                  <DocumentIcon className="h-3 w-3" /> PDF
                </span>
                <span className="flex items-center gap-1 rounded-full theme-bg-tertiary px-2 py-1 text-xs theme-text-secondary">
                  <BookOpenIcon className="h-3 w-3" /> EPUB
                </span>
                <span className="flex items-center gap-1 rounded-full theme-bg-tertiary px-2 py-1 text-xs theme-text-secondary">
                  <PlayIcon className="h-3 w-3" /> Audio
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
