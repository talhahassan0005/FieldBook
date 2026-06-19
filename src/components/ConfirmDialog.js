"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const ConfirmContext = createContext(null);

const DEFAULTS = {
  title: "Are you sure?",
  message: "",
  confirmText: "Confirm",
  cancelText: "Cancel",
  danger: false,
};

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      resolver.current = resolve;
      setState({ ...DEFAULTS, ...opts });
    });
  }, []);

  const settle = useCallback((result) => {
    setState(null);
    if (resolver.current) {
      resolver.current(result);
      resolver.current = null;
    }
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <Dialog
          {...state}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx;
}

function Dialog({ title, message, confirmText, cancelText, danger, onConfirm, onCancel }) {
  const confirmRef = useRef(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onConfirm]);

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        {message && <p className="mt-2 text-sm text-slate-600">{message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            className={danger ? "btn-danger" : "btn-primary"}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
