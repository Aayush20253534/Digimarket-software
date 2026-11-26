"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  apiRequest, ApiError, type ApiOptions, type Identity, type LoginUser,
  type Session, type SessionPayload,
} from "@/lib/api";

type RequestOptions = Omit<ApiOptions, "token"> & { cache?: "prefer" | "reload" };
const identityKey = (s: Session | null) => s ? JSON.stringify([s.identity.organizationId, s.identity.userId, [...s.identity.roles].sort(), [...s.identity.permissions].sort()]) : "";
type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";
type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  completeLogin: (payload: SessionPayload) => Promise<void>;
  request: <T>(path: string, options?: RequestOptions) => Promise<T>;
  refresh: () => Promise<string | null>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } }));
  const generation = useRef(0);
  const sessionEpoch = useRef(0);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const refreshInFlight = useRef<Promise<string | null> | null>(null);

  const saveSession = useCallback((value: Session | null) => {
    if (identityKey(sessionRef.current) !== identityKey(value)) {
      generation.current++;
      queryClient.clear();
    }
    sessionRef.current = value;
    setSession(value);
    setStatus(value ? "authenticated" : "unauthenticated");
  }, [queryClient]);

  const establish = useCallback(async (accessToken: string, user: LoginUser, bundled?: Identity, epoch = sessionEpoch.current) => {
    const identity = bundled ?? await apiRequest<Identity>("/me", { token: accessToken });
    if (identity.userId !== user.id || identity.organizationId !== user.organizationId) throw new ApiError(401, "UNAUTHORIZED", "Identity mismatch");
    if (epoch !== sessionEpoch.current) return false;
    saveSession({ accessToken, identity, user });
    return true;
  }, [saveSession]);

  const refresh = useCallback((): Promise<string | null> => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const epoch = sessionEpoch.current;
    const work = (async () => {
      try {
        const payload = await apiRequest<SessionPayload>("/auth/refresh", { method: "POST" });
        return await establish(payload.accessToken, payload.user, payload.identity, epoch) ? payload.accessToken : null;
      } catch (error) {
        if (epoch !== sessionEpoch.current) return null;
        if (error instanceof ApiError && (error.status === 401 || error.status === 404)) {
          saveSession(null);
        } else {
          if (!sessionRef.current) setStatus("error");
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
    sessionEpoch.current++;
    await establish(payload.accessToken, payload.user, payload.identity);
  }, [establish]);

  const request = useCallback(async <T,>(path: string, options: RequestOptions = {}): Promise<T> => {
    const current = sessionRef.current;
    if (!current) throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    const scope = identityKey(current);
    const epoch = sessionEpoch.current;
    const { cache, ...apiOptions } = options;
    const execute = async (signal?: AbortSignal) => {
      const assertScope = () => {
        if (epoch !== sessionEpoch.current || identityKey(sessionRef.current) !== scope) throw new ApiError(401, "UNAUTHORIZED", "Session changed");
      };
      assertScope();
      try {
        const value = await apiRequest<T>(path, { ...apiOptions, signal, token: current.accessToken });
        assertScope();
        return value;
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        assertScope();
        // A parallel request may already have rotated the token.
        const latest = sessionRef.current?.accessToken;
        const token = latest && latest !== current.accessToken ? latest : await refresh();
        assertScope();
        if (!token) throw new ApiError(401, "UNAUTHORIZED", "Session expired");
        const value = await apiRequest<T>(path, { ...apiOptions, signal, token });
        assertScope();
        return value;
      }
    };
    // Only opted-in reads retain results. Ordinary GETs and finance remain live.
    // An explicit caller AbortSignal or GET body cannot safely share a request.
    if ((options.method ?? "GET") === "GET" && !options.signal && options.body === undefined) {
      return queryClient.fetchQuery<T>({
        queryKey: ["workspace", scope, generation.current, path],
        queryFn: ({ signal }) => execute(signal),
        staleTime: cache === "prefer" ? 20_000 : 0,
        gcTime: cache ? 300_000 : 0,
      });
    }
    try {
      return await execute(options.signal);
    } finally {
      if ((options.method ?? "GET") !== "GET") {
        generation.current++;
        // Writes can affect more than one module, including failed/ambiguous requests.
        queryClient.removeQueries({ queryKey: ["workspace"], type: "inactive" });
      }
    }
  }, [queryClient, refresh]);

  const logout = useCallback(async () => {
    // Do not claim logout when server failed to revoke its HttpOnly refresh cookie.
    await apiRequest<void>("/auth/logout", { method: "POST" });
    sessionEpoch.current++;
    saveSession(null);
  }, [saveSession]);

  return <QueryClientProvider client={queryClient}><AuthContext.Provider value={{ status, session, completeLogin, request, refresh, logout }}>
    {children}
  </AuthContext.Provider></QueryClientProvider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}
