import fs from 'node:fs';
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: chromium.executablePath() });
const results = [];
try {
  for (const plan of ['lifetime', 'monthly']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const trace = { plan, requests: [], errors: [], assets: [] };
    page.on('console', msg => { if (msg.type() === 'error') trace.errors.push(msg.text().replace(/([?&](?:code|state|challenge)=)[^&\s]+/g, '$1[redacted]')); });
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname === '/api/auth/google/start') trace.oauthStart = { redirect: url.searchParams.get('redirect'), pkce: !!url.searchParams.get('challenge') };
    });
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/api/')) trace.requests.push({ path: url.pathname, status: response.status() });
      if (url.pathname.startsWith('/assets/') && url.pathname.endsWith('.js')) trace.assets.push(url.pathname);
    });
    try {
      const response = await page.goto('https://personastudio.site/pricing', { waitUntil: 'domcontentloaded', timeout: 45000 });
      trace.headers = { modified: response.headers()['last-modified'], csp: response.headers()['content-security-policy'] };
      await page.locator(`#pricing-${plan}-cta`).waitFor({ timeout: 45000 });
      trace.planVisible = true;
      await page.locator(`#pricing-${plan}-cta`).click();
      await page.waitForTimeout(12000);
      trace.finalPage = new URL(page.url()).origin + new URL(page.url()).pathname;
      trace.alerts = await page.getByRole('alert').allTextContents();
      trace.pendingPlan = await page.evaluate(() => sessionStorage.getItem('ps_billing_intent')).catch(() => null);
      trace.bodyExcerpt = (await page.locator('body').innerText()).slice(0, 800);
    } catch (error) { trace.failure = String(error).slice(0, 600); }
    results.push(trace);
    await context.close();
  }
  fs.mkdirSync('performance', { recursive: true });
  fs.writeFileSync('performance/production-checkout-trace.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
