/**
 * Auth layer:
 *   - Supabase client instance
 *   - AuthProvider (React Context with session + /me + active tenant)
 *   - LoginScreen (email/password against Supabase auth)
 *
 * Consumers use the `useAuth()` hook. On mount, Supabase tries to restore
 * a session from localStorage. If found, we fetch /me from the backend and
 * pick the last-used tenant (or the first membership).
 */
import { MessageSquare } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createClient, type Session } from "@supabase/supabase-js";

import { api, type Me, type Membership } from "./api";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Not a throw — helpful console message so the dev sees it.
  console.error(
    "[auth] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env",
  );
}

export const supabase = createClient(
  SUPABASE_URL ?? "https://example.supabase.co",
  SUPABASE_ANON_KEY ?? "invalid-key",
);

// ─── Context ─────────────────────────────────────────────────────────────────

interface AuthContextValue {
  session: Session | null;
  me: Me | null;
  activeTenantId: string | null;
  activeMembership: Membership | null;
  setActiveTenantId: (id: string) => void;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside <AuthProvider>");
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

const ACTIVE_TENANT_STORAGE_KEY = "activeTenantId";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [activeTenantId, setActiveTenantIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore Supabase session on mount + subscribe to changes.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      if (!s) {
        setMe(null);
        setActiveTenantIdState(null);
        setError(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Whenever session changes and is non-null, fetch /me.
  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    setLoading(true);
    api
      .me(session.access_token)
      .then((meData) => {
        if (cancelled) return;
        setMe(meData);
        // Restore last-picked tenant if it's still a valid membership.
        const saved = localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
        const validSaved =
          saved && meData.memberships.some((m) => m.tenant_id === saved)
            ? saved
            : null;
        const first = meData.memberships[0]?.tenant_id ?? null;
        setActiveTenantIdState(validSaved ?? first);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message ?? String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const setActiveTenantId = useCallback((id: string) => {
    localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, id);
    setActiveTenantIdState(id);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    localStorage.removeItem(ACTIVE_TENANT_STORAGE_KEY);
  }, []);

  const activeMembership = useMemo(
    () =>
      me?.memberships.find((m) => m.tenant_id === activeTenantId) ?? null,
    [me, activeTenantId],
  );

  const value: AuthContextValue = {
    session,
    me,
    activeTenantId,
    activeMembership,
    setActiveTenantId,
    loading,
    error,
    signIn,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

// ─── LoginScreen ─────────────────────────────────────────────────────────────

export function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    try {
      await signIn(email, password);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: "#F1F5F9",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white p-8 rounded-lg"
        style={{
          border: "1px solid #E2E8F0",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}
      >
        <div className="flex items-center gap-2.5 mb-6">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "#25D366" }}
          >
            <MessageSquare size={18} className="text-white" />
          </div>
          <div>
            <p className="font-semibold text-sm" style={{ color: "#0F172A" }}>
              WA Platform
            </p>
            <p className="text-xs" style={{ color: "#64748B" }}>
              Sign in to continue
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              className="text-sm font-semibold"
              style={{ color: "#374151" }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2.5 text-sm rounded-md outline-none"
              style={{
                border: "1px solid #E2E8F0",
                background: "#fff",
                color: "#1E293B",
              }}
              onFocus={(e) => {
                e.currentTarget.style.border = "1px solid #93C5FD";
                e.currentTarget.style.boxShadow =
                  "0 0 0 3px rgba(37,99,235,0.1)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.border = "1px solid #E2E8F0";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              className="text-sm font-semibold"
              style={{ color: "#374151" }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2.5 text-sm rounded-md outline-none"
              style={{
                border: "1px solid #E2E8F0",
                background: "#fff",
                color: "#1E293B",
              }}
              onFocus={(e) => {
                e.currentTarget.style.border = "1px solid #93C5FD";
                e.currentTarget.style.boxShadow =
                  "0 0 0 3px rgba(37,99,235,0.1)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.border = "1px solid #E2E8F0";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          {err && (
            <div
              className="px-3 py-2 rounded-md text-xs"
              style={{
                background: "#FEF2F2",
                color: "#B91C1C",
                border: "1px solid #FECACA",
              }}
            >
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !email || !password}
            className="w-full py-2.5 rounded-md text-sm font-medium text-white transition-opacity"
            style={{
              background: submitting || !email || !password ? "#CBD5E1" : "#2563EB",
              cursor: submitting || !email || !password ? "not-allowed" : "pointer",
              boxShadow:
                submitting || !email || !password
                  ? "none"
                  : "0 1px 3px rgba(37,99,235,0.4)",
            }}
          >
            {submitting ? "Signing in…" : "Sign In"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Small helper for a full-page loading state ──────────────────────────────

export function FullPageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        background: "#F1F5F9",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-4 h-4 rounded-full animate-pulse"
          style={{ background: "#2563EB" }}
        />
        <p className="text-sm" style={{ color: "#64748B" }}>
          {label}
        </p>
      </div>
    </div>
  );
}
