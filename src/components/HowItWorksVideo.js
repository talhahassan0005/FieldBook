"use client";

import { useEffect, useState } from "react";

export default function HowItWorksVideo() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary">
        ▶ How it works
      </button>
      {open && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="How the Field Book simulator works"
        >
          <div
            className="w-full max-w-3xl rounded-xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">How it works</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <video
              src="/how-the-simulator-works.mp4"
              controls
              autoPlay
              className="w-full rounded-lg bg-black"
            >
              Sorry, your browser doesn&apos;t support embedded videos.
            </video>
          </div>
        </div>
      )}
    </>
  );
}
