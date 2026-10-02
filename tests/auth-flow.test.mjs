import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

let vite, browser, origin;
before(async () => {
  vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  await vite.listen();
  origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const installed = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright/chromium-1217/chrome-win64/chrome.exe');
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (fs.existsSync(installed) ? installed : undefined) });
});
after(async () => { await browser?.close(); await vite?.close(); });

// Exercise the real frontend with controlled API responses; never print credentials.
const user = { id: 'auth-regression', name: 'Auth Test', email: 'auth@example.test', avatarUrl: null };
const session = () => ({ user, accessToken: 'test-access', refreshToken: 'test-refresh', expiresAt: Date.now() + 3600000 });
async function pageFor(t, tokenStatus = 200) {
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  const calls = { exchange: 0, authenticated: 0, refresh: 0, challenge: null };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/billing/config') {
      return route.fulfill({ json: { configured: false, lifetime: { limit: 50, claimed: null, remaining: null } } });
    }
    if (pathname === '/api/auth/token') {
      calls.exchange++;
      const verifier = request.postDataJSON().verifier;
      const validVerifier = calls.challenge
        ? typeof verifier === 'string' && createHash('sha256').update(verifier).digest('base64url') === calls.challenge
        : verifier === 'v'.repeat(43);
      assert.ok(validVerifier, 'exchange must send the original PKCE verifier');
      await page.getByText('Loading Persona Studio…', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Continue with Google' }).count(), 0);
      await new Promise(resolve => setTimeout(resolve, 200));
      return route.fulfill({ status: tokenStatus, json: tokenStatus === 200 ? session() : { error: 'Invalid or expired code. Please sign in again.' } });
    }
    if (pathname === '/api/auth/refresh') {
      calls.refresh++;
      assert.ok(request.postDataJSON().refreshToken === 'test-refresh', 'refresh must use persisted credentials');
      return route.fulfill({ json: session() });
    }
    assert.ok(request.headers().authorization === 'Bearer test-access', 'authenticated request must send saved access token');
    calls.authenticated++;
    if (pathname === '/api/billing/entitlements') {
      return route.fulfill({ json: { plan: 'free', lifetime: { active: false, since: null }, subscription: null, limits: { characters: 1, episodes: 1, prompts: 10, bulkScenes: 3 }, usage: { characters: 0, episodes: 0, prompts: 0 } } });
    }
    return route.fulfill({ json: pathname === '/api/auth/me' ? { user } : { records: [] } });
  });
  return { page, calls };
}

test('Google callback saves tokens, enters existing Studio and survives refresh', async t => {
  const { page, calls } = await pageFor(t);
  await page.goto(origin + '/characters');
  await page.getByRole('button', { name: 'Continue with Google' }).waitFor();
  // Capture the actual outgoing login URL without visiting Google.
  let redirect;
  await page.route('**/api/auth/google/start?**', route => {
    const start = new URL(route.request().url());
    redirect = start.searchParams.get('redirect');
    calls.challenge = start.searchParams.get('challenge');
    return route.fulfill({ contentType: 'text/html', body: 'Provider redirect' });
  });
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await page.waitForURL('**/api/auth/google/start?**');
  assert.equal(redirect, origin + '/characters');
  // Return in the same tab: the original verifier must survive the round trip.
  await page.goto(origin + '/characters?code=test-code');
  await page.getByRole('button', { name: 'New Character', exact: true }).first().waitFor();
  assert.equal(new URL(page.url()).pathname, '/characters');
  assert.equal(new URL(page.url()).search, '');
  assert.equal(calls.exchange, 1);
  assert.ok(calls.authenticated > 0);
  assert.ok(await page.evaluate(() => !!localStorage.getItem('ps_auth_tokens') && !sessionStorage.getItem('ps_pkce')));
  // Signed-in visit to the marketing root bounces to the Studio.
  await page.goto(origin);
  await page.getByRole('button', { name: 'New Character', exact: true }).first().waitFor();
  assert.equal(new URL(page.url()).pathname, '/characters');
  const beforeReload = calls.authenticated;
  await page.reload();
  await page.getByRole('button', { name: 'New Character', exact: true }).first().waitFor();
  assert.ok(calls.authenticated > beforeReload);
  assert.equal(calls.exchange, 1);
  // Expired access tokens also restore via the existing refresh flow.
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('ps_auth_tokens'));
    saved.expiresAt = 0;
    localStorage.setItem('ps_auth_tokens', JSON.stringify(saved));
  });
  await page.reload();
  await page.getByRole('button', { name: 'New Character', exact: true }).first().waitFor();
  assert.equal(calls.refresh, 1);
  await page.goto(origin + '/?pricing=1#pricing');
  await page.getByRole('button', { name: 'Use Free plan — no purchase required' }).click();
  await page.getByRole('button', { name: 'New Character', exact: true }).first().waitFor();
});

test('callback failure is visible instead of silently returning to marketing', async t => {
  const { page } = await pageFor(t);
  await page.goto(origin + '/?auth_error=oauth_failed');
  await page.getByRole('button', { name: 'Continue with Google' }).waitFor({ timeout: 5000 });
  assert.match(await page.getByRole('alert').innerText(), /Sign-in failed/);
});

test('failed code exchange remains visible when opening Studio', async t => {
  const { page } = await pageFor(t, 401);
  await page.goto(origin);
  await page.evaluate(() => sessionStorage.setItem('ps_pkce', 'v'.repeat(43)));
  await page.goto(origin + '/?code=expired-code');
  await page.getByText('Invalid or expired code. Please sign in again.', { exact: true }).waitFor({ timeout: 5000 });
  await page.evaluate(() => { history.pushState({}, '', '/characters'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByRole('button', { name: 'Continue with Google' }).waitFor();
  assert.match(await page.locator('body').innerText(), /Invalid or expired code/);
});

test('a cancelled callback is not hidden by a previously saved account', async t => {
  const { page, calls } = await pageFor(t);
  await page.goto(origin);
  await page.evaluate(saved => localStorage.setItem('ps_auth_tokens', JSON.stringify(saved)), session());
  await page.goto(origin + '/?auth_error=cancelled');
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), /Sign-in was cancelled/);
  assert.equal(calls.authenticated, 0);
});
