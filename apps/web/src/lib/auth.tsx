"use client";

import type { AppViewKey, CurrentUser, UserRole } from "@ess/shared";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "./api";

export type RequireAuthArg =
  | UserRole[]
  | {
      roles?: UserRole[];
      anyViews?: AppViewKey[];
    };

type AuthContextValue = {
  token: string | null;
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  authorized: (roles?: UserRole[]) => boolean;
  canAccessView: (view: AppViewKey) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const TOKEN_KEY = "ess.auth.access";

function readStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

function storeToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshing = useRef<Promise<string | null> | null>(null);

  const tryRefresh = useCallback(async (): Promise<string | null> => {
    if (refreshing.current) return refreshing.current;
    refreshing.current = (async () => {
      try {
        const result = await api<{ accessToken: string; user: CurrentUser }>("/auth/refresh", { method: "POST" });
        storeToken(result.accessToken);
        setToken(result.accessToken);
        setUser(normaliseUser(result.user));
        return result.accessToken;
      } catch {
        storeToken(null);
        setToken(null);
        setUser(null);
        return null;
      } finally {
        refreshing.current = null;
      }
    })();
    return refreshing.current;
  }, []);

  const refreshMe = useCallback(async () => {
    const current = readStoredToken();
    if (!current) {
      const refreshed = await tryRefresh();
      if (!refreshed) {
        setLoading(false);
        return;
      }
    }
    try {
      const me = await api<CurrentUser>("/auth/me", { token: readStoredToken() ?? undefined });
      setUser(normaliseUser(me));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        const refreshed = await tryRefresh();
        if (refreshed) {
          const me = await api<CurrentUser>("/auth/me", { token: refreshed });
          setUser(normaliseUser(me));
        }
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, [tryRefresh]);

  useEffect(() => {
    const stored = readStoredToken();
    setToken(stored);
    void refreshMe();
  }, [refreshMe]);

  async function login(email: string, password: string) {
    const result = await api<{ accessToken: string; user: CurrentUser }>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    storeToken(result.accessToken);
    setToken(result.accessToken);
    setUser(normaliseUser(result.user));
  }

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    storeToken(null);
    setToken(null);
    setUser(null);
  }

  function authorized(roles?: UserRole[]): boolean {
    if (!user) return false;
    if (!roles || roles.length === 0) return true;
    return roles.includes(user.role);
  }

  function canAccessView(view: AppViewKey): boolean {
    return !!user?.visibleViews?.includes(view);
  }

  const value = useMemo<AuthContextValue>(
    () => ({ token, user, loading, login, logout, refreshMe, authorized, canAccessView }),
    [token, user, loading, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function normaliseUser(user: CurrentUser): CurrentUser {
  return {
    ...user,
    visibleViews: user.visibleViews ?? [],
    accessRoles: user.accessRoles ?? [],
    teamId: user.teamId ?? null,
    locale: user.locale ?? "de",
  };
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useRequireAuth(access?: RequireAuthArg) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const roles = Array.isArray(access) ? access : access?.roles;
  const anyViews = Array.isArray(access) ? undefined : access?.anyViews;

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.user && pathname !== "/login") {
      router.replace("/login");
      return;
    }
    if (!auth.user) return;
    if (!roles?.length && !anyViews?.length) return;
    const roleOk = roles?.length ? roles.includes(auth.user.role) : false;
    const viewOk = anyViews?.length ? anyViews.some((v) => auth.user?.visibleViews.includes(v)) : false;
    if (!roleOk && !viewOk) router.replace("/agent/sales");
  }, [auth.loading, auth.user, pathname, roles, anyViews, router]);

  return auth;
}

export function toMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}
