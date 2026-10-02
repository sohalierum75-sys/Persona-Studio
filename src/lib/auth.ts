/**
 * Auth state management — Google sign-in for both web and extension,
 * backed by the self-hosted Persona Studio API.
 *
 * Web:        full-page redirect to the API's /api/auth/google/start,
 *             Google calls back to the API, the API redirects to the app
 *             with a single-use code, exchanged here for session tokens.
 * Extension:  chrome.identity.launchWebAuthFlow with the same API start
 *             URL — same Google identity resolves to the same user.
 *
 * Session restoration, proactive refresh and expiry are handled here;
 * 401-triggered refresh lives in api.ts.
 */

import { API_URL, API_CONFIGURED, IS_EXTENSION } from "./config";
import {
  getTokens, setTokens, clearTokens, exchangeAuthCode,
  consumeUrlAuthCode, refreshSession, type PublicUser,
} from "./api";
import { useState, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuthStatus =
  | "initialising"
  | "signed-out"
  | "signing-in"
  | "signed-in"
  | "error";

export interface AuthState {
  status: AuthStatus;
  user: PublicUser | null;
  error: string | null;
  /** true when a previously valid session expired and re-auth is needed */
  sessionExpired: boolean;
}

export type AuthListener = (state: AuthState) => void;

// ─── Internal state ───────────────────────────────────────────────────────────

let _state: AuthState = {
  status: "initialising",
  user: null,
  error: null,
  sessionExpired: false,
};

const _listeners = new Set<AuthListener>();
let _refreshTimer: ReturnType<typeof setTimeout> | null = null;

function setState(partial: Partial<AuthState>) {
  _state = { ..._state, ...partial };
  _listeners.forEach((l) => l(_state));
}

export function getAuthState(): AuthState { return _state; }

export function subscribeAuth(listener: AuthListener): () => void {
  _listeners.add(listener);
  listener(_state);
  return () => _listeners.delete(listener);
}

// ─── Proactive access-token refresh ───────────────────────────────────────────

function scheduleProactiveRefresh(): void {
  if (_refreshTimer) clearTimeout(_refreshTimer);
  getTokens().then((tokens) => {
    if (!tokens) return;
    const msLeft = tokens.expiresAt - Date.now() - 120_000; // 2 min margin
    _refreshTimer = setTimeout(async () => {
      const fresh = await refreshSession();
      if (fresh) {
        setState({ user: fresh.user });
        scheduleProactiveRefresh();
      } else {
        // Either network hiccup (tokens kept) or session dead (tokens cleared)
        const stillThere = await getTokens();
        if (stillThere) scheduleProactiveRefresh();
        else setState({ status: "signed-out", user: null, sessionExpired: true });
      }
    }, Math.max(msLeft, 30_000));
  });
}

// ─── Initialise / restore session ─────────────────────────────────────────────

let _initPromise: Promise<AuthState> | null = null;

export async function initAuth(): Promise<AuthState> {
  // If a previous run already finished, reset so we can re-initialise
  // (e.g. when called after session expiry or sign-out).
  if (_initPromise && _state.status !== "initialising") {
    _initPromise = null;
  }
  if (_initPromise) return _initPromise;
  setState({ status: "initialising", error: null, sessionExpired: false });
  _initPromise = (async () => {
    if (!API_CONFIGURED) {
      setState({ status: "signed-out", user: null, error: null });
      return _state;
    }

    try {
      // 1. Returning from the web OAuth redirect? (?code=… / ?auth_error=…)
      const urlResult = await consumeUrlAuthCode();
      if (urlResult && "user" in urlResult) {
        setState({ status: "signed-in", user: urlResult.user, error: null, sessionExpired: false });
        scheduleProactiveRefresh();
        return _state;
      }
      if (urlResult && "error" in urlResult) {
        setState({ status: "error", user: null, error: urlResult.error });
        return _state;
      }

      // 2. Restore a persisted session
      let tokens = await getTokens();
      if (tokens) {
        // Expired (or nearly)? Refresh immediately.
        if (tokens.expiresAt - Date.now() < 60_000) {
          tokens = (await refreshSession()) ?? (await getTokens());
        }
        if (tokens) {
          setState({ status: "signed-in", user: tokens.user, error: null, sessionExpired: false });
          scheduleProactiveRefresh();
          return _state;
        }
        setState({ status: "signed-out", user: null, sessionExpired: true });
        return _state;
      }

      // 3. No session at all
      setState({ status: "signed-out", user: null, error: null });
    } catch (err) {
      setState({
        status: "error",
        error: err instanceof Error ? err.message : "Auth initialisation failed",
      });
    }
    return _state;
  })();
  return _initPromise;
}

// ─── Sign in ──────────────────────────────────────────────────────────────────

export async function signInWithGoogle(opts?: { returnUrl?: string }): Promise<void> {
  if (!API_CONFIGURED) {
    setState({ status: "error", error: "Sync server is not configured. See .env.local." });
    return;
  }

  setState({ status: "signing-in", error: null });

  try {
    if (IS_EXTENSION) {
      await signInExtension();
    } else {
      await signInWeb(opts?.returnUrl);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sign-in failed";
    setState({ status: "error", error: msg });
  }
}

/** Web: top-level redirect through the API. The API redirects back with a code. */
async function signInWeb(returnUrl?: string): Promise<void> {
  const challenge = await makeChallenge();
  const target = returnUrl ?? window.location.origin + window.location.pathname;
  window.location.href =
    `${API_URL}/api/auth/google/start?client=web&challenge=${challenge}&redirect=${encodeURIComponent(target)}`;
  // Navigation takes over from here
}

/** Extension: chrome.identity.launchWebAuthFlow against the same API. */
async function signInExtension(): Promise<void> {
  const challenge = await makeChallenge();
  const redirectUri = chrome.identity.getRedirectURL();
  const startUrl =
    `${API_URL}/api/auth/google/start?client=extension&challenge=${challenge}&redirect=${encodeURIComponent(redirectUri)}`;

  const responseUrl = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: startUrl, interactive: true },
      (url) => {
        if (chrome.runtime.lastError || !url) {
          const msg = chrome.runtime.lastError?.message ?? "";
          reject(new Error(msg.includes("user gesture") || msg.includes("closed")
            ? "Sign-in cancelled." : (msg || "Auth cancelled")));
        } else {
          resolve(url);
        }
      }
    );
  });

  const code = new URL(responseUrl).searchParams.get("code");
  if (!code) {
    const err = new URL(responseUrl).searchParams.get("auth_error");
    throw new Error(err === "cancelled" ? "Sign-in cancelled." : (err ?? "No auth code returned"));
  }

  const tokens = await exchangeAuthCode(code);
  setState({ status: "signed-in", user: tokens.user, error: null, sessionExpired: false });
  scheduleProactiveRefresh();
}

