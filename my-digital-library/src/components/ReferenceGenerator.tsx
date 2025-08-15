// src/components/ReferenceGenerator.tsx
import { useState, useRef, useEffect, useCallback } from "react";
import { Book } from "../types";
import { generateCitation } from "../utils/isbn";
import { getIdentifier } from "../utils/metadataHelpers";
import {
  DocumentDuplicateIcon,
  CheckIcon,
  AcademicCapIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

interface Props {
  book: Book;
  onClose: () => void;
}

export function ReferenceGenerator({ book, onClose }: Props) {
  const [selectedFormat, setSelectedFormat] = useState<
    "harvard" | "apa" | "chicago" | "mla"
  >("harvard");
  const [copied, setCopied] = useState(false);
  const citationRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const citation = generateCitation(
    book.metadata,
    selectedFormat,
    book.metadata.itemType === "article" ? "article" : "book"
  );

  // Clipboard: prefer async Clipboard API, fall back to execCommand
  const copyHTMLToClipboard = async (node: HTMLElement) => {
    const html = node.innerHTML;
    const plain = node.textContent || "";

    // Try navigator.clipboard (write with text/html when supported)
    try {
      if (
        "clipboard" in navigator &&
        "write" in navigator.clipboard &&
        "ClipboardItem" in window
      ) {
        const item = new (window as any).ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        });
        await (navigator.clipboard as any).write([item]);
        return true;
      }
      if ("clipboard" in navigator && "writeText" in navigator.clipboard) {
        await navigator.clipboard.writeText(plain);
        return true;
      }
    } catch {
      // fall through to legacy selection
    }

    try {
      const range = document.createRange();
      range.selectNodeContents(node);
      const sel = window.getSelection();
      if (!sel) return false;
      sel.removeAllRanges();
      sel.addRange(range);
      const ok = document.execCommand("copy");
      sel.removeAllRanges();
      return ok;
    } catch {
      return false;
    }
  };

  const handleCopy = async () => {
    if (!citationRef.current) return;
    const ok = await copyHTMLToClipboard(citationRef.current);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const formats = [
    {
      id: "harvard",
      name: "Harvard (Cite Them Right)",
      description: "Harvard referencing",
    },
    {
      id: "apa",
      name: "APA 7th Edition",
      description: "American Psychological Association",
    },
    {
      id: "chicago",
      name: "Chicago 17th Edition",
      description: "Chicago Manual of Style",
    },
    {
      id: "mla",
      name: "MLA 9th Edition",
      description: "Modern Language Association",
    },
  ];

  // Missing required-ish fields (just to inform user)
  const missingFields: string[] = [];
  if (!book.metadata.author) missingFields.push("Author");
  if (!book.metadata.publishedDate) missingFields.push("Publication Date");
  if (!book.metadata.publisher) missingFields.push("Publisher");
  if (selectedFormat === "chicago" && !book.metadata.placeOfPublication) {
    missingFields.push("Place of Publication");
  }

  // a11y: ESC to close and simple focus trap
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panelRef.current) {
        const nodes = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onKey]);

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <button
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />

      {/* Panel: mobile bottom sheet, desktop centered dialog */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="refgen-title"
        className="absolute inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 w-full md:max-w-4xl md:-translate-x-1/2 md:-translate-y-1/2 bg-white shadow-2xl md:rounded-xl pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] max-h-[95vh] flex flex-col"
      >
        {/* Grabber (mobile) */}
        <div className="md:hidden pt-2">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3 min-w-0">
            <AcademicCapIcon className="h-7 w-7 text-slate-600 flex-shrink-0" />
            <div className="min-w-0">
              <h2
                id="refgen-title"
                className="text-xl md:text-2xl font-bold text-gray-900"
              >
                Generate Reference
              </h2>
              <p className="text-sm text-gray-600 truncate">
                Citations for "
                <span className="font-medium">{book.metadata.title}</span>"
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100"
            aria-label="Close"
          >
            <XMarkIcon className="h-6 w-6 text-slate-600" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 md:p-6 overflow-y-auto">
          {/* Format Selection */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              Citation Format
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {formats.map((format) => {
                const active = selectedFormat === (format.id as any);
                return (
                  <button
                    key={format.id}
                    onClick={() => setSelectedFormat(format.id as any)}
                    className={`p-4 rounded-lg border-2 text-left transition-all cursor-pointer ${
                      active
                        ? "border-slate-600 bg-slate-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    aria-pressed={active}
                  >
                    <p className="font-medium text-gray-900">{format.name}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {format.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Missing Fields Warning */}
          {missingFields.length > 0 && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm font-medium text-amber-800 mb-1">
                Missing Information
              </p>
              <p className="text-sm text-amber-700">
                The following fields are missing and may affect citation
                accuracy:
              </p>
              <ul className="mt-2 text-sm text-amber-700 list-disc list-inside">
                {missingFields.map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Generated Citation */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              Generated Citation
            </h3>
            <div className="relative">
              <div
                className="p-4 bg-gray-50 rounded-lg border border-gray-200"
                ref={citationRef}
              >
                <p
                  className="text-sm text-gray-900 font-serif leading-relaxed break-words"
                  // generateCitation returns HTML (italics, etc.)
                  dangerouslySetInnerHTML={{ __html: citation }}
                />
              </div>
              <button
                onClick={handleCopy}
                className="absolute top-2 right-2 p-2 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow"
                title="Copy to clipboard"
                aria-live="polite"
              >
                {copied ? (
                  <CheckIcon className="h-5 w-5 text-green-600" />
                ) : (
                  <DocumentDuplicateIcon className="h-5 w-5 text-gray-600" />
                )}
              </button>
            </div>
            {copied && (
              <div
                className="mt-2 text-xs text-green-700"
                role="status"
                aria-live="polite"
              >
                Copied to clipboard
              </div>
            )}
          </div>

          {/* Citation Guidelines */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <h4 className="text-sm font-medium text-slate-900 mb-2">
              Citation Tips
            </h4>
            <ul className="text-sm text-slate-700 space-y-1">
              <li>
                • Book titles should be italicized in your final document.
              </li>
              <li>
                • Always verify the citation matches your institution’s
                requirements.
              </li>
              <li>• Include page numbers when citing specific passages.</li>
              {selectedFormat === "apa" &&
                getIdentifier(book.metadata, "doi") && (
                  <li>• APA prefers DOI over URL when available.</li>
                )}
              {selectedFormat === "mla" &&
                !book.metadata.url &&
                !getIdentifier(book.metadata, "doi") && (
                  <li>
                    • Consider adding the medium of publication (e.g., “Print”).
                  </li>
                )}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 md:px-6 py-4 border-t border-gray-200 flex flex-col-reverse sm:flex-row sm:items-center gap-3 sm:justify-end sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            className="px-6 py-2 text-gray-700 hover:text-gray-900 font-medium rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={handleCopy}
            className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 font-medium flex items-center gap-2 transition-colors cursor-pointer"
          >
            <DocumentDuplicateIcon className="h-5 w-5" />
            Copy Citation
          </button>
        </div>
      </div>
    </div>
  );
}
