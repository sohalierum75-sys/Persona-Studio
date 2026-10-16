import DeleteConfirmationDialog from "./components/ui/DeleteConfirmationDialog";
import UpgradeDialog from "./components/auth/UpgradeDialog";
import React, { lazy, Suspense, useEffect, useState } from "react";
import { Routes, Route, Navigate, useSearchParams } from "react-router-dom";
import { useAuth, initAuth, signInWithGoogle } from "./lib/auth";
import { API_CONFIGURED, IS_EXTENSION } from "./lib/config";
const CharactersPage = lazy(() => import("./pages/CharactersPage"));
const CharacterEditorPage = lazy(() => import("./pages/CharacterEditorPage"));
const EpisodePage = lazy(() => import("./pages/EpisodePage"));
const WardrobePage = lazy(() => import("./pages/WardrobePage"));
const LocationsPage = lazy(() => import("./pages/LocationsPage"));
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
import { LoadingScreen, SignInScreen } from "./components/auth/AuthScreens";
import HomePage from "./pages/HomePage";
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const RefundPolicyPage = lazy(() => import("./pages/RefundPolicyPage"));
const PricingPage = lazy(() => import("./pages/PricingPage"));

// ─── Studio layout wrapper (layout route shared by all studio pages) ──────────

// ─── Root route — homepage for visitors, redirect for signed-in users ─────────

function RootRoute() {
  const auth = useAuth();
  // "/" is always the public homepage — signed in or out, fresh visit or
  // refresh. Authentication only decides what the header shows (Sign in vs.
  // the account menu); it never redirects to the Studio. The one exception is
  // returning from the Google OAuth redirect (?code=… / ?auth_error=…): the
  // single-use code must be exchanged before the header can show real state.
  const [params] = useSearchParams();
  const [isCallback] = useState(() => params.has("code") || params.has("auth_error"));

  // Extension context never needs the marketing homepage
  if (IS_EXTENSION) return <Navigate to="/characters" replace />;

  // Local-only mode (no API configured) — skip homepage
  if (!API_CONFIGURED) return <Navigate to="/characters" replace />;

  // Finish the callback code exchange before showing the homepage.
  if (isCallback && (auth.status === "initialising" || auth.status === "signing-in")) {
    return <LoadingScreen message={auth.status === "signing-in" ? "Signing in with Google…" : "Loading Persona Studio…"} />;
  }
  // OAuth returns to this route; keep failures visible with the existing retry UI.
  if (auth.status === "error") {
    return <SignInScreen loading={false} error={auth.error} onSignIn={signInWithGoogle} />;
  }

  return <HomePage />;
}

// ─── App ─────────────────────────────────────────────────────────────────────

const StudioRoot = lazy(() => import("./components/studio/StudioRoot"));

let _authBootstrapped = false;

export default function App() {
  // Kick off auth once at app start — regardless of which route is active.
  // Previously this lived inside AuthGate, but the root route no longer
  // renders AuthGate, so we bootstrap from here instead.
  useEffect(() => {
    if (!_authBootstrapped) {
      _authBootstrapped = true;
      void initAuth();
    }
  }, []);

  return (
    <>
    <UpgradeDialog />
    <DeleteConfirmationDialog />
    <Suspense fallback={<LoadingScreen message="Loading Persona Studio?" />}><Routes>
      {/* Public homepage (unauthenticated) */}
      <Route path="/" element={<RootRoute />} />

      {/* Public pages — no auth gate */}
      <Route path="/pricing"        element={<PricingPage />} />
      <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
      <Route path="/terms"          element={<TermsPage />} />
      <Route path="/refund-policy"  element={<RefundPolicyPage />} />

      {/* Studio — single layout route; AuthGate lives inside StudioRoot */}
      <Route element={<StudioRoot />}>
        <Route path="/characters"     element={<CharactersPage />} />
        <Route path="/characters/:id" element={<CharacterEditorPage />} />
        <Route path="/episodes/:id"   element={<EpisodePage />} />
        <Route path="/wardrobe"       element={<WardrobePage />} />
        <Route path="/locations"      element={<LocationsPage />} />
        <Route path="/history"        element={<HistoryPage />} />
        <Route path="/settings"       element={<SettingsPage />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes></Suspense>
    </>
  );
}
