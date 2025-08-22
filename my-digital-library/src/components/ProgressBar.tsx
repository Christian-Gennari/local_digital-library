// src/components/ProgressBar.tsx
import React, { useState } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { createPortal } from "react-dom"; // Add this line

// Type definitions
export interface ProgressBarProps {
  /** Current progress percentage (0-100) */
  progress: number;

  /** Display variant */
  variant?: "minimal" | "compact" | "detailed" | "reader";

  /** Size of the progress bar */
  size?: "xs" | "sm" | "md" | "lg";

  /** Show percentage label */
  showPercentage?: boolean;

  /** Show status labels (Not started/Finished) */
  showStatusLabels?: boolean;

  /** Enable reset functionality */
  allowReset?: boolean;

  /** Callback when reset is requested */
  onReset?: () => void | Promise<void>;

  /** Book title for reset confirmation */
  bookTitle?: string;

  /** Custom class names */
  className?: string;

  /** Hide the bar when progress is 0 */
  hideWhenZero?: boolean;

  /** Custom colors */
  colorScheme?: "default" | "success" | "warning" | "custom";

  /** Custom color for the progress bar */
  customColor?: string;
}

interface ConfirmResetDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  bookTitle?: string;
}

// Compact Confirmation Popup Component with Portal
const ConfirmResetDialog: React.FC<ConfirmResetDialogProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  bookTitle = "this book",
}) => {
  if (!isOpen) return null;

  // Render the modal outside of the sidebar using a portal
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Lightweight backdrop */}
      <button
        className="absolute inset-0 bg-black/20 dark:bg-black/40"
        onClick={onCancel}
        aria-label="Close"
      />

      {/* Compact popup */}
      <div className="relative theme-bg-primary border theme-border rounded-lg shadow-xl p-5 mx-4 max-w-sm animate-in fade-in zoom-in-95 duration-200">
        <div className="space-y-4">
          {/* Header with icon */}
          <div className="flex items-center gap-3">
            <ArrowPathIcon className="h-5 w-5 theme-text-muted flex-shrink-0" />
            <h3 className="text-base font-semibold theme-text-primary">
              Reset progress?
            </h3>
          </div>

          {/* Message */}
          <p className="text-sm theme-text-secondary pl-8">
            This will reset your reading progress for "{bookTitle}" back to 0%.
          </p>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-sm font-medium theme-text-secondary hover:theme-text-primary transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-3 py-1.5 text-sm font-medium theme-bg-secondary theme-text-primary hover:theme-bg-tertiary rounded-md transition-colors cursor-pointer"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body // Portal target - renders outside of the sidebar
  );
};

