import { useEffect, useRef, useState } from "react";
import { ThemeSelector } from "./ThemeSelector";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { UserButton, useUser } from "@clerk/clerk-react";

export function SettingsMenu({ isMobile }: { isMobile: boolean }) {
  const [open, setOpen] = useState(false);
  const [clerkPopoverOpen, setClerkPopoverOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { user } = useUser();

  // Monitor for Clerk popover
  useEffect(() => {
    const checkForClerkPopover = () => {
      const clerkPopover = document.querySelector(".cl-userButtonPopoverCard");
      setClerkPopoverOpen(!!clerkPopover);
    };

    // Use MutationObserver to detect when Clerk adds/removes its popover
    const observer = new MutationObserver(checkForClerkPopover);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  // Close on outside click (but not when Clerk popover is open)
  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      const el = containerRef.current;

      // Don't close if clicking inside our menu
      if (el && el.contains(target)) return;

      // Don't close if Clerk popover is open
      if (clerkPopoverOpen) return;

      // Don't close if clicking on any Clerk element
      const isClerkElement =
        target.closest(".cl-userButtonPopoverCard") ||
        target.closest(".cl-userButtonTrigger") ||
        target.closest(".cl-avatarBox") ||
        target.closest("[data-clerk-portal]") ||
        target.closest(".cl-rootBox");

      if (isClerkElement) return;

      setOpen(false);
    };

    // Small delay to let Clerk elements render
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("touchstart", onDown);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open, clerkPopoverOpen]);

  // Close on Escape (but not when Clerk popover is open)
  useEffect(() => {
    if (!open || clerkPopoverOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, clerkPopoverOpen]);

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
          style={{
            // Keep settings menu above most things but below Clerk popover
            zIndex: clerkPopoverOpen ? 40 : 50,
          }}
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
            {/* User Account Section */}
            <div className="p-4 border-b theme-border">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-medium theme-text-secondary uppercase tracking-wider">
                  Account
                </h4>
              </div>
              <div className="flex items-center gap-3">
                <UserButton
                  afterSignOutUrl="/"
                  appearance={{
                    elements: {
                      avatarBox: "h-10 w-10",
                      userButtonTrigger: "focus:shadow-none",
                      userButtonPopoverCard: "z-[60]", // Ensure Clerk popover is above settings menu
                      userButtonPopoverFooter: "hidden", // Optional: hide footer if you want
                    },
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium theme-text-primary truncate">
                    {user?.firstName || user?.username || "User"}
                  </p>
                  <p className="text-xs theme-text-secondary truncate">
                    {user?.primaryEmailAddress?.emailAddress}
                  </p>
                </div>
              </div>
              <p className="text-xs theme-text-secondary mt-3">
                Click your avatar to manage account settings, security, and sign
                out.
              </p>
            </div>

            {/* Theme Section */}
            <div className="border-b theme-border">
              <div className="px-4 pt-4">
                <h4 className="text-xs font-medium theme-text-secondary uppercase tracking-wider">
                  Appearance
                </h4>
              </div>
              <ThemeSelector />
            </div>

            {/* OPDS Info Section */}
            <div className="p-4">
              <h4 className="text-xs font-medium theme-text-secondary uppercase tracking-wider mb-3">
                E-Reader Access
              </h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm theme-text-primary">
                    OPDS Catalog
                  </span>
                  <code className="px-2 py-0.5 rounded text-xs font-mono theme-bg-tertiary theme-text-primary">
                    /opds
                  </code>
                </div>
                <p className="text-xs theme-text-secondary">
                  Public endpoint for KOReader and other e-readers. No
                  authentication required.
                </p>
              </div>
            </div>

            {/* Version/About Section (optional) */}
            <div className="px-4 pb-4 pt-2 border-t theme-border">
              <div className="flex items-center justify-between text-xs theme-text-secondary">
                <span>Nostos</span>
                <span>v1.0.0</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
