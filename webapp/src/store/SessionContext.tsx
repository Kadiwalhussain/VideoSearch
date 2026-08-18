import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchMe, vaultAuth, type AuthMode } from "../api/auth";
import {
  clearSession,
  loadSession,
  saveSession,
  defaultApiUrl,
} from "../api/client";
import type { Session, VaultUser } from "../types";

type SessionCtx = {
  session: Session | null;
  loading: boolean;
  apiUrl: string;
  setApiUrl: (u: string) => void;
  login: (
    mode: AuthMode,
    opts: {
      email: string;
      password: string;
      displayName?: string;
      code?: string;
    }
  ) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateUser: (u: Partial<VaultUser>) => void;
};

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiUrl, setApiUrl] = useState(defaultApiUrl());

  useEffect(() => {
    const existing = loadSession();
    if (!existing) {
      setLoading(false);
      return;
    }
    setSession(existing);
    setApiUrl(existing.url);
    fetchMe(existing)
      .then((user) => {
        const next = { ...existing, user };
        saveSession(next);
        setSession(next);
      })
      .catch(() => {
        clearSession();
        setSession(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(
    async (
      mode: AuthMode,
      opts: {
        email: string;
        password: string;
        displayName?: string;
        code?: string;
      }
    ) => {
      const s = await vaultAuth(mode, { ...opts, projectUrl: apiUrl });
      setSession(s);
      setApiUrl(s.url);
    },
    [apiUrl]
  );

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!session) return;
    const user = await fetchMe(session);
    const next = { ...session, user };
    saveSession(next);
    setSession(next);
  }, [session]);

  const updateUser = useCallback((u: Partial<VaultUser>) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, user: { ...prev.user, ...u } };
      saveSession(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      session,
      loading,
      apiUrl,
      setApiUrl,
      login,
      logout,
      refreshUser,
      updateUser,
    }),
    [session, loading, apiUrl, login, logout, refreshUser, updateUser]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside provider");
  return v;
}
