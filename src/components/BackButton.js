"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Consistent "Back" affordance for every page.
 * - Pass `href` for an explicit destination (preferred, predictable).
 * - Omit `href` to go to the previous page in history.
 */
export default function BackButton({ href, label = "Back" }) {
  const router = useRouter();
  const className =
    "no-print mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700";

  if (href) {
    return (
      <Link href={href} className={className}>
        <span aria-hidden="true">←</span> {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => router.back()} className={className}>
      <span aria-hidden="true">←</span> {label}
    </button>
  );
}
