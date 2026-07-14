"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import PasswordField from "@/components/PasswordField";

// useSearchParams() requires a Suspense boundary in the App Router, so the
// actual page content lives in a small inner component.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const email = searchParams.get("email") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const linkInvalid = !token || !email;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const response = await api.post("/api/auth/reset-password", { email, token, password });
      setMessage(response.message || "Password updated successfully");
      setPassword("");
      setConfirmPassword("");
      setTimeout(() => router.push("/login"), 1200);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center">
      <div className="card p-6">
        <h1 className="text-xl font-bold text-slate-900">Choose a new password</h1>
        <p className="mt-1 text-sm text-slate-500">
          {email ? <>Resetting the password for <strong>{email}</strong>.</> : "Enter a new password for your account."}
        </p>

        {linkInvalid && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            This reset link is missing or malformed. Request a new one from the{" "}
            <Link href="/forgot-password" className="font-medium underline">
              forgot password
            </Link>{" "}
            page.
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            {message}
          </div>
        )}

        {!linkInvalid && (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <PasswordField
              id="new-password"
              label="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter a new password"
              autoComplete="new-password"
              minLength={6}
              required
              disabled={loading}
            />
            <PasswordField
              id="confirm-password"
              label="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter the new password"
              autoComplete="new-password"
              minLength={6}
              required
              disabled={loading}
            />
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
                    <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity="0.75" />
                  </svg>
                  Updating password…
                </span>
              ) : (
                "Update password"
              )}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-slate-500">
          Back to{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
