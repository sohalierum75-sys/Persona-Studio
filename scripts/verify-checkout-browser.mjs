// Interactive production verification: the user performs Google sign-in once;
// no mocks, no saved credentials, no payment, no token/profile data in the report.
//
// Plan 1 (lifetime) exercises the full OAuth return path: pricing CTA →
// /api/auth/google/start with ?checkout=lifetime → Google → callback back to
// /pricing → session exchange → automatic resume → POST /api/billing/checkout
// exactly once → Paddle Sandbox overlay opens.
//
// Plan 2 (monthly) reuses the same signed-in context and exercises the
// signed-in CTA path on production.
import { chromium } from 'playwright';
import fs from 'node:fs';

const SITE = 'https://personastudio.site';
const browser = await chromium.launch({ headless: false, executablePath: chromium.executablePath() });
const context = await browser.newContext();
const page = await context.newPage();

const events = { oauthStart: null, checkoutCalls: [], checkoutStatuses: [], exchangeResponses: [], workspaceBeforeCheckout: false, sandboxNavigations: [] };
page.on('request', request => {
  const url = new URL(request.url());
  if (url.pathname === '/api/auth/google/start') events.oauthStart = { redirect: url.searchParams.get('redirect'), pkce: !!url.searchParams.get('challenge') };
  if (url.pathname === '/api/billing/checkout' && request.method() === 'POST') events.checkoutCalls.push(request.postDataJSON()?.plan);
});
page.on('response', response => {
  const path = new URL(response.url()).pathname;
  if (path === '/api/auth/token') events.exchangeResponses.push(response.status());
  if (path === '/api/billing/checkout') events.checkoutStatuses.push(response.status());
});
page.on('framenavigated', frame => {
  const url = new URL(frame.url() || 'about:blank');
  if (frame === page.mainFrame() && url.origin === SITE && url.pathname === '/characters' && !events.checkoutCalls.length) events.workspaceBeforeCheckout = true;
  if (url.hostname.endsWith('.paddle.com') && url.hostname.includes('checkout')) events.sandboxNavigations.push(url.hostname);
});

async function waitForCheckout(plan, deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  const started = events.checkoutCalls.filter(p => p === plan).length;
  while (Date.now() < deadline && !page.isClosed()) {
    if (events.checkoutCalls.filter(p => p === plan).length > started && events.sandboxNavigations.length) return null;
    const alerts = await page.getByRole('alert').allTextContents().catch(() => []);
    const fatal = alerts.find(text => /checkout|PADDLE_|endpoint|sign-in failed/i.test(text));
    if (fatal) return fatal;
    await page.waitForTimeout(1000);
  }
  return page.isClosed() ? 'browser was closed' : 'timed out waiting for the Paddle Sandbox checkout';
}

const report = [];
try {
  await page.goto(`${SITE}/pricing`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('#pricing-lifetime-cta').waitFor({ timeout: 60000 });
  await page.locator('#pricing-lifetime-cta').click();
  console.log('LIFETIME: complete Google sign-in in the opened window. The Paddle Sandbox checkout must open by itself — do not pay.');

  const lifetimeStop = await waitForCheckout('lifetime', 300000);
  const lifetimeCalls = events.checkoutCalls.filter(p => p === 'lifetime').length;
  const lifetime = {
    oauthStart: events.oauthStart,
    sessionExchanged: events.exchangeResponses.includes(200),
    checkoutCalls: lifetimeCalls,
    checkoutStatuses: events.checkoutStatuses.slice(0, lifetimeCalls),
    workspaceBeforeCheckout: events.workspaceBeforeCheckout,
    sandboxOpened: events.sandboxNavigations.length > 0,
    location: page.isClosed() ? 'closed' : page.url().replace(/([?&](?:code|state|challenge)=)[^&]+/g, '$1[redacted]'),
    stop: lifetimeStop,
  };
  lifetime.passed = !lifetimeStop && lifetime.sessionExchanged && lifetime.checkoutCalls === 1
    && lifetime.checkoutStatuses[0] === 200 && lifetime.sandboxOpened && !lifetime.workspaceBeforeCheckout;
  report.push({ plan: 'lifetime', ...lifetime });
  console.log(JSON.stringify(report.at(-1)));

  if (lifetime.passed) {
    // Fresh load in the same signed-in context: exercise the signed-in CTA path.
    await page.goto(`${SITE}/pricing`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('#pricing-monthly-cta').waitFor({ timeout: 60000 });
    await page.locator('#pricing-monthly-cta').click();
    const monthlyStop = await waitForCheckout('monthly', 60000);
    const monthlyCalls = events.checkoutCalls.filter(p => p === 'monthly').length;
    const monthly = {
      checkoutCalls: monthlyCalls,
      checkoutStatuses: events.checkoutStatuses.slice(lifetimeCalls),
      workspaceBeforeCheckout: events.workspaceBeforeCheckout,
      sandboxOpened: events.sandboxNavigations.length > 1,
      location: page.isClosed() ? 'closed' : page.url().replace(/([?&](?:code|state|challenge)=)[^&]+/g, '$1[redacted]'),
      stop: monthlyStop,
    };
    monthly.passed = !monthlyStop && monthly.checkoutCalls === 1 && monthly.checkoutStatuses[0] === 200
      && monthly.sandboxOpened && !monthly.workspaceBeforeCheckout;
    report.push({ plan: 'monthly', ...monthly });
    console.log(JSON.stringify(report.at(-1)));
  }
} catch (error) {
  report.push({ fatal: String(error).slice(0, 500) });
  console.log(JSON.stringify(report.at(-1)));
} finally {
  if (!page.isClosed()) await context.close().catch(() => {});
  await browser.close().catch(() => {});
  fs.mkdirSync('performance', { recursive: true });
  fs.writeFileSync('performance/production-authenticated-checkout.json', JSON.stringify(report, null, 2));
}
