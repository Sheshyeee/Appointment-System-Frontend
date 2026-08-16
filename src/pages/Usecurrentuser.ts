import { useEffect, useState } from "react";
import api from "@/api/axios";

export type UserRole = "patient" | "dentist" | "admin";

interface CurrentUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/me")
      .then((res) => setUser(res.data.user ?? res.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return {
    user,
    loading,
    isAdmin: user?.role === "admin",
    isDentist: user?.role === "dentist",
  };
}
