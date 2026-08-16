import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import api from "../api/axios";
import { useNavigate } from "react-router-dom";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  loginWithToken: (token: string) => Promise<User>;
  register: (
    name: string,
    email: string,
    password: string,
    password_confirmation: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      api
        .get("/me")
        .then((res) => setUser(res.data))
        .catch(() => {
          localStorage.removeItem("token");
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post("/login", { email, password });
    localStorage.setItem("token", res.data.token);
    setUser(res.data.user);
    return res.data.user;
  };

  const loginWithToken = async (token: string) => {
    localStorage.setItem("token", token);
    const res = await api.get("/me");
    setUser(res.data);
    return res.data as User;
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    password_confirmation: string,
  ) => {
    const res = await api.post("/register", {
      name,
      email,
      password,
      password_confirmation,
    });
    localStorage.setItem("token", res.data.token);
    setUser(res.data.user);
  };

  const navigate = useNavigate();

  const logout = async () => {
    await api.post("/logout");
    localStorage.removeItem("token");
    setUser(null);
    navigate("/");
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, loginWithToken, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
