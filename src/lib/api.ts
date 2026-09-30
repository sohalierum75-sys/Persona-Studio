/**
 * API client — token storage, authenticated fetch with automatic
 * refresh on 401, and OAuth one-time-code exchange.
 *
 * Tokens live in chrome.storage.local (extension) or localStorage (web).
 * The refresh token rotates on every use; the access token is a
 * short-lived JWT the server validates.
 */

import { API_URL, IS_EXTENSION } from "./config";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** epoch ms when the access token expires */
  expiresAt: number;
  user: PublicUser;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ─── Storage adapter (persistent across browser restarts) ────────────────────

const TOKENS_KEY = "ps_auth_tokens";

const storage = {
  async get(key: string): Promise<string | null> {
    if (IS_EXTENSION) {
      return new Promise((resolve) => {
        chrome.storage.local.get([key], (r) => resolve(typeof r[key] === "string" ? r[key] : null));
      });
    }
    return localStorage.getItem(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (IS_EXTENSION) {
      await new Promise<void>((resolve) => chrome.storage.local.set({ [key]: value }, resolve));
      return;
    }
    localStorage.setItem(key, value);
  },
  async remove(key: string): Promise<void> {
    if (IS_EXTENSION) {
      await new Promise<void>((resolve) => chrome.storage.local.remove([key], resolve));
      return;
    }
    localStorage.removeItem(key);
  },
};

export async function getTokens(): Promise<Tokens | null> {
  try {
    const raw = await storage.get(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

export async function setTokens(t: Tokens): Promise<void> {
  await storage.set(TOKENS_KEY, JSON.stringify(t));
}

export async function clearTokens(): Promise<void> {
  await storage.remove(TOKENS_KEY);
}

// ─── Auth-expired notification (sync layer listens) ──────────────────────────

type ExpiredListener = () => void;
const expiredListeners = new Set<ExpiredListener>();
export function onAuthExpired(cb: ExpiredListener): () => void {
  expiredListeners.add(cb);
  return () => expiredListeners.delete(cb);
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

let refreshInFlight: Promise<Tokens | null> | null = null;

/** Rotate the refresh token and persist the new pair. Null = session dead. */
export async function refreshSession(): Promise<Tokens | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = navigator.locks.request("ps-session", async () => {
    const current = await getTokens();
    if (!current?.refreshToken) return null;
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!res.ok) {
        if (res.status !== 401) return null;
        await clearTokens();
        expiredListeners.forEach((l) => l());
        return null;
      }
      const data = (await res.json()) as Tokens;
      if ((await getTokens())?.refreshToken !== current.refreshToken) return null;
      await setTokens(data);
      return data;
    } catch {
      // Network failure — keep existing tokens; retry later
      return null;
    }
  });
  const result = await refreshInFlight;
  refreshInFlight = null;
  return result;
}

// ─── Authenticated fetch ──────────────────────────────────────────────────────

export async function apiFetch<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; _retried?: boolean; expectedUser?: string } = {}
): Promise<T> {
  const tokens = await getTokens();
  if (!tokens || (opts.expectedUser && tokens.user.id !== opts.expectedUser)) throw new ApiError(401, "Account changed. Sign in to the original account to sync these changes.");

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokens.accessToken}`,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Network unreachable");
  }

  if (res.status === 401 && !opts._retried) {
    const fresh = await refreshSession();
    if (fresh) {
      return apiFetch<T>(path, { ...opts, _retried: true });
    }
    if (await getTokens()) throw new ApiError(0, "Session refresh is temporarily unavailable. Retry when connected.");
    throw new ApiError(401, "Session expired. Please sign in again.");
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch { /* not json */ }
    throw new ApiError(res.status, message);
  }

  return (await res.json()) as T;
}

// ─── One-time OAuth code exchange ─────────────────────────────────────────────

export async function exchangeAuthCode(code: string): Promise<Tokens> {
  const res = await fetch(`${API_URL}/api/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, verifier: sessionStorage.getItem("ps_pkce") }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? "Could not complete sign-in");
  }
  const tokens = (await res.json()) as Tokens;
  sessionStorage.removeItem("ps_pkce");
  await setTokens(tokens);
  return tokens;
}

/**
 * Web flow: after Google redirects back to the app with ?code=…,
 * exchange it for tokens and strip the query from the address bar.
 * Returns the signed-in user, or null if the URL carries no code
 * (or the flow was cancelled → auth_error param).
 */
export async function consumeUrlAuthCode(): Promise<
  { user: PublicUser } | { error: string } | null
> {
  if (IS_EXTENSION) return null;
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const authError = url.searchParams.get("auth_error");
  if (!code && !authError) return null;

  // Remove the sensitive params from the address bar immediately
  url.searchParams.delete("code");
  url.searchParams.delete("auth_error");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);

  if (authError) {
    return { error: authError === "cancelled"
      ? "Sign-in was cancelled. Please try again."
      : "Sign-in failed. The server could not complete Google authentication. Please try again." };
  }
  try {
    const tokens = await exchangeAuthCode(code!);
    return { user: tokens.user };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Sign-in failed" };
  }
}