// ─── Sign out ─────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
  const tokens = await getTokens();
  await clearTokens();
  setState({ status:"signed-out",user:null,error:null,sessionExpired:false });
  if(tokens) void fetch(`${API_URL}/api/auth/logout`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({refreshToken:tokens.refreshToken}),signal:AbortSignal.timeout(10000)}).catch(()=>{});
}
// Other tabs/panels must stop showing an account immediately after a switch.
const storageChanged = async () => {
  const tokens=await getTokens();
  if(tokens?.user.id !== _state.user?.id) void initAuth();
};
if(typeof window!=="undefined")window.addEventListener("storage",e=>{if(e.key==="ps_auth_tokens")void storageChanged();});
if(IS_EXTENSION)chrome.storage.onChanged.addListener(changes=>{if(changes.ps_auth_tokens)void storageChanged();});

// ─── React hook ───────────────────────────────────────────────────────────────

export function useAuth(): AuthState {
  const [state, setLocalState] = useState<AuthState>(_state);
  useEffect(() => subscribeAuth(setLocalState), []);
  return state;
}

async function makeChallenge(): Promise<string> {
  const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  const verifier = encode(crypto.getRandomValues(new Uint8Array(32)));
  sessionStorage.setItem("ps_pkce", verifier);
  return encode(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier))));
}
