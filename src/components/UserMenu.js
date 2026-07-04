"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .get("/api/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoaded(true));
  }, []);

  async function handleLogout() {
    try {
      await api.post("/api/auth/logout", {});
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  if (!loaded || !user) return null;

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-slate-600 sm:inline">
        {user.name || user.email}
      </span>
      <button onClick={handleLogout} className="btn-ghost text-sm">
        Sign out
      </button>
    </div>
  );
}
