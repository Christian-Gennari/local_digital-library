// src/components/LibrarySetup.tsx
import { useEffect } from "react";
import { useStore, REMOTE_MODE } from "../store";

export function LibrarySetup() {
  const { libraryFolder, selectLibraryFolder, loadBooksFromFolder } =
    useStore();

  // In remote mode, the server provides the library. Kick off the initial load once.
  useEffect(() => {
    if (REMOTE_MODE) {
      // Fire and forget — the store will populate books from /api/books
      loadBooksFromFolder().catch((e) =>
        console.error("Failed to load remote library:", e)
      );
    }
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (REMOTE_MODE) {
    // Render nothing; the rest of the app (LibraryLayout) will show once books arrive
    return null;
  }

  if (libraryFolder) return null;

  const isFileSystemSupported = () => "showDirectoryPicker" in window;

  if (!isFileSystemSupported()) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6">
        <section className="max-w-md rounded-2xl border border-red-200 bg-red-50/50 p-8 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-8 w-8 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-sans font-semibold text-slate-900">
            Browser Not Supported
          </h1>
          <p className="mt-3 text-sm font-sans leading-relaxed text-slate-600">
            This app requires the{" "}
            <span className="font-medium">File System Access API</span>, which
            isn't available in your current browser.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-3 py-1 font-sans font-medium text-slate-700">
              Chrome
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 font-sans font-medium text-slate-700">
              Edge
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 font-sans font-medium text-slate-700">
              Opera
            </span>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <section className="w-full max-w-2xl text-center">
        {/* Icon */}
        <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100">
          <svg
            className="h-10 w-10 text-slate-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h12A2.25 2.25 0 0 1 20.25 6v3.776m-16.5 0a2.25 2.25 0 0 1 1.867-2.225 29.1 29.1 0 0 1 12.766 0A2.25 2.25 0 0 1 20.25 9.776m0 0V16.5a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V9.776"
            />
          </svg>
        </div>

        {/* Heading */}
        <div className="mb-8">
          <h1 className="text-4xl font-sans font-light tracking-tight text-slate-900">
            Welcome to Your Library
          </h1>
          <p className="mt-4 text-lg font-serif text-slate-600 leading-relaxed">
            Choose a folder to store your personal book collection. Everything
            stays private and secure on your device.
          </p>
        </div>

        {/* Action Button */}
        <button
          onClick={selectLibraryFolder}
          className="group inline-flex items-center gap-3 rounded-xl bg-slate-900 px-8 py-4 text-base font-sans font-medium text-white transition-all hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 cursor-pointer"
        >
          <svg
            className="h-5 w-5 transition-transform group-hover:scale-110"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25H11.69Z"
            />
          </svg>
          Choose Library Folder
        </button>

        {/* Privacy Note */}
        <div className="mt-12 flex items-center justify-center gap-2 text-sm font-sans text-slate-500">
          <svg
            className="h-4 w-4 text-emerald-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.623 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
            />
          </svg>
          <span>Your books stay completely private on your device</span>
        </div>
      </section>
    </main>
  );
}
