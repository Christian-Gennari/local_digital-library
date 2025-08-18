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
      await openBook(book);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Notes about "{concept}"</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1"
              aria-label="Close modal"
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
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : linkedNotes.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No notes found for this concept.
            </div>
          ) : (
            <div className="space-y-4">
              {linkedNotes.map((note) => (
                <div
                  key={note.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500 font-medium">
                      {note.bookTitle}
                    </span>
                    <span className="text-xs text-gray-400">
                      {note.reference.value}
                    </span>
                  </div>

                  {note.quote && (
                    <blockquote className="text-sm italic text-gray-600 border-l-2 border-blue-200 pl-3 mb-3">
                      "{note.quote}"
                    </blockquote>
                  )}

                  <div className="text-sm text-gray-800 mb-3">
                    {renderNoteContent(note.content, () => {})}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-xs text-gray-400">
                      {new Date(note.createdAt).toLocaleDateString()}
                    </div>
                    <button
                      onClick={() => handleViewInContext(note)}
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
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
