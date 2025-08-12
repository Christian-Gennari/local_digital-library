// src/App.tsx
import { useStore } from "./store";
import { useEffect } from "react";
import { LibraryLayout } from "./components/LibraryLayout";
import { BookViewer } from "./components/BookViewer";
import { LibrarySetup } from "./components/LibrarySetup";
import { BookMetadataEntry } from "./components/BookMetadataEntry";
import { ConflictResolutionModal } from "./components/ConflictResolutionModal";
import { REMOTE_MODE } from "./store";

function App() {
  const {
    currentBook,
    libraryFolder,
    showMetadataModal,
    pendingBook,
    conflictResolution,
    savePendingBookWithMetadata,
    skipMetadataForPendingBook,
    resolveConflict,
  } = useStore();

  // Load once on mount in remote mode
  useEffect(() => {
    if (REMOTE_MODE) {
      // call directly without adding it to deps
      useStore.getState().loadBooksFromFolder();
    }
  }, []);

  // Show setup if no folder selected
  if (!libraryFolder && !REMOTE_MODE) {
    return <LibrarySetup />;
  }

  // Show reader if book is open
  if (currentBook) {
    return <BookViewer />;
  }

  return (
    <>
      <LibraryLayout />

      {/* Metadata Entry Modal */}
      {showMetadataModal && pendingBook && (
        <BookMetadataEntry
          fileName={pendingBook.name}
          onSave={(metadata, coverFile) =>
            savePendingBookWithMetadata(metadata, coverFile)
          }
          onSkip={skipMetadataForPendingBook}
        />
      )}

      {/* Conflict Resolution Modal */}
      {conflictResolution.show && (
        <ConflictResolutionModal
          conflictingName={conflictResolution.conflictingName}
          suggestedAlternative={conflictResolution.suggestedAlternative}
          existingFolderContents={conflictResolution.existingContents}
          onResolve={resolveConflict}
        />
      )}
    </>
  );
}

export default App;
