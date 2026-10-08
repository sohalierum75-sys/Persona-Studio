/**
 * PricingPage — dedicated public page at /pricing.
 *
 * Reuses the existing PricingSection component (cards, prices, plan details,
 * Paddle checkout integration) unchanged. The shell mirrors the legal-page
 * layout: sticky header with logo + back link, then a shared footer.
 *
 * No auth gate — the route is accessible without signing in, survives hard
 * refresh, and is linked from the homepage nav.
 */

import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Brand from "../components/ui/Brand";
import PricingSection from "../components/home/PricingSection";
import "./LegalPage.css";
import "./PricingPage.css";

export default function PricingPage() {
  return (
    <div className="lp-root pp-root" data-theme="light">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="lp-header">
        <Link to="/" className="lp-logo" aria-label="Persona Studio home">
          <Brand />
        </Link>
        <Link to="/" className="lp-back">
          <ArrowLeft size={14} /> Back to site
        </Link>
      </header>

      {/* ── Pricing content ─────────────────────────────────────── */}
      <main className="pp-main" id="pricing-main" tabIndex={-1}>
        <PricingSection />
      </main>

      {/* ── Footer ──────────────────────────────────────────────── */}
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
