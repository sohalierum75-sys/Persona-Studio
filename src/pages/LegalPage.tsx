/**
 * LegalPage — shared layout for Privacy Policy, Terms & Conditions, and Refund Policy.
 *
 * Renders a minimal header (logo + back link) and a full-page footer that
 * mirrors the homepage footer, so the three policy pages feel like part of
 * the same site without re-using the full marketing shell.
 */

import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Brand from "../components/ui/Brand";
import "./LegalPage.css";

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

export default function LegalPage({ title, lastUpdated, children }: LegalPageProps) {
  return (
    <div className="lp-root" data-theme="light">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="lp-header">
        <Link to="/" className="lp-logo" aria-label="Persona Studio home">
          <Brand />
        </Link>
        <Link to="/" className="lp-back">
          <ArrowLeft size={14} /> Back to site
        </Link>
      </header>

      {/* ── Prose ──────────────────────────────────────────────── */}
      <main className="lp-main">
        <div className="lp-prose">
          <p className="lp-date">Last updated: {lastUpdated}</p>
          <h1>{title}</h1>
          {children}
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <span>© {new Date().getFullYear()} Persona Studio</span>
        <Link to="/privacy-policy">Privacy Policy</Link>
        <Link to="/terms">Terms &amp; Conditions</Link>
        <Link to="/refund-policy">Refund Policy</Link>
        <Link to="/characters">
          Open Studio <ArrowRight size={13} />
        </Link>
      </footer>
    </div>
  );
}
