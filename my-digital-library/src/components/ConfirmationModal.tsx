// src/components/ConfirmationModal.tsx
import { XMarkIcon } from "@heroicons/react/24/outline";

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

export function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  isDestructive = false,
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <button
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
        aria-label="Close"
      />
      {/* Sheet (mobile) / Dialog (desktop) */}
      <div className="absolute inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl theme-bg-primary md:w-full md:max-w-sm shadow-2xl">
        {/* Grabber (mobile only) */}
        <div className="md:hidden pt-2">
          <div className="mx-auto h-1.5 w-12 rounded-full theme-bg-tertiary" />
        </div>

        <div className="relative p-6">
          <button
            onClick={onCancel}
            className="absolute right-4 top-4 theme-text-muted hover\:theme-text-secondary"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>

          <h3
            className={`text-lg font-semibold ${
              isDestructive ? "text-red-700" : "theme-text-primary"
            }`}
          >
            {title}
          </h3>
          <p className="mt-2 text-sm theme-text-secondary">{message}</p>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="rounded-md px-4 py-2 text-sm font-medium theme-text-secondary hover\:theme-bg-tertiary cursor-pointer"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              className={`rounded-md px-4 py-2 text-sm font-semibold text-white cursor-pointer ${
                isDestructive
                  ? "bg-red-600 hover:bg-red-500"
                  : "theme-btn-primary hover:theme-btn-primary"
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
