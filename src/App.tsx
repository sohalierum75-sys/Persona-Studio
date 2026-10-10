import DeleteConfirmationDialog from "./components/ui/DeleteConfirmationDialog";
import UpgradeDialog from "./components/auth/UpgradeDialog";
import React, { useEffect } from "react";
import { Routes, Route, Navigate, Outlet, useSearchParams } from "react-router-dom";
import { useStudio } from "./store";
import { useAuth, initAuth, signInWithGoogle } from "./lib/auth";
import { API_CONFIGURED, IS_EXTENSION } from "./lib/config";
import StudioLayout from "./components/studio/StudioLayout";
import CharactersPage from "./pages/CharactersPage";
import CharacterEditorPage from "./pages/CharacterEditorPage";
import EpisodePage from "./pages/EpisodePage";
import WardrobePage from "./pages/WardrobePage";
import LocationsPage from "./pages/LocationsPage";
import HistoryPage from "./pages/HistoryPage";
import SettingsPage from "./pages/SettingsPage";
import AuthGate, { LoadingScreen, SignInScreen } from "./components/auth/AuthGate";
import HomePage from "./pages/HomePage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import TermsPage from "./pages/TermsPage";
import RefundPolicyPage from "./pages/RefundPolicyPage";
import PricingPage from "./pages/PricingPage";
import { pendingCheckoutPlan } from "./lib/billing";

// ─── Studio layout wrapper (layout route shared by all studio pages) ──────────

function StudioRoot() {
  const { loadAll, isLoaded, settings } = useStudio();

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", settings.theme);
    document.documentElement.setAttribute(
      "data-reduced-motion",
      settings.reducedMotion ? "true" : "false"
    );
  }, [settings]);

  if (!isLoaded) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: "var(--bg-base)", color: "var(--text-muted)",
        fontSize: 14,
      }}>
        <div style={{ textAlign: "center" }}>
          <div className="loading-mark" />
          <p>Loading Persona Studio…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <AuthGate>
      <StudioLayout>
        <Outlet />
      </StudioLayout>
    </AuthGate>
  );
}

// ─── Root route — homepage for visitors, redirect for signed-in users ─────────

function RootRoute() {
  const auth = useAuth();
  // ?checkout=… keeps a signed-in user on the homepage: it is set when a
  // pricing checkout starts and by Paddle's post-payment redirect.
  // ?pricing=1 lets signed-in Free users view optional upgrades.
  const [params] = useSearchParams();
  const inCheckout = params.has("checkout") || params.has("_ptxn") || params.has("pricing") || pendingCheckoutPlan() !== null;

  // Extension context never needs the marketing homepage
  if (IS_EXTENSION) return <Navigate to="/characters" replace />;

  // Local-only mode (no API configured) — skip homepage
  if (!API_CONFIGURED) return <Navigate to="/characters" replace />;

  // Confirmed signed-in → go to Studio (unless a checkout brought them here)
  if (auth.status === "signed-in") {
    if (inCheckout) return <HomePage />;
    return <Navigate to="/characters" replace />;
  }

  // Finish callback exchange/session restoration before choosing a public route.
  if (auth.status === "initialising" || auth.status === "signing-in") {
    return <LoadingScreen message={auth.status === "signing-in" ? "Signing in with Google…" : "Loading Persona Studio…"} />;
  }
  // OAuth returns to this route; keep failures visible with the existing retry UI.
  if (auth.error) {
    return <SignInScreen loading={false} error={auth.error} onSignIn={signInWithGoogle} />;
  }

  return <HomePage />;
}

// ─── App ─────────────────────────────────────────────────────────────────────

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
    <Routes>
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
    </Routes>
    </>
  );
}
