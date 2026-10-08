/**
 * RefundPolicyPage — Persona Studio Refund Policy.
 *
 * Covers the 14-day refund window, renewal exclusions, how to request a
 * refund, and Paddle's role. Review with a qualified attorney before launch.
 */

import LegalPage from "./LegalPage";

const LAST_UPDATED = "8 October 2026";
const CONTACT_EMAIL = "support@personastudio.site";

export default function RefundPolicyPage() {
  return (
    <LegalPage title="Refund Policy" lastUpdated={LAST_UPDATED}>

      <div className="lp-info-box">
        <p>
          We want you to be happy with Persona Studio. If you are not satisfied, here is how
          refunds work.
        </p>
      </div>

      <h2>1. 14-day refund window (initial purchase)</h2>
      <p>
        If you are not satisfied with your purchase, you may request a full refund within{" "}
        <strong>14 days of the initial transaction date</strong>. This applies to both the{" "}
        <strong>Lifetime plan ($39 one-time)</strong> and the first payment of a{" "}
        <strong>Monthly plan ($9)</strong>.
      </p>
      <p>
        Refunds are issued to the original payment method. Processing time depends on your bank or
        card provider (typically 5–10 business days after approval).
      </p>

      <h2>2. Monthly subscription renewals</h2>
      <p>
        Subscription renewal charges (i.e. every payment after the first) are{" "}
        <strong>non-refundable</strong>. If you do not wish to be charged for the next month,{" "}
        <strong>cancel before your renewal date</strong>. You will retain full access until the end
        of the paid billing period.
      </p>

      <h2>3. How to request a refund</h2>
      <p>
        Email us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with:
      </p>
      <ul>
        <li>The email address associated with your Persona Studio account.</li>
        <li>The approximate date of purchase.</li>
        <li>A brief description of the issue (optional, but helpful).</li>
      </ul>
      <p>
        We will respond within 2 business days and, if eligible, process the refund through Paddle.
      </p>

      <h2>4. Paddle as Merchant of Record</h2>
      <p>
        Payments are processed by <strong>Paddle</strong>, which acts as the Merchant of Record
        for all Persona Studio transactions. Refunds are issued via Paddle's systems. If you have
        a dispute about a charge that you cannot resolve with us directly, you may also contact
        Paddle support at{" "}
        <a href="https://www.paddle.com/legal/buyer-faq" target="_blank" rel="noopener noreferrer">
          paddle.com/legal/buyer-faq
        </a>.
      </p>

      <h2>5. Your statutory rights</h2>
      <p>
        Nothing in this Refund Policy limits any right to a refund or cancellation you may have
        under applicable law in your country of residence, including any consumer protection
        legislation.
      </p>

      <h2>6. Contact</h2>
      <p>
        Refund questions? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We aim to
        respond within 2 business days.
      </p>

    </LegalPage>
  );
}
