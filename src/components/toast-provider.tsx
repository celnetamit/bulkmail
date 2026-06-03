'use client';

import { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';

type ToastTone = 'success' | 'error' | 'info' | 'warning';

type ToastItem = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
};

type ToastInput = {
  title: string;
  description?: string;
  durationMs?: number;
};

type ToastContextValue = {
  showToast: (tone: ToastTone, input: ToastInput) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((tone: ToastTone, input: ToastInput) => {
    const id = nextIdRef.current++;
    const durationMs = input.durationMs ?? (tone === 'error' ? 5200 : 3600);

    setToasts((current) => [
      ...current,
      {
        id,
        tone,
        title: input.title,
        description: input.description,
      },
    ]);

    window.setTimeout(() => dismissToast(id), durationMs);
  }, [dismissToast]);

  const value = useMemo<ToastContextValue>(() => ({
    showToast,
    success: (title, description) => showToast('success', { title, description }),
    error: (title, description) => showToast('error', { title, description }),
    info: (title, description) => showToast('info', { title, description }),
    warning: (title, description) => showToast('warning', { title, description }),
  }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone}`} role="status">
            <div className="toast__meta">
              <span className="toast__dot" aria-hidden="true" />
              <strong>{toast.title}</strong>
              <button type="button" className="toast__close" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification">
                ×
              </button>
            </div>
            {toast.description ? <p>{toast.description}</p> : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside ToastProvider.');
  }
  return context;
}
