// ConfirmationModal.tsx
import { createPortal } from "react-dom";

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

  // Create the modal content
  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop - semi-transparent background */}
      <div
        className="absolute inset-0 bg-black/20 dark:bg-black/40"
        onClick={onCancel}
      />

      {/* Modal dialog box */}
      <div className="relative w-full max-w-md theme-bg-primary rounded-lg shadow-xl border theme-border">
        <div className="p-6">
          {/* Modal Title */}
          <h3 className="text-lg font-semibold theme-text-primary mb-4">
            {title}
          </h3>

          {/* Modal Message */}
          <p className="theme-text-secondary mb-6">{message}</p>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end">
            <button
              onClick={onCancel}
              className="px-4 py-2 theme-bg-secondary theme-text-secondary hover:theme-bg-tertiary rounded-lg transition-colors cursor-pointer"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              className={`px-4 py-2 rounded-lg transition-colors cursor-pointer font-medium ${
                isDestructive
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "theme-btn-primary"
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Render the modal outside of the parent component using a portal
  return createPortal(modalContent, document.body);
}
