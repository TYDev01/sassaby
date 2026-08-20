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
  useRef,
  useState,
  ReactNode,
} from "react";

import {
  User,
  getToken,
  setToken,
  fetchMe,
  refreshSession,
  login as apiLogin,
  register as apiRegister,
  socialAuth as apiSocialAuth,
  SocialProvider,
  logout as apiLogout,
  updateProfile as apiUpdateProfile,
} from "./api";

/**
 * Idle timeout. Must match SESSION_TTL_MINUTES on the backend, which is what
 * actually enforces it — this constant only decides when the UI gives up.
 */
const SESSION_IDLE_MINUTES = 35;

/**
 * How long a token may run before activity renews it.
 *
 * Renewing on every interaction would mean a request per keystroke. Renewing
 * once every few minutes of activity is enough to keep the window sliding, and
 * is far short of the timeout, so a session in use never lapses.
 */
const RENEW_AFTER_MS = 5 * 60_000;

const IDLE_LIMIT_MS = SESSION_IDLE_MINUTES * 60_000;

/**
 * What counts as being on the site.
 *
 * Deliberately human input, not network traffic: the admin dashboard polls every
 * fifteen seconds, so counting requests as activity would hold a session open on
 * an unattended machine forever — exactly what the timeout exists to stop.
 */
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

interface AuthContextValue {
  user: User | null;
  /** True until the initial session restore settles — gate redirects on this. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /**
   * Exchange a provider ID token for a session. Resolves with whether this call
   * created the account, so the caller can say "Account created" rather than
   * "Signed in" — the user tapped one button either way.
   *
   * Rejects with `requiresPassword` on the error body when the address already
   * belongs to a password account; pass that password in `extra` to link.
   */
  signInWithProvider: (
    provider: SocialProvider,
    credential: string,
    extra?: { password?: string; fullName?: string }
  ) => Promise<{ created: boolean }>;
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

  const signInWithProvider = useCallback(
    async (
      provider: SocialProvider,
      credential: string,
      extra: { password?: string; fullName?: string } = {}
    ) => {
      const { user: u, created } = await apiSocialAuth(provider, credential, extra);
      setUser(u);
      return { created };
    },
    []
  );

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

  // ── Idle timeout ──────────────────────────────────────────────────────────
  //
  // Two halves that have to agree: the browser drops the session once the user
  // has been away for SESSION_IDLE_MINUTES, and renews the token while they are
  // still here. The backend enforces the same window regardless — this only
  // decides how promptly the UI reflects it.
  const lastActivityRef = useRef(Date.now());
  const lastRenewRef = useRef(Date.now());
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;

  useEffect(() => {
    if (!user) return;

    lastActivityRef.current = Date.now();
    lastRenewRef.current = Date.now();

    function onActivity() {
      lastActivityRef.current = Date.now();

      if (Date.now() - lastRenewRef.current < RENEW_AFTER_MS) return;
      // Claim the slot before awaiting, so a burst of input cannot fire several
      // renewals at once.
      lastRenewRef.current = Date.now();
      refreshSession()
        .then(setUser)
        .catch(() => {
          // Renewal failed — either the token already lapsed or the network is
          // down. The sweep below decides, and the next request will 401 anyway.
        });
    }

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true });
    }

    // A tab in the background is throttled, so check on return to the tab too,
    // where a long absence is most likely to have crossed the limit.
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActivityRef.current >= IDLE_LIMIT_MS) signOutRef.current();
      else onActivity();
    }
    document.addEventListener("visibilitychange", onVisible);

    const sweep = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= IDLE_LIMIT_MS) signOutRef.current();
    }, 30_000);

    return () => {
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, onActivity);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(sweep);
    };
  }, [user]);

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
    () => ({ user, loading, signIn, signInWithProvider, signUp, signOut, updateProfile, refresh }),
    [user, loading, signIn, signInWithProvider, signUp, signOut, updateProfile, refresh]
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
