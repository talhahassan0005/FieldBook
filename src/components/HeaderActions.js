"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { api } from "@/lib/api";

const PUBLIC_PATHS = ["/login", "/signup"];

export default function HeaderActions() {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [newJobLoading, setNewJobLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  // Re-check auth on every route change — client components persist across
  // navigations in the app router, so a plain mount-only effect would keep
  // showing stale "logged out" state right after a successful login.
  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/auth/me")
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Reset the "+ New Job" button's loading state once navigation lands.
  useEffect(() => {
    setNewJobLoading(false);
  }, [pathname]);

  async function handleNewJob() {
    setNewJobLoading(true);
    router.push("/jobs/new");
  }

  async function handleLogout() {
    setLogoutLoading(true);
    try {
      await api.post("/api/auth/logout", {});
    } finally {
      setUser(null);
      setLogoutLoading(false);
      router.push("/login");
      router.refresh();
    }
  }

  // Never show these on the auth pages themselves.
  if (PUBLIC_PATHS.includes(pathname)) return null;
  // Not logged in (or still checking) — nothing to show yet.
  if (!loaded || !user) return null;

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleNewJob}
        disabled={newJobLoading}
        className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {newJobLoading ? "Loading…" : "+ New Job"}
      </button>
      <span className="hidden text-sm text-slate-600 sm:inline">
        {user.name || user.email}
      </span>
      <button
        onClick={handleLogout}
        disabled={logoutLoading}
        className="btn-ghost text-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        {logoutLoading ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
