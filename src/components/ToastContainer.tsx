import { AlertCircle, CheckCircle2, Info, X, AlertTriangle } from 'lucide-react';
import type { ToastItem } from '../types/emg';

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export default function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-5 bottom-5 z-50 flex w-full max-w-sm flex-col gap-2.5"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const iconMap = {
          success: <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />,
          error: <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />,
          warning: <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />,
          info: <Info className="h-4 w-4 text-cyan-600 shrink-0 mt-0.5" />,
        };
        const borderMap = {
          success: 'border-teal-200 bg-white',
          error: 'border-red-200 bg-white',
          warning: 'border-amber-200 bg-white',
          info: 'border-slate-200 bg-white',
        };

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-lg ${borderMap[toast.type]}`}
          >
            {iconMap[toast.type]}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