// Main Progress Bar Component
export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress = 0,
  variant = "compact",
  size = "md",
  showPercentage = false,
  showStatusLabels = false,
  allowReset = false,
  onReset,
  bookTitle,
  className = "",
  hideWhenZero = false,
  colorScheme = "default",
  customColor,
}) => {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Normalize progress to 0-100 range
  const normalizedProgress = Math.round(Math.max(0, Math.min(100, progress)));
  const isNotStarted = normalizedProgress === 0;
  const isFinished = normalizedProgress === 100;

  // Hide if configured and progress is 0
  if (hideWhenZero && isNotStarted && variant !== "minimal") {
    return null;
  }

  // Size configurations
  const sizeConfig = {
    xs: { barHeight: "h-0.5", fontSize: "text-xs", iconSize: "h-3 w-3" },
    sm: { barHeight: "h-1", fontSize: "text-xs", iconSize: "h-3.5 w-3.5" },
    md: { barHeight: "h-2", fontSize: "text-sm", iconSize: "h-4 w-4" },
    lg: { barHeight: "h-2.5", fontSize: "text-base", iconSize: "h-5 w-5" },
  };

  const { barHeight, fontSize, iconSize } = sizeConfig[size];

  // Color configurations
  const getProgressColor = () => {
    if (customColor) return customColor;

    switch (colorScheme) {
      case "success":
        return isFinished ? "bg-emerald-600" : "bg-emerald-500";
      case "warning":
        return "bg-amber-500";
      case "custom":
        return customColor || "bg-blue-500";
      default:
        if (isNotStarted) return "bg-gray-400";
        if (isFinished) return "bg-emerald-600";
        return "bg-emerald-500";
    }
  };

  const getStatusLabel = () => {
    if (isNotStarted) return "Not started";
    if (isFinished) return "Finished";
    return `${normalizedProgress}%`;
  };

  const getStatusIcon = () => {
    if (!showStatusLabels) return null;
    if (isFinished) {
      return <CheckCircleIcon className={`${iconSize} text-emerald-600`} />;
    }
    return null;
  };

  const handleResetClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setShowConfirmDialog(true);
  };

  const handleConfirmReset = async () => {
    if (!onReset) return;

    setIsResetting(true);
    try {
      await onReset();
      setShowConfirmDialog(false);
    } catch (error) {
      console.error("Failed to reset progress:", error);
    } finally {
      setIsResetting(false);
    }
  };

  const handleCancelReset = () => {
    setShowConfirmDialog(false);
  };

  // Render based on variant
  switch (variant) {
    case "minimal":
      // For book covers - shows progress bar OR finished badge (not both)
      if (hideWhenZero && isNotStarted) {
        return null;
      }

      // When finished, show only a subtle checkmark icon
      if (isFinished) {
        return (
          <div className="absolute bottom-1.5 left-1.5">
            <div className="p-0 theme-bg-primary rounded-full">
              <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
            </div>
          </div>
        );
      }

      // Regular progress bar for in-progress books (uses className for full width)
      return (
        <div
          className={`h-1.5 bg-black/10 rounded-full overflow-hidden ${className}`}
        >
          <div
            className={`h-full bg-emerald-500 transition-all duration-500 ease-out`}
            style={{ width: `${normalizedProgress}%` }}
          />
        </div>
      );

    case "reader":
      // Compact bar with percentage for reader controls
      return (
        <div className={`flex items-center gap-2 ${className}`}>
          <div
            className={`flex-1 ${barHeight} theme-bg-tertiary rounded-full overflow-hidden`}
          >
            <div
              className={`h-full ${getProgressColor()} transition-all duration-300`}
              style={{ width: `${Math.round(normalizedProgress)}%` }}
            />
          </div>
          <span
            className={`${fontSize} theme-text-secondary font-medium tabular-nums`}
          >
            {Math.round(normalizedProgress)}%
          </span>
        </div>
      );

    case "detailed":
      // Full featured with labels, icons, and reset
      return (
        <>
          <div className={`space-y-2 ${className}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`${fontSize} font-medium theme-text-secondary`}
                >
                  Reading Progress
                </span>
                {getStatusIcon()}
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`${fontSize} font-semibold ${
                    isNotStarted
                      ? "theme-text-muted"
                      : isFinished
                      ? "text-emerald-600"
                      : "theme-text-primary"
                  }`}
                >
                  {getStatusLabel()}
                </span>

                {/* Reset button */}
                {allowReset && normalizedProgress > 0 && (
                  <button
                    onClick={handleResetClick}
                    className="group p-1.5 rounded-full hover:theme-bg-tertiary transition-all duration-200 cursor-pointer"
                    title="Reset reading progress"
                    disabled={isResetting}
                  >
                    <ArrowPathIcon
                      className={`${iconSize} theme-text-muted group-hover:text-amber-600 transition-colors ${
                        isResetting ? "animate-spin" : ""
                      }`}
                    />
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="relative">
              <div
                className={`w-full ${barHeight} theme-bg-tertiary rounded-full overflow-hidden`}
              >
                <div
                  className={`h-full ${getProgressColor()} transition-all duration-500 ease-out relative`}
                  style={{ width: `${normalizedProgress}%` }}
                >
                  {/* Shimmer effect for finished state */}
                  {isFinished && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Confirmation Dialog */}
          <ConfirmResetDialog
            isOpen={showConfirmDialog}
            onConfirm={handleConfirmReset}
            onCancel={handleCancelReset}
            bookTitle={bookTitle}
          />
        </>
      );

    case "compact":
    default:
      // Standard bar with label and percentage
      return (
        <>
          <div className={className}>
            <div
              className={`flex justify-between ${fontSize} theme-text-secondary mb-1`}
            >
              <span>
                {showStatusLabels && (isNotStarted || isFinished)
                  ? getStatusLabel()
                  : "Reading Progress"}
              </span>
              <div className="flex items-center gap-2">
                {showPercentage && <span>{normalizedProgress}%</span>}
                {allowReset && normalizedProgress > 0 && (
                  <button
                    onClick={handleResetClick}
                    className="group p-1 rounded hover:theme-bg-tertiary transition-all cursor-pointer"
                    title="Reset progress"
                    disabled={isResetting}
                  >
                    <ArrowPathIcon
                      className={`${iconSize} theme-text-muted group-hover:text-amber-600 ${
                        isResetting ? "animate-spin" : ""
                      }`}
                    />
                  </button>
                )}
              </div>
            </div>
            <div
              className={`w-full ${barHeight} theme-bg-tertiary rounded-full overflow-hidden`}
            >
              <div
                className={`h-full ${getProgressColor()} transition-all duration-300`}
                style={{ width: `${normalizedProgress}%` }}
              />
            </div>
          </div>

          {/* Confirmation Dialog */}
          {allowReset && (
            <ConfirmResetDialog
              isOpen={showConfirmDialog}
              onConfirm={handleConfirmReset}
              onCancel={handleCancelReset}
              bookTitle={bookTitle}
            />
          )}
        </>
      );
  }
};

// Export helper function for resetting progress
export const resetBookProgress = async (
  bookId: string,
  updateBookMetadata: (id: string, metadata: any) => Promise<void>
) => {
  await updateBookMetadata(bookId, {
    readingProgress: 0,
    lastReadPosition: undefined,
    lastRead: undefined,
  });
};
