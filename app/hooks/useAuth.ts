"use client";

import { useState, useEffect } from "react";
import { getUserIdSync } from "@/lib/database";

export function useAuth() {
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = getUserIdSync();
    setUser({ id });
    setLoading(false);
  }, []);

  return { user, loading, setUser, signOut: () => setUser(null) };
}
