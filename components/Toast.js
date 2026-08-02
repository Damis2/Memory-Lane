"use client";

import { useCallback, useEffect, useState } from "react";

// Singleton event bus so addToast() can be called from anywhere.
const listeners = new Set();

export function addToast(message, type = "default") {
  const id = Math.random().toString(36).slice(2);
  listeners.forEach((fn) => fn({ id, message, type }));
}

function useToastSubscription(callback) {
  useEffect(() => {
    listeners.add(callback);
    return () => listeners.delete(callback);
  }, [callback]);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  const handleToast = useCallback((toast) => {
    setToasts((prev) => [...prev, toast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, 4000);
  }, []);

  useToastSubscription(handleToast);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${
            t.type === "success"
              ? "toast-success"
              : t.type === "error"
              ? "toast-error"
              : ""
          }`}
          role="status"
        >
          {t.type === "success" && (
            <svg
              className="toast-icon"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          {t.type === "error" && (
            <svg
              className="toast-icon"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              />
            </svg>
          )}
          {t.message}
        </div>
      ))}
    </div>
  );
}
