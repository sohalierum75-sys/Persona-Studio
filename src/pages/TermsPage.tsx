/**
 * TermsPage — Persona Studio Terms & Conditions.
 *
 * Covers product description, plan pricing, billing types, cancellation,
 * acceptable use, and governing law. Review with a qualified attorney
 * before going live.
 */

import LegalPage from "./LegalPage";

const LAST_UPDATED = "8 October 2026";
const CONTACT_EMAIL = "support@personastudio.site";

export default function TermsPage() {
  return (
    <LegalPage title="Terms & Conditions" lastUpdated={LAST_UPDATED}>

      <div className="lp-info-box">
        <p>
          Please read these Terms carefully before using Persona Studio. By creating an account or
          making a purchase you agree to be bound by these Terms.
        </p>
      </div>

      <h2>1. About Persona Studio</h2>
      <p>
        Persona Studio is a web-based creative workspace that helps you organise characters,
        wardrobes, locations, and scene descriptions, and format prompts for external image and video
        generation tools. Persona Studio <strong>does not generate images or videos itself</strong> —
        prompts must be copied into a third-party generation tool of your choice.
      </p>
      <p>
        The service is operated by <strong>Persona Studio</strong> (an independent product with no
        registered legal entity at this time), reachable at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>2. Eligibility</h2>
      <p>
        You must be at least 13 years old to use Persona Studio. By agreeing to these Terms you
        represent that you meet this requirement.
      </p>

      <h2>3. Plans and pricing</h2>

      <p><strong>Free plan</strong> — available immediately on sign-in, no purchase required.</p>
      <ul>
        <li>1 character, 1 episode, 10 saved prompts.</li>
        <li>Up to 3 scenes per bulk import.</li>
        <li>Access to the Chrome extension for free-tier content.</li>
      </ul>

      <p><strong>Lifetime plan — $39 one-time (introductory price, regular price $49)</strong></p>
      <ul>
        <li>Limited to the first 50 customers. Once the limit is reached, this plan is no longer available and the regular monthly plan applies.</li>
        <li>Unlimited access to all current Studio features: characters, wardrobe, locations, episodes, scenes, bulk scene builder, continuity checks, prompt formatting (17+ engines), Chrome extension sync.</li>
        <li>This is a <strong>single, one-time payment</strong>. There is no recurring charge, ever.</li>
        <li>Access covers features available at the time of purchase. Future major features may be offered separately.</li>
      </ul>

      <p><strong>Monthly plan — $9/month (recurring)</strong></p>
      <ul>
        <li>The same full Studio feature set as the Lifetime plan.</li>
        <li>Charged once per calendar month via Paddle. Your subscription renews automatically on the same day each month.</li>
        <li>You may cancel at any time (see Section 5). Access continues until the end of the paid billing period.</li>
      </ul>

      <p>
        Prices are shown in USD. Paddle, as Merchant of Record, may display your local equivalent
        and collect applicable taxes at checkout.
      </p>

      <h2>4. Billing and payment</h2>
      <p>
        All payments are processed by <strong>Paddle</strong>, which acts as the Merchant of Record
        for your purchase. By purchasing a plan you agree to Paddle's{" "}
        <a href="https://www.paddle.com/legal/terms-of-use" target="_blank" rel="noopener noreferrer">
          Terms of Use
        </a>{" "}
        and{" "}
        <a href="https://www.paddle.com/legal/privacy" target="_blank" rel="noopener noreferrer">
          Privacy Policy
        </a>.
      </p>
      <p>
        For the Monthly plan, your payment method will be charged automatically each month until you
        cancel. Persona Studio does not store or have access to your card details.
      </p>

      <h2>5. Cancellation (Monthly plan)</h2>
      <p>
        You may cancel your Monthly subscription at any time. Cancellation stops future renewals.
        You retain full access until the end of the current paid billing period. We do not charge a
        cancellation fee.
      </p>
      <p>
        To cancel, use the billing portal link in your account settings or contact us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will cancel on your behalf
        within one business day.
      </p>

      <h2>6. Refunds</h2>
      <p>
        Please refer to our{" "}
        <a href="/refund-policy">Refund Policy</a> for full details.
        In summary: refunds are available within 14 days of the initial purchase for both plans.
        Monthly subscription renewals are non-refundable. Nothing in these Terms limits any refund
        or cancellation rights you may have under applicable law.
      </p>

      <h2>7. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Attempt to access another user's account or data.</li>
        <li>Reverse-engineer, decompile, or scrape the service or its API.</li>
        <li>Use the service to generate, store, or distribute illegal, harmful, or infringing content.</li>
        <li>Circumvent plan limits or otherwise abuse the free tier.</li>
      </ul>
      <p>We reserve the right to suspend or terminate accounts that violate these rules.</p>

      <h2>8. Your content</h2>
      <p>
        You retain ownership of all characters, scene descriptions, and other content you create in
        Persona Studio. You grant us a limited licence to store and display your content solely for
        the purpose of providing the service to you. We will not share your content with third
        parties except as described in the Privacy Policy.
      </p>

      <h2>9. Intellectual property</h2>
      <p>
        Persona Studio, its logo, design, and code are the intellectual property of Persona Studio.
        Nothing in these Terms grants you a right to use our branding or intellectual property
        outside the service.
      </p>

      <h2>10. Disclaimers</h2>
      <p>
        The service is provided "as is" without warranties of any kind, express or implied. We do
        not guarantee that the service will be available at all times, error-free, or that prompts
        generated will produce any particular result in a third-party tool.
      </p>

      <h2>11. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by applicable law, Persona Studio shall not be liable for
        any indirect, incidental, special, consequential, or punitive damages arising out of your
        use of the service. Our total liability to you for any claim arising from these Terms or
        your use of the service shall not exceed the amount you paid us in the 12 months prior to
        the claim.
      </p>

      <h2>12. Governing law</h2>
      <p>
        These Terms are governed by the laws of Sri Lanka, without regard to its conflict-of-law
        principles. Any disputes shall be resolved in the courts of Sri Lanka.
      </p>

      <h2>13. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. The "Last updated" date at the top of this page
        reflects any changes. Material changes will be communicated by email where reasonably
        practicable. Continued use after an update constitutes acceptance of the revised Terms.
      </p>

      <h2>14. Contact</h2>
      <p>
        Questions about these Terms? Email us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

    </LegalPage>
  );
}
