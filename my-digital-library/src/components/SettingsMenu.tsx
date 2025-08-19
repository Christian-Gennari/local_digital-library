import { useEffect, useRef, useState } from "react";
import { ThemeSelector } from "./ThemeSelector";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";

export function SettingsMenu({ isMobile }: { isMobile: boolean }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const el = containerRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // panel styles per layout
  const panelClass = isMobile
    ? "absolute right-0 top-10 z-50 w-[calc(100vw-1.5rem)] max-w-sm theme-bg-primary rounded-lg border theme-border shadow-lg"
    : "absolute right-0 mt-2 z-50 w-96 theme-bg-primary rounded-lg shadow-xl border theme-border overflow-hidden";

  const headerClass = "border-b theme-border px-4 py-3 theme-bg-secondary";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${
          isMobile ? "p-2" : "p-2.5"
        } rounded-lg transition-colors ${
          open
            ? "theme-bg-tertiary theme-text-primary"
            : "theme-text-secondary hover:theme-text-primary hover:theme-bg-tertiary"
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Settings"
      >
        <Cog6ToothIcon className={isMobile ? "h-5 w-5" : "h-6 w-6"} />
      </button>

      {open && (
        <div
          className={panelClass}
          role="menu"
          onMouseDown={(e) => e.stopPropagation()} // protect against mousedown bubbling
        >
          <div className={headerClass}>
            <h3 className="text-sm font-semibold theme-text-primary">
              Settings
            </h3>
          </div>
          <div
            className={
              isMobile
                ? "max-h-[400px] overflow-y-auto"
                : "max-h-[600px] overflow-y-auto"
            }
          >
            <ThemeSelector />
          </div>
        </div>
      )}
    </div>
  );
}
