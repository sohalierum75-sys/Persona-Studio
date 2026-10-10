import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useStudio } from "../../store";
import AuthGate from "../auth/AuthGate";
import StudioLayout from "./StudioLayout";

export default function StudioRoot() {
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

