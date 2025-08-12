// src/components/ConflictResolutionModal.tsx
import { useEffect, useRef, useState, useCallback } from "react";
import { ConflictResolution } from "../types";

interface Props {
  conflictingName: string;
  suggestedAlternative: string;
  existingFolderContents: string[];
  onResolve: (resolution: ConflictResolution) => void;
}

export function ConflictResolutionModal({
  conflictingName,
  suggestedAlternative,
  existingFolderContents,
  onResolve,
}: Props) {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customName, setCustomName] = useState(conflictingName);
  const [stage, setStage] = useState<"main" | "overwriteConfirm">("main");

  const panelRef = useRef<HTMLDivElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);

  // Close helpers
  const handleCancel = useCallback(
    () => onResolve({ type: "cancel" }),
    [onResolve]
  );

  // Keyboard: Escape to close; basic focus trapping
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancel();
      if (e.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [handleCancel]);

  // Initial focus
  useEffect(() => {
    firstActionRef.current?.focus();
  }, [stage]);

  // Actions
  const handleAutoNumber = () => onResolve({ type: "auto-number" });

  const handleCustomName = () => {
    if (!showCustomInput) {
      setShowCustomInput(true);
      return;
    }
    if (!customName.trim()) {
      alert("Please enter a valid folder name");
      return;
    }
    onResolve({ type: "custom-name", customName: customName.trim() });
  };

  const handleOverwrite = () => {
    if (stage === "main") {
      setStage("overwriteConfirm");
      return;
    }
    onResolve({ type: "overwrite" });
  };

  // Shared outer shell: mobile = bottom sheet, desktop = centered dialog
  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <button
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleCancel}
        aria-label="Close"
      />

      {/* Panel */}
      {stage === "overwriteConfirm" ? (
        // OVERWRITE CONFIRM SHEET/DIALOG
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="overwrite-title"
          className="absolute inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 bg-white shadow-2xl md:rounded-2xl pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
        >
          {/* Grabber on mobile */}
          <div className="md:hidden pt-2">
            <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" />
          </div>

          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <svg
                  className="h-6 w-6 text-red-600"
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
              <h2
                id="overwrite-title"
                className="text-xl font-sans font-semibold text-red-600"
              >
                Overwrite Existing Folder?
              </h2>
            </div>

            <p className="text-slate-700 font-sans mb-4">
              This will permanently delete the existing folder{" "}
              <span className="font-medium text-slate-900">
                "{conflictingName}"
              </span>{" "}
              and all its contents:
            </p>

            <div className="bg-slate-50 rounded-lg p-4 mb-4 border border-slate-200 max-h-40 overflow-y-auto">
              <ul className="space-y-2">
                {existingFolderContents.map((file, index) => (
                  <li
                    key={index}
                    className="flex items-center gap-2 text-sm text-slate-600 font-sans"
                  >
                    <svg
                      className="h-3 w-3 text-slate-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                      />
                    </svg>
                    {file}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 text-red-600"
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
                <p className="text-sm text-red-700 font-sans font-medium">
                  This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                ref={firstActionRef}
                onClick={handleOverwrite}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-sans font-medium transition-colors cursor-pointer"
              >
                Delete & Overwrite
              </button>
              <button
                onClick={() => setStage("main")}
                className="px-4 py-3 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-sans font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        // MAIN OPTIONS SHEET/DIALOG
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="conflict-title"
          className="absolute inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 bg-white shadow-2xl md:rounded-2xl pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
        >
          {/* Grabber on mobile */}
          <div className="md:hidden pt-2">
            <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" />
          </div>

          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                <svg
                  className="h-6 w-6 text-slate-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25H11.69l-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v6.75Z"
                  />
                </svg>
              </div>
              <h2
                id="conflict-title"
                className="text-xl font-sans font-semibold text-slate-900"
              >
                Folder Name Conflict
              </h2>
            </div>

            <p className="text-slate-700 font-sans mb-6 leading-relaxed">
              A folder named{" "}
              <span className="font-medium text-slate-900">
                "{conflictingName}"
              </span>{" "}
              already exists.
              <br />
              What would you like to do?
            </p>

            <div className="space-y-4">
              {/* Auto-number Option */}
              <div className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <svg
                        className="h-4 w-4 text-blue-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z"
                        />
                      </svg>
                      <h3 className="font-sans font-medium text-slate-900">
                        Use auto-numbered name
                      </h3>
                    </div>
                    <p className="text-sm text-slate-600 font-sans">
                      "{suggestedAlternative}"
                    </p>
                  </div>
                  <button
                    ref={firstActionRef}
                    onClick={handleAutoNumber}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-sans font-medium transition-colors cursor-pointer"
                  >
                    Use This
                  </button>
                </div>
              </div>

              {/* Custom Name Option */}
              <div className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 hover:bg-slate-50 transition-colors">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <svg
                          className="h-4 w-4 text-green-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125"
                          />
                        </svg>
                        <h3 className="font-sans font-medium text-slate-900">
                          Choose a different name
                        </h3>
                      </div>
                      <p className="text-sm text-slate-600 font-sans">
                        Enter your own custom folder name
                      </p>
                    </div>
                    {!showCustomInput && (
                      <button
                        onClick={() => setShowCustomInput(true)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-sans font-medium transition-colors cursor-pointer"
                      >
                        Choose Name
                      </button>
                    )}
                  </div>

                  {showCustomInput && (
                    <div className="space-y-3 pt-3 border-t border-slate-200">
                      <input
                        type="text"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        placeholder="Enter new folder name"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 font-sans placeholder-slate-400"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleCustomName}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-sans font-medium transition-colors cursor-pointer"
                        >
                          Use Custom Name
                        </button>
                        <button
                          onClick={() => setShowCustomInput(false)}
                          className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-sans font-medium transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Overwrite Option */}
              <div className="border border-red-200 rounded-lg p-4 hover:border-red-300 hover:bg-red-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <svg
                        className="h-4 w-4 text-red-600"
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
                      <h3 className="font-sans font-medium text-red-700">
                        Overwrite existing folder
                      </h3>
                    </div>
                    <p className="text-sm text-red-600 font-sans">
                      Delete the existing folder and replace it
                    </p>
                  </div>
                  <button
                    onClick={handleOverwrite}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-sans font-medium transition-colors cursor-pointer"
                  >
                    Overwrite
                  </button>
                </div>
              </div>
            </div>

            {/* Cancel Button */}
            <div className="flex justify-center mt-6 pt-6 border-t border-slate-200">
              <button
                onClick={handleCancel}
                className="px-6 py-3 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-sans font-medium transition-colors cursor-pointer"
              >
                Cancel Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
