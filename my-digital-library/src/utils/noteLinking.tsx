import React, { ReactNode } from "react";

// Extract [[concept]] links from note content
export function parseNoteLinks(content: string): string[] {
  const linkRegex = /\[\[([^\]]+)\]\]/g;
  const concepts = new Set<string>();
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const concept = match[1].trim().toLowerCase();
    if (concept.length > 0) {
      concepts.add(concept);
    }
  }

  return Array.from(concepts);
}

// Render note content with clickable [[concept]] links
export function renderNoteContent(
  content: string,
  onLinkClick: (concept: string) => void
): ReactNode {
  // Split by the concept pattern, but only capture the full [[concept]]
  const linkRegex = /(\[\[[^\]]+\]\])/g;
  const parts = content.split(linkRegex);

  return (
    <>
      {parts.map((part, index) => {
        // Check if this part is a [[concept]] link
        if (part.startsWith("[[") && part.endsWith("]]")) {
          const concept = part.slice(2, -2);
          return (
            <button
              key={index}
              onClick={() => onLinkClick(concept.toLowerCase())}
              className="inline-flex items-center gap-1 px-1 py-0.5 text-blue-600 bg-blue-50 rounded cursor-pointer hover:bg-blue-100 transition-colors text-sm font-medium"
            >
              {concept}
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </button>
          );
        }
        // Skip empty strings
        if (!part) return null;

        return <span key={index}>{part}</span>;
      })}
    </>
  );
}
