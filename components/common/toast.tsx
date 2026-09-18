"use client";

import * as React from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";

// Doc 06 §1: rule errors appear as a red toast, successes as a confirmation.
// D-47: the icon carries the meaning too, never colour alone, and the region is polite
// so a screen reader announces it without stealing focus.
type Toast = { id: number; tone: "error" | "success"; message: string };

const ToastContext = React.createContext<
  ((toast: Omit<Toast, "id">) => void) | null
>(null);

export function useToast() {
  const show = React.useContext(ToastContext);
  if (!show) throw new Error("useToast requires ToastProvider");
  return show;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const show = React.useCallback((toast: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { ...toast, id }]);
    setTimeout(
      () => setToasts((current) => current.filter((item) => item.id !== id)),
      6000,
    );
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:right-4 sm:left-auto sm:items-end"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "flex max-w-sm items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-md",
              toast.tone === "error"
                ? "border-danger bg-card text-danger"
                : "border-success bg-card text-success",
            )}
          >
            {toast.tone === "error" ? (
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
            ) : (
              <CircleCheck
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
            )}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
