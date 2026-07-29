import type { ComponentType } from "react";
import { FiAlertCircle, FiRefreshCw } from "react-icons/fi";

interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, className = "" }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 py-10 text-center ${className}`}>
      {Icon && <Icon className="w-6 h-6 text-gray-300" />}
      <p className="text-sm text-gray-500">{title}</p>
      {description && <p className="text-xs text-gray-400">{description}</p>}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

// The dismiss-free, inline "something failed, here's a retry button" banner
// used across search panels — kept separate from toasts, which are for
// transient/one-off events rather than a persistent blocked state.
export function ErrorState({ message, onRetry, className = "" }: ErrorStateProps) {
  return (
    <div
      className={`flex items-center justify-between gap-2 p-3 text-sm text-red-700 border border-red-200 rounded-xl bg-red-50 ${className}`}
    >
      <span className="flex items-center gap-2">
        <FiAlertCircle className="w-4 h-4 shrink-0" />
        {message}
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-1 text-xs font-bold text-red-700 underline shrink-0 hover:text-red-900"
        >
          <FiRefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      )}
    </div>
  );
}
