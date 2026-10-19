"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  apiRequest, ApiError, type ApiOptions, type Identity, type LoginUser,
  type Session, type SessionPayload,
} from "@/lib/api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";
type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  completeLogin: (payload: SessionPayload) => Promise<void>;
  request: <T>(path: string, options?: Omit<ApiOptions, "token">) => Promise<T>;
  refresh: () => Promise<string | null>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const refreshInFlight = useRef<Promise<string | null> | null>(null);

  const saveSession = useCallback((value: Session | null) => {
    sessionRef.current = value;
    setSession(value);
    setStatus(value ? "authenticated" : "unauthenticated");
  }, []);

  const establish = useCallback(async (accessToken: string, user: LoginUser) => {
    const identity = await apiRequest<Identity>("/me", { token: accessToken });
    saveSession({ accessToken, identity, user });
  }, [saveSession]);

  const refresh = useCallback((): Promise<string | null> => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const work = (async () => {
      try {
        const payload = await apiRequest<SessionPayload>("/auth/refresh", { method: "POST" });
        await establish(payload.accessToken, payload.user);
        return payload.accessToken;
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 404)) {
          saveSession(null);
        } else {
          setStatus("error");
        }
        return null;
      }
    })();
    refreshInFlight.current = work;
    void work.finally(() => { if (refreshInFlight.current === work) refreshInFlight.current = null; });
    return work;
  }, [establish, saveSession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const completeLogin = useCallback(async (payload: SessionPayload) => {
    await establish(payload.accessToken, payload.user);
  }, [establish]);

  const request = useCallback(async <T,>(path: string, options: Omit<ApiOptions, "token"> = {}): Promise<T> => {
    const current = sessionRef.current;
    if (!current) throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    try {
      return await apiRequest<T>(path, { ...options, token: current.accessToken });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      const token = await refresh();
      if (!token) throw new ApiError(401, "UNAUTHORIZED", "Session expired");
      return apiRequest<T>(path, { ...options, token });
    }
  }, [refresh]);

  const logout = useCallback(async () => {
    // Clear in-memory identity even if API is unavailable. Server cookie is cleared on successful logout.
    try {
      await apiRequest<void>("/auth/logout", { method: "POST" });
    } finally {
      saveSession(null);
    }
  }, [saveSession]);

  return <AuthContext.Provider value={{ status, session, completeLogin, request, refresh, logout }}>
    {children}
  </AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}
