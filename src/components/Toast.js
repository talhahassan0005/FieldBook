"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

const ToastContext = createContext(null);

let _id = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type, message, opts = {}) => {
      const id = ++_id;
      setToasts((list) => [...list, { id, type, message }]);
      const ttl = opts.duration ?? (type === "error" ? 6000 : 3500);
      if (ttl) setTimeout(() => remove(id), ttl);
      return id;
    },
    [remove]
  );

  const toast = useMemo(
    () => ({
      success: (m, o) => push("success", m, o),
      error: (m, o) => push("error", m, o),
      info: (m, o) => push("info", m, o),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <Toaster toasts={toasts} onClose={remove} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

const STYLES = {
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: "✓", iconBg: "bg-emerald-500" },
  error: { box: "border-red-200 bg-red-50 text-red-800", icon: "!", iconBg: "bg-red-500" },
  info: { box: "border-brand-200 bg-brand-50 text-brand-800", icon: "i", iconBg: "bg-brand-500" },
};

function Toaster({ toasts, onClose }) {
  return (
    <div className="no-print pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => {
        const s = STYLES[t.type] || STYLES.info;
        return (
          <div
            key={t.id}
            role="alert"
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-md ${s.box} animate-[fadeIn_0.15s_ease-out]`}
          >
            <span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs font-bold text-white ${s.iconBg}`}>
              {s.icon}
            </span>
            <span className="flex-1 text-sm">{t.message}</span>
            <button
              onClick={() => onClose(t.id)}
              aria-label="Dismiss"
              className="flex-none text-slate-400 hover:text-slate-700"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
