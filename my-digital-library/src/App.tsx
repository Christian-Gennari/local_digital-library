// src/App.tsx
import { useStore } from "./store";
import { useEffect } from "react";
import { LibraryLayout } from "./components/LibraryLayout";
import { BookViewer } from "./components/BookViewer";
import { BookMetadataEntry } from "./components/BookMetadataEntry";
import { ThemeProvider } from "./components/ThemeProvider";
import { SignedIn, SignedOut, SignIn } from "@clerk/clerk-react";

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
      <SignedOut>
        {/* Clerk's prebuilt sign-in UI - centered on the page */}
        <div className="flex items-center justify-center min-h-screen theme-bg-primary">
          <SignIn />
        </div>
      </SignedOut>

      <SignedIn>
        {/* Your existing app - exactly as it was */}
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
      </SignedIn>
    </ThemeProvider>
  );
}

export default App;
