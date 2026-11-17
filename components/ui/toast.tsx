"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastApi {
  show: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const variantStyles: Record<ToastVariant, string> = {
  success:
    "border-emerald-200 text-emerald-900 dark:border-emerald-900 dark:text-emerald-200",
  error:
    "border-rose-200 text-rose-900 dark:border-rose-900 dark:text-rose-200",
  info: "border-slate-200 text-slate-900 dark:border-slate-700 dark:text-slate-100",
};

const icons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const iconStyles: Record<ToastVariant, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  error: "text-rose-600 dark:text-rose-400",
  info: "text-primary",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = Date.now() + Math.random();
    setToasts((previous) => [...previous, { id, message, variant }]);
    setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id));
    }, 4000);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end">
        {toasts.map((toast) => {
          const Icon = icons[toast.variant];
          return (
            <div
              key={toast.id}
              role="status"
              className={cn(
                "pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-lg border bg-white p-3 text-sm shadow-lg dark:bg-slate-900",
                variantStyles[toast.variant],
              )}
            >
              <Icon
                className={cn("mt-0.5 h-4 w-4 shrink-0", iconStyles[toast.variant])}
              />
              <span className="flex-1">{toast.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}
