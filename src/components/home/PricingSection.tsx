/**
 * Pricing — lifetime deal (first 50, server-enforced) and monthly plan.
 *
 * Buttons connect to real Paddle checkouts through the API
 * (POST /api/billing/checkout requires sign-in, so the purchase can be
 * attributed). No countdowns, no decorative urgency: the claimed counter
 * is the server's real number, and unavailability is stated as such.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { useAuth, signInWithGoogle, initAuth } from "../../lib/auth";
import { openPaddleCheckout } from "../../lib/paddle-checkout";
import {
  fetchBillingPlans, fetchEntitlements, startCheckout,
  pendingCheckoutPlan, saveCheckoutPlan, requireCheckoutConfiguration,
  type BillingPlan, type BillingPlansInfo, type Entitlements,
} from "../../lib/billing";

const LIFETIME_FEATURES = [
  "Full Studio workspace — characters, wardrobe, locations, episodes",
  "Bulk scene builder and continuity checks",
  "Prompt formatting for Midjourney, Stable Diffusion, and Flux",
  "Chrome floating panel with click-to-copy prompts",
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
  const checkoutInFlight = useRef(false);

  const signedIn = auth.status === "signed-in";
  const purchaseDisabled = busy !== null || auth.status === "initialising" || auth.status === "signing-in";
  const lifetimeActive = ents?.lifetime.active === true;
  const subscriptionActive = ents?.subscription?.active === true;
  const soldOut = plans?.lifetime?.remaining === 0;

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
    if (checkoutInFlight.current || auth.status === "initialising" || auth.status === "signing-in") return;
    checkoutInFlight.current = true;
    setBusy(plan);
    setNotice("");
    try {
      const config = await requireCheckoutConfiguration();
      let authenticated = signedIn;
      if (!authenticated && auth.status === "error") {
        // "error" can hide a still-valid stored session (e.g. a failed OAuth
        // return above). Restore it once instead of starting Google again —
        // otherwise a single bad callback loops the user through sign-in.
        const state = await initAuth();
        authenticated = state.status === "signed-in";
      }
      if (!authenticated) {
        saveCheckoutPlan(plan);
        const target = new URL(window.location.href);
        target.searchParams.set("checkout", plan);
        target.searchParams.delete("code");
        target.searchParams.delete("auth_error");
        target.hash = "";
        await signInWithGoogle({ returnUrl: target.href });
        return;
      }
      const { url } = await startCheckout(plan);
      await openPaddleCheckout(url, config, auth.user?.email);
    } catch (err) {
      console.error(`[checkout] could not start ${plan} checkout:`, err);
      setNotice(err instanceof Error ? err.message : "Checkout could not be started.");
      refreshPlansAndEnts();
    } finally {
      checkoutInFlight.current = false;
      setBusy(null);
    }
  }

  // Resume only after session restoration, using either persisted intent source.
  useEffect(() => {
    if (!signedIn) return;
    const intent = pendingCheckoutPlan();
    saveCheckoutPlan(null);
    if (intent) {
      // Consume before requesting: remounts, refreshes and Back must not create
      // a second transaction. Keep the public page pinned, including on errors.
      const target = new URL(window.location.href);
      target.searchParams.delete("checkout");
      target.searchParams.delete("code");
      target.searchParams.delete("auth_error");
      target.searchParams.set("pricing", "1");
      window.history.replaceState(window.history.state, "", target.pathname + target.search + target.hash);
      navigate(target.pathname + target.search + target.hash, { replace: true });
      void buy(intent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  // Paddle's payment links can also be opened directly (including from emails).
  useEffect(() => {
    if (!params.has("_ptxn")) return;
    const target = new URL(window.location.href);
    if (!target.searchParams.has("_ptxn")) return;
    const paymentUrl = target.href;
    saveCheckoutPlan(null);
    target.searchParams.delete("_ptxn");
    target.searchParams.set("pricing", "1");
    window.history.replaceState(window.history.state, "", target.pathname + target.search);
    navigate(target.pathname + target.search, { replace: true });
    void requireCheckoutConfiguration()
      .then(config => openPaddleCheckout(paymentUrl, config))
      .catch(error => setNotice(error instanceof Error ? error.message : "Checkout could not be started."));
  }, [params, navigate]);

  // Post-payment confirmation (?checkout=success from Paddle).
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

  const claimed = plans?.lifetime?.claimed ?? null;
  const limit = plans?.lifetime?.limit ?? 50;

  return <section className="hp-section" id="pricing" aria-label="Pricing">
    <div className="hp-section-head">
      <span className="hp-eyebrow">Pricing</span>
      <h2>Start free. Upgrade when you need more.</h2>
      <p>Free includes 1 character, 1 episode, 10 saved prompts, and up to 3 scenes per bulk import. Monthly and lifetime plans include unlimited access to existing features.</p>
      <button className="btn btn-secondary" onClick={() => signedIn ? navigate("/characters") : void signInWithGoogle()}>Use Free plan — no purchase required</button>
    </div>

    {confirmation && <div className={`hp-checkout-note ${confirmation === "active" ? "is-active" : confirmation === "pending" ? "is-pending" : "is-warn"}`} role="status">
      {confirmation === "pending" && "Checking your access. Payment confirmation may take a few seconds."}
      {confirmation === "active" && "You're all set — your access is active. Open the Studio to keep going."}
      {confirmation === "delayed" && "Paid access has not been confirmed yet. If you completed payment, refresh this page in a minute."}
      {confirmation === "signed-out" && "Sign in with the same Google account to check your purchase and access."}
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
            : <button className="btn btn-primary hp-plan-cta" id="pricing-lifetime-cta" disabled={purchaseDisabled} onClick={() => void buy("lifetime")}>
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
            : <button className="btn btn-secondary hp-plan-cta" id="pricing-monthly-cta" disabled={purchaseDisabled} onClick={() => void buy("monthly")}>
                {busy === "monthly" ? "Connecting to checkout…" : <>Start monthly <ArrowRight size={15} /></>}
              </button>}
        <p className="hp-plan-note">Cancel anytime — keep access until the paid month ends.</p>
      </section>
    </div>

    {(notice || auth.error) && <p className="hp-pricing-notice" role="alert">{notice || auth.error}</p>}
    <p className="hp-pricing-fineprint">
      Checkout and payments are handled by{" "}
      <a href="https://www.paddle.com" target="_blank" rel="noopener noreferrer">Paddle</a>
      {" "}&mdash; Merchant of Record. Prices in USD.{" "}
      <a href="/terms">Terms</a> &middot; <a href="/refund-policy">Refund Policy</a> &middot; <a href="/privacy-policy">Privacy</a>
    </p>
  </section>;
}
