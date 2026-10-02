/**
 * Pricing — lifetime deal (first 50, server-enforced) and monthly plan.
 *
 * Buttons connect to real Lemon Squeezy checkouts through the API
 * (POST /api/billing/checkout requires sign-in, so the purchase can be
 * attributed). No countdowns, no decorative urgency: the claimed counter
 * is the server's real number, and unavailability is stated as such.
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { useAuth, signInWithGoogle } from "../../lib/auth";
import {
  fetchBillingPlans, fetchEntitlements, startCheckout,
  type BillingPlan, type BillingPlansInfo, type Entitlements,
} from "../../lib/billing";

const INTENT_KEY = "ps_billing_intent";

const LIFETIME_FEATURES = [
  "Full Studio workspace — characters, wardrobe, locations, episodes",
  "Bulk scene builder and continuity checks",
  "Prompt formatting for Midjourney, Stable Diffusion, and Flux",
  "Chrome side panel with click-to-copy prompts",
  "Google account sync between Studio and extension",
];
const MONTHLY_FEATURES = [
  "Everything in the lifetime plan — no feature differences",
  "Pay month to month",
  "Cancel anytime; access runs to the end of the paid month",
];

type Confirmation = "pending" | "active" | "delayed" | "signed-out" | null;

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function PricingSection() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [plans, setPlans] = useState<BillingPlansInfo | null>(null);
  const [ents, setEnts] = useState<Entitlements | null>(null);
  const [busy, setBusy] = useState<BillingPlan | null>(null);
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation>(null);

  const signedIn = auth.status === "signed-in";
  const lifetimeActive = ents?.lifetime.active === true;
  const subscriptionActive = ents?.subscription?.active === true;
  const soldOut = plans?.lifetime.remaining === 0;

  useEffect(() => { void fetchBillingPlans().then(setPlans); }, []);

  useEffect(() => {
    if (!signedIn) { setEnts(null); return; }
    void fetchEntitlements().then(setEnts).catch(() => {});
  }, [signedIn]);

  function refreshPlansAndEnts() {
    void fetchBillingPlans().then(setPlans);
    if (signedIn) void fetchEntitlements().then(setEnts).catch(() => {});
  }

  async function buy(plan: BillingPlan) {
    setNotice("");
    if (!signedIn) {
      // Checkout must know who is buying — sign in first, then resume.
      try { sessionStorage.setItem(INTENT_KEY, plan); } catch { /* storage unavailable */ }
      void signInWithGoogle();
      return;
    }
    setBusy(plan);
    try {
      const { url } = await startCheckout(plan);
      // Keep the checkout marker in the URL so returning to this tab stays
      // on the homepage instead of bouncing to the Studio mid-redirect.
      navigate(`/?checkout=${plan}`, { replace: true });
      window.location.assign(url);
    } catch (err) {
      setBusy(null);
      setNotice(err instanceof Error ? err.message : "Checkout could not be started.");
      refreshPlansAndEnts();
    }
  }

  // Resume checkout after the sign-in round-trip: turn the stored intent
  // into the ?checkout= marker, then start the checkout.
  useEffect(() => {
    if (!signedIn) return;
    let intent: string | null = null;
    try { intent = sessionStorage.getItem(INTENT_KEY); sessionStorage.removeItem(INTENT_KEY); } catch { /* */ }
    if (intent === "lifetime" || intent === "monthly") {
      navigate(`/?checkout=${intent}`, { replace: true });
      void buy(intent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  // Post-payment confirmation (?checkout=success from Lemon Squeezy).
  useEffect(() => {
    if (params.get("checkout") !== "success") return;
    if (!signedIn) { setConfirmation("signed-out"); return; }
    setConfirmation("pending");
    let cancelled = false;
    let tries = 0;
    const tick = async () => {
      tries += 1;
      try {
        const e = await fetchEntitlements();
        if (cancelled) return;
        setEnts(e);
        if (e.lifetime.active || e.subscription?.active) { setConfirmation("active"); return; }
      } catch { /* keep polling */ }
      if (cancelled) return;
      if (tries < 6) setTimeout(tick, 3000);
      else setConfirmation("delayed");
    };
    const timer = setTimeout(tick, 1500);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, signedIn]);

  const claimed = plans?.lifetime.claimed ?? null;
  const limit = plans?.lifetime.limit ?? 50;

  return <section className="hp-section" id="pricing" aria-label="Pricing">
    <div className="hp-section-head">
      <span className="hp-eyebrow">Pricing</span>
      <h2>One studio. Two ways to pay.</h2>
      <p>Both plans include everything — there are no feature tiers. Take the lifetime deal while it lasts, or pay as you go.</p>
    </div>

    {confirmation && <div className={`hp-checkout-note ${confirmation === "active" ? "is-active" : confirmation === "pending" ? "is-pending" : "is-warn"}`} role="status">
      {confirmation === "pending" && "Payment received — activating your access. This usually takes a few seconds."}
      {confirmation === "active" && "You're all set — your access is active. Open the Studio to keep going."}
      {confirmation === "delayed" && "Payment received. Activation is taking longer than usual — refresh this page in a minute."}
      {confirmation === "signed-out" && "Payment received. Sign in with the same Google account to finish activating your access."}
    </div>}

    <div className="hp-pricing">
      <section className={`hp-plan is-featured${soldOut ? " is-sold-out" : ""}`} aria-label="Lifetime plan">
        <span className="hp-plan-badge">First 50 customers</span>
        <h3>Lifetime</h3>
        <p className="hp-plan-sub">Pay once. Yours forever.</p>
        <div className="hp-plan-price">
          <s aria-label="Regular price $49">$49</s>
          <strong>$39</strong>
          <span>one-time</span>
        </div>
        {claimed != null
          ? <div className="hp-plan-claimed">
              <div className="hp-plan-bar" role="img" aria-label={`${claimed} of ${limit} lifetime deals claimed`}>
                <span style={{ width: `${Math.min(100, (claimed / Math.max(limit, 1)) * 100)}%` }} />
              </div>
              <small>{claimed} of {limit} claimed</small>
            </div>
          : <small className="hp-plan-limit">Limited to the first {limit} customers — after that, monthly only.</small>}
        <ul>
          {LIFETIME_FEATURES.map(f => <li key={f}><Check size={14} /><span>{f}</span></li>)}
        </ul>
        {lifetimeActive
          ? <span className="hp-plan-active"><Check size={15} /> Lifetime access active</span>
          : soldOut
            ? <button className="btn btn-secondary hp-plan-cta" disabled>Sold out — monthly available</button>
            : <button className="btn btn-primary hp-plan-cta" id="pricing-lifetime-cta" disabled={busy !== null} onClick={() => void buy("lifetime")}>
                {busy === "lifetime" ? "Connecting to checkout…" : <>Get lifetime access <ArrowRight size={15} /></>}
              </button>}
        <p className="hp-plan-note">One-time payment — no subscription, ever.</p>
      </section>

      <section className="hp-plan" aria-label="Monthly plan">
        <h3>Monthly</h3>
        <p className="hp-plan-sub">The same studio, month to month.</p>
        <div className="hp-plan-price">
          <strong>$9</strong>
          <span>per month</span>
        </div>
        <small className="hp-plan-limit">Start now, stop whenever you like.</small>
        <ul>
          {MONTHLY_FEATURES.map(f => <li key={f}><Check size={14} /><span>{f}</span></li>)}
        </ul>
        {subscriptionActive
          ? <span className="hp-plan-active"><Check size={15} /> Monthly plan active{ents?.subscription?.renewsAt ? ` — renews ${formatDate(ents.subscription.renewsAt)}` : ""}</span>
          : lifetimeActive
            ? <span className="hp-plan-cover">Covered by your lifetime access</span>
            : <button className="btn btn-secondary hp-plan-cta" id="pricing-monthly-cta" disabled={busy !== null} onClick={() => void buy("monthly")}>
                {busy === "monthly" ? "Connecting to checkout…" : <>Start monthly <ArrowRight size={15} /></>}
              </button>}
        <p className="hp-plan-note">Cancel anytime — keep access until the paid month ends.</p>
      </section>
    </div>

    {notice && <p className="hp-pricing-notice" role="alert">{notice}</p>}
    <p className="hp-pricing-fineprint">Checkout and payments are handled by Lemon Squeezy. Prices in USD.</p>
  </section>;
}
