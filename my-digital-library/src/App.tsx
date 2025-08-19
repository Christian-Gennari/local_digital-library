// src/App.tsx
import { useStore } from "./store";
import { useEffect } from "react";
import { LibraryLayout } from "./components/LibraryLayout";
import { BookViewer } from "./components/BookViewer";
import { BookMetadataEntry } from "./components/BookMetadataEntry";
import { ThemeProvider } from "./components/ThemeProvider";

function App() {
  const {
    currentBook,
    showMetadataModal,
    pendingBook,
    savePendingBookWithMetadata,
    skipMetadataForPendingBook,
  } = useStore();

  // Load books once on mount
  useEffect(() => {
    // call directly without adding it to deps
    useStore.getState().loadBooksFromFolder();
  }, []);

  return (
    <ThemeProvider>
      {/* Show reader if book is open */}
      {currentBook ? (
        <BookViewer />
      ) : (
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
        </>
      )}
    </ThemeProvider>
  );
}

export default App;
