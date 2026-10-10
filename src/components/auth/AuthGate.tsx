/**
 * AuthGate — wraps the app. Shows sign-in screen when not authenticated.
 * When the sync API is not configured, passes children through unchanged
 * so the app works in local-only mode.
 */
import React, { useEffect, useState } from "react";
import { useAuth, getAuthState, initAuth, signInWithGoogle } from "../../lib/auth";
import { initSync, teardownSync, setOnRemoteChange } from "../../lib/sync";
import { ensureAccountCache } from "../../lib/accounts";
import { onAuthExpired } from "../../lib/api";
import { API_CONFIGURED } from "../../lib/config";
import { useStudio } from "../../store";
import MigrationPrompt from "./MigrationPrompt";
import ConflictReview from "./ConflictReview";
import { LoadingScreen, SignInScreen } from "./AuthScreens";
export { LoadingScreen, SignInScreen } from "./AuthScreens";

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

