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
      <div className="absolute inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl bg-white md:w-full md:max-w-sm shadow-2xl">
        {/* Grabber (mobile only) */}
        <div className="md:hidden pt-2">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" />
        </div>

        <div className="relative p-6">
          <button
            onClick={onCancel}
            className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>

          <h3
            className={`text-lg font-semibold ${
              isDestructive ? "text-red-700" : "text-slate-900"
            }`}
          >
            {title}
          </h3>
          <p className="mt-2 text-sm text-slate-600">{message}</p>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              className={`rounded-md px-4 py-2 text-sm font-semibold text-white cursor-pointer ${
                isDestructive
                  ? "bg-red-600 hover:bg-red-500"
                  : "bg-slate-900 hover:bg-slate-800"
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
