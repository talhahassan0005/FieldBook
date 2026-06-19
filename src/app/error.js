"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 px-5 py-6 text-center">
      <h2 className="text-lg font-bold text-red-700">Something went wrong</h2>
      <p className="mt-1 text-sm text-red-600">
        {error?.message || "An unexpected error occurred while rendering this page."}
      </p>
      <div className="mt-4 flex justify-center gap-3">
        <button onClick={() => reset()} className="btn-primary">
          Try again
        </button>
        <Link href="/" className="btn-secondary">
          Back to jobs
        </Link>
      </div>
    </div>
  );
}
