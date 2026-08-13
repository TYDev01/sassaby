"use client";

/**
 * Session context.
 *
 * Identity comes from an account, not a connected wallet — the desk spans
 * several networks, and a fiat credit has to be matched to a person, not to an
 * address. Nothing in the client signs a transaction: every asset is deposited
 * to a desk address, so there is no wallet to connect.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";

import {
  User,
  getToken,
  setToken,
  fetchMe,
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  updateProfile as apiUpdateProfile,
} from "./api";

interface AuthContextValue {
  user: User | null;
  /** True until the initial session restore settles — gate redirects on this. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (payload: {
    email: string;
    password: string;
    fullName?: string;
    phone?: string;
    bankAccountName?: string;
  }) => Promise<void>;
  signOut: () => void;
  updateProfile: (patch: {
    fullName?: string;
    phone?: string;
    bankAccountName?: string;
  }) => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore the session on mount. The token lives in localStorage, but the
  // profile is re-fetched rather than cached — a ban or a KYC-tier change has to
  // show up without waiting for the 7-day token to expire.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const me = await fetchMe();
        if (!cancelled) setUser(me);
      } catch {
        // request() already cleared the token on a 401.
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { user: u } = await apiLogin(email, password);
    setUser(u);
  }, []);

  const signUp = useCallback(
    async (payload: {
      email: string;
      password: string;
      fullName?: string;
      phone?: string;
      bankAccountName?: string;
    }) => {
      const { user: u } = await apiRegister(payload);
      setUser(u);
    },
    []
  );

  const signOut = useCallback(() => {
    apiLogout();
    setUser(null);
  }, []);

  const updateProfile = useCallback(
    async (patch: { fullName?: string; phone?: string; bankAccountName?: string }) => {
      setUser(await apiUpdateProfile(patch));
    },
    []
  );

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      return;
    }
    try {
      setUser(await fetchMe());
    } catch {
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, signIn, signUp, signOut, updateProfile, refresh }),
    [user, loading, signIn, signUp, signOut, updateProfile, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Clears any stored session. Exported for the sign-out path in server code. */
export function clearSession(): void {
  setToken(null);
}
