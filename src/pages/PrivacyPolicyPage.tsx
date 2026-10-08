/**
 * PrivacyPolicyPage — Persona Studio Privacy Policy.
 *
 * Describes what data is collected, how it is used, and the third-party
 * services involved. Does not contain legal guarantees beyond what is
 * described here; review with a qualified attorney before launch.
 */

import LegalPage from "./LegalPage";

const LAST_UPDATED = "8 October 2026";
const CONTACT_EMAIL = "support@personastudio.site";

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated={LAST_UPDATED}>

      <div className="lp-info-box">
        <p>
          This policy applies to the Persona Studio web application, the Persona Studio Chrome
          extension, and any related services operated under the name <strong>Persona Studio</strong>.
          By using any of these services you agree to the practices described here.
        </p>
      </div>

      <h2>1. Who we are</h2>
      <p>
        Persona Studio is an independent product operated by <strong>Persona Studio</strong> (no
        registered legal entity at this time). You can contact us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>2. What data we collect</h2>
      <p>We collect only the data needed to operate the service:</p>
      <ul>
        <li>
          <strong>Account information</strong> — your Google account ID, display name, and email
          address, provided when you sign in with Google.
        </li>
        <li>
          <strong>Studio content</strong> — characters, outfits, locations, episodes, scenes, and
          prompts you create and save inside Persona Studio.
        </li>
        <li>
          <strong>Usage data</strong> — basic server-side logs (timestamps, HTTP status codes) to
          monitor service health. We do not run session-level analytics or ad tracking.
        </li>
        <li>
          <strong>Payment data</strong> — if you purchase a plan, payment is processed entirely by{" "}
          <strong>Paddle</strong>. We receive a record of which plan was purchased and when, but we
          never see or store your card number, bank details, or full billing address.
        </li>
      </ul>

      <h2>3. How we use your data</h2>
      <ul>
        <li>To create and maintain your account and keep your Studio content in sync.</li>
        <li>To enforce plan limits (characters, episodes, saved prompts).</li>
        <li>To process your purchase and grant paid access via Paddle webhooks.</li>
        <li>To respond to support requests sent to our contact email.</li>
        <li>To monitor service uptime and debug errors.</li>
      </ul>
      <p>We do not sell your data, use it for advertising, or share it with third parties
         other than the processors listed in Section 4.</p>

      <h2>4. Third-party processors</h2>
      <p>The following third-party services process data on our behalf:</p>
      <ul>
        <li>
          <strong>Google OAuth</strong> — authenticates your sign-in. Google's{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>{" "}
          applies to that flow.
        </li>
        <li>
          <strong>Supabase</strong> — stores your account record and Studio content in a hosted
          PostgreSQL database. Data is stored in the region configured at the time of deployment.
        </li>
        <li>
          <strong>Paddle</strong> — handles payment processing, invoicing, and tax compliance for
          Lifetime and Monthly plan purchases.{" "}
          <a href="https://www.paddle.com/legal/privacy" target="_blank" rel="noopener noreferrer">
            Paddle's Privacy Policy
          </a>{" "}
          governs the data they collect during checkout. Paddle acts as the Merchant of Record for
          your purchase.
        </li>
      </ul>

      <h2>5. Chrome extension</h2>
      <p>
        The Persona Studio Chrome extension connects to the same account as the web Studio when you
        sign in with the same Google account. It does not read or modify any other browser tabs,
        browser history, or clipboard content other than the prompt you explicitly copy using the
        "Copy Prompt" button.
      </p>

      <h2>6. Data retention</h2>
      <p>
        Your account and Studio content are retained for as long as your account is active.
        If you request deletion (see Section 7), we will remove your data within 30 days, except
        where retention is required by law (e.g., financial records related to a purchase).
      </p>

      <h2>7. Your rights</h2>
      <p>
        You can request access to, correction of, or deletion of your personal data at any time by
        emailing <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We will respond within 30
        days.
      </p>

      <h2>8. Cookies and local storage</h2>
      <p>
        Persona Studio uses browser local storage and IndexedDB to cache your Studio data and
        authentication session on your device. We do not use third-party tracking cookies.
      </p>

      <h2>9. Children</h2>
      <p>
        Persona Studio is not directed at children under 13. We do not knowingly collect personal
        information from anyone under 13.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        We may update this policy from time to time. The "Last updated" date at the top of this page
        will reflect any changes. Continued use of Persona Studio after an update constitutes
        acceptance of the revised policy.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about this Privacy Policy?{" "}
        Email us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

    </LegalPage>
  );
}
