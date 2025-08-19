// src/components/LinkedConceptModal.tsx
import { useState, useEffect } from "react";
import { useStore } from "../store";
import { BookNote } from "../types";
import { renderNoteContent } from "../utils/noteLinking";

interface LinkedConceptModalProps {
  concept: string;
  onClose: () => void;
}

interface NoteWithBook extends BookNote {
  bookId: string;
  bookTitle: string;
}

export function LinkedConceptModal({
  concept,
  onClose,
}: LinkedConceptModalProps) {
  const [linkedNotes, setLinkedNotes] = useState<NoteWithBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNavigating, setIsNavigating] = useState(false);

  const { openBook, books } = useStore();

  useEffect(() => {
    async function loadNotesWithConcept() {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/notes/search?concept=${encodeURIComponent(concept)}`
        );
        if (response.ok) {
          const notes = await response.json();
          setLinkedNotes(notes);
        }
      } catch (error) {
        console.error("Failed to load linked notes:", error);
      } finally {
        setLoading(false);
      }
    }

    loadNotesWithConcept();
  }, [concept]);

  const handleViewInContext = async (note: NoteWithBook) => {
    const book = books.find((b) => b.id === note.bookId);
    if (book) {
      setIsNavigating(true);

      // Open the book first
      await openBook(book);

      // Give the BookViewer and ReadingProvider time to initialize
      // This ensures the highlight service is registered before we close the modal
      setTimeout(() => {
        // Navigate to the specific note location if needed
        // This could be enhanced to actually navigate to the note's reference
        if (note.reference) {
          // The navigation will be handled by the BookViewer's handleNavigateToNote
          // if we need to implement that feature
        }

        // Close the modal after everything is initialized
        onClose();
      }, 100); // Small delay to ensure proper initialization
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="theme-bg-primary rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b theme-border">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Notes about "{concept}"</h2>
            <button
              onClick={onClose}
              className="theme-text-muted hover\:theme-text-secondary p-1"
              aria-label="Close modal"
              disabled={isNavigating}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
          {loading ? (
            <div className="text-center py-8 theme-text-secondary">
              Loading...
            </div>
          ) : linkedNotes.length === 0 ? (
            <div className="text-center py-8 theme-text-secondary">
              No notes found for this concept.
            </div>
          ) : isNavigating ? (
            <div className="text-center py-8 theme-text-secondary">
              Opening book...
            </div>
          ) : (
            <div className="space-y-4">
              {linkedNotes.map((note) => (
                <div
                  key={note.id}
                  className="border theme-border rounded-lg p-4 hover:theme-border transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs theme-text-secondary font-medium">
                      {note.bookTitle}
                    </span>
                    <span className="text-xs theme-text-muted">
                      {note.reference.value}
                    </span>
                  </div>

                  {note.quote && (
                    <blockquote className="text-sm italic theme-text-secondary border-l-2 border-blue-200 pl-3 mb-3">
                      "{note.quote}"
                    </blockquote>
                  )}

                  <div className="text-sm theme-text-primary mb-3">
                    {renderNoteContent(note.content, () => {})}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-xs theme-text-muted">
                      {new Date(note.createdAt).toLocaleDateString()}
                    </div>
                    <button
                      onClick={() => handleViewInContext(note)}
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      disabled={isNavigating}
                    >
                      View in context
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
