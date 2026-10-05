/**
 * AuthGate — wraps the app. Shows sign-in screen when not authenticated.
 * When the sync API is not configured, passes children through unchanged
 * so the app works in local-only mode.
 */
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth, getAuthState, initAuth, signInWithGoogle } from "../../lib/auth";
import { initSync, teardownSync, setOnRemoteChange } from "../../lib/sync";
import { ensureAccountCache } from "../../lib/accounts";
import { onAuthExpired } from "../../lib/api";
import { API_CONFIGURED, IS_EXTENSION } from "../../lib/config";
import { useStudio } from "../../store";
import MigrationPrompt from "./MigrationPrompt";
import ConflictReview from "./ConflictReview";
import Brand from "../ui/Brand";

interface Props {
  children: React.ReactNode;
}

let _bootstrapped = false;

export default function AuthGate({ children }: Props) {
  const auth = useAuth();
  const [ready, setReady] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Bootstrap auth on mount
  useEffect(() => {
    if (!_bootstrapped) {
      _bootstrapped = true;
      // App already bootstraps web auth. The standalone floating panel still needs
      // this, but remounting the gate must not clear a completed callback error.
      if (getAuthState().status === "initialising") void initAuth();
    }
  }, []);

  // When a session silently expires, flip the auth state so the UI reacts
  useEffect(() => onAuthExpired(() => {
    teardownSync();
    // Force a re-render into the signed-out state
    initAuth();
  }), []);

  // When user signs in → switch the local cache to their account, init sync,
  // and reload the store whenever the server sends us different data.
  useEffect(() => {
    if (auth.status === "signed-in" && auth.user) {
      let cancelled = false;
      setReady(null); setLoadError(null);
      (async () => {
        if (cancelled) return;
        await ensureAccountCache(auth.user!.id);
        if (cancelled) return;
        setOnRemoteChange(() => { void useStudio.getState().loadAll(); });
        await initSync(auth.user!.id);
        // Initial pull may have brought server data → reload the store
        await useStudio.getState().loadAll();
        if (!cancelled) setReady(auth.user!.id);
      })().catch(e => { if (!cancelled) setLoadError(String(e)); });
      return () => { cancelled = true; teardownSync(); };
    }
    if (auth.status === "signed-out" || auth.status === "error") {
      teardownSync();
    }
  }, [auth.status, auth.user?.id]);

  // If no API is configured → skip auth entirely (local-only mode)
  if (!API_CONFIGURED) return <>{children}</>;

  // Initialising
  if (auth.status === "initialising" || auth.status === "signing-in") {
    return <LoadingScreen message={auth.status === "signing-in" ? "Signing in with Google…" : "Loading Persona Studio…"}/>;
  }

  // Signed in → show app + migration prompt + conflict review
  if (auth.status === "signed-in" && ready !== auth.user?.id) return <LoadingScreen message={loadError ?? "Loading your workspace?"}/>;
  if (auth.status === "signed-in") {
    return (
      <>
        {children}
        {auth.user && <MigrationPrompt userId={auth.user.id} userEmail={auth.user.email}/>}
        <ConflictReview/>
      </>
    );
  }

  // Signed out / error → show sign-in screen
  return (
    <SignInScreen
      loading={false}
      error={auth.error}
      onSignIn={signInWithGoogle}
    />
  );
}

// ─── Sign-in screen ───────────────────────────────────────────────────────────

export function SignInScreen({
  loading, error, onSignIn,
}: { loading: boolean; error: string | null; onSignIn: () => void }) {
  return (
    <div className="auth-page">
      <div className="surface auth-card">
        {/* Logo */}
        <div className="auth-brand"><Brand /><p>One character. Every scene.</p></div>

        {/* Tagline */}
        <div><h1>Welcome to your Studio.</h1><p>Sign in to keep your characters, scenes, and prompts together across devices.</p></div>

        {/* Error */}
        {error && (
          <div role="alert" className="auth-error">
            {error}
          </div>
        )}

        {/* Google button */}
        <button
          onClick={onSignIn}
          disabled={loading}
          className="btn btn-secondary auth-google"
        >
          {loading ? (
            <span style={{ fontSize:13, color:"var(--text-muted)" }}>Signing in…</span>
          ) : (
            <>
              {/* Google G logo SVG */}
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <p className="auth-footnote">
          Your data is stored privately and never shared.
          You can use the app offline — changes sync when you reconnect.
        </p>
        {/* Router link only on the web app — the floating panel mounts without a
            Router, and a <Link> there crashes the whole tree with a null context. */}
        {!IS_EXTENSION && <Link className="auth-back" to="/">Back to Persona Studio</Link>}
      </div>
    </div>
  );
}

export function LoadingScreen({ message }: { message: string }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"var(--bg-base)" }}>
      <div style={{ textAlign:"center" }}>
        <div className="loading-mark" />
        <p style={{ color:"var(--text-muted)", fontSize:13 }}>{message}</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
