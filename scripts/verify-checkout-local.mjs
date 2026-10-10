// Real-browser verification of the authenticated checkout flow against a REAL
// server (no route mocks): real JWT sessions, real /api/billing/checkout, real
// paddle.js from the Paddle CDN, real sandbox overlay. Only the Google identity
// step is replaced by the server's dev-only test-login, because production
// issues sessions exclusively through real Google sign-ins.
//
// Verifies, per plan:
//  - session restoration,  - plan carried via ?checkout= / ps_billing_intent,
//  - no Workspace (/characters) redirect before checkout,
//  - exactly one POST /api/billing/checkout with the selected plan,
//  - Paddle sandbox overlay opens (or the specific setup error is surfaced),
//  - reload does not create a second transaction (resume-once).
import { chromium } from 'playwright';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PATHUnderTest = process.env.CHECKOUT_PATH === 'root' ? '' : (process.env.CHECKOUT_PATH || '/pricing');
const serverDir = path.join(root, 'server');
const distDir = path.join(root, 'dist');
const PORT = 3910;
const base = `http://127.0.0.1:${PORT}`;

process.loadEnvFile(path.join(serverDir, '.env'));
const dbUrl = new URL(process.env.DATABASE_URL);
dbUrl.searchParams.set('schema', `checkoutverify_${Date.now()}`);
const env = {
  ...process.env,
  DATABASE_URL: dbUrl.href,
  JWT_SECRET: 'checkout-verify-only-signing-secret-which-is-long',
  ALLOW_TEST_LOGIN: 'true',
  NODE_ENV: 'test',
  PORT: String(PORT),
  ALLOWED_ORIGINS: base,
  STATIC_DIR: distDir,
};

let server, browser, page;
const events = { checkoutCalls: [], checkoutStatuses: [], workspaceNavigation: false, sandboxFrames: [], alerts: [] };
const report = { plans: [], fatal: null };
try {
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { cwd: serverDir, env, stdio: 'pipe' });
  server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/index.ts'], { cwd: serverDir, env, stdio: 'pipe' });
  server.stderr.on('data', d => process.stderr.write(`[server] ${d}`));
  const deadline = Date.now() + 30000;
  while (true) {
    try { await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) }); break; }
    catch { if (Date.now() > deadline) throw new Error('local server did not start'); await new Promise(r => setTimeout(r, 500)); }
  }

  const login = await fetch(`${base}/api/auth/test-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'checkout-verify@example.test' }),
    signal: AbortSignal.timeout(10000),
  }).then(r => r.json());
  if (!login.accessToken) throw new Error('test-login failed');

  browser = await chromium.launch({ executablePath: chromium.executablePath() });
  const context = await browser.newContext();
  page = await context.newPage();
  await page.addInitScript(tokens => localStorage.setItem('ps_auth_tokens', JSON.stringify(tokens)), login);

  page.on('request', r => { if (new URL(r.url()).pathname === '/api/billing/checkout' && r.method() === 'POST') events.checkoutCalls.push(r.postDataJSON()?.plan); });
  page.on('response', r => { if (new URL(r.url()).pathname === '/api/billing/checkout') events.checkoutStatuses.push(r.status()); });
  page.on('framenavigated', f => {
    const url = new URL(f.url() || 'about:blank');
    if (f === page.mainFrame() && url.pathname === '/characters') events.workspaceNavigation = true;
    if (url.hostname.endsWith('.paddle.com') && url.hostname.includes('checkout')) events.sandboxFrames.push(url.hostname);
  });
  page.on('console', m => { if (m.type() === 'error') events.alerts.push(m.text().slice(0, 200)); });

  for (const plan of ['lifetime', 'monthly']) {
    const before = events.checkoutCalls.length;
    await page.goto(`${base}${PATHUnderTest}${PATHUnderTest.includes('?') ? '&' : '?'}checkout=${plan}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const stop = await waitFor(plan, before, 45000);
    const calls = events.checkoutCalls.slice(before).filter(p => p === plan);
    const intentCleared = await page.evaluate(() => sessionStorage.getItem('ps_billing_intent') === null);
    const result = {
      plan,
      checkoutCalls: calls.length,
      checkoutStatuses: events.checkoutStatuses.slice(before),
      workspaceRedirect: events.workspaceNavigation,
      intentConsumed: new URL(page.url()).searchParams.get('pricing') === '1' && intentCleared,
      sandboxOverlayOpened: events.sandboxFrames.length > (plan === 'lifetime' ? 0 : report.plans[0]?.sandboxOverlayOpened ? 1 : 0),
      stop,
    };
    // Pass = the happy path (one checkout call + overlay) OR the useful-error
    // path (server not Paddle-configured here: specific message, no retry loop).
    const happyPath = result.checkoutCalls === 1 && calls[0] === plan && result.sandboxOverlayOpened;
    const errorPath = result.checkoutCalls === 0 && /Checkout setup incomplete/.test(stop ?? '');
    result.passed = !result.workspaceRedirect && result.intentConsumed && (happyPath || errorPath);
    report.plans.push(result);
    console.log(JSON.stringify(result));
    if (!result.passed) break;

    // Resume-once: a fresh load with no intent must not repeat anything.
    const at = events.checkoutCalls.length;
    await page.goto(`${base}/pricing`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    const noRepeat = events.checkoutCalls.length === at
      && (await page.evaluate(() => sessionStorage.getItem('ps_billing_intent') === null));
    if (!noRepeat) { result.passed = false; result.stop = 'intent repeated on fresh load'; break; }
  }
} catch (error) {
  report.fatal = String(error).slice(0, 500);
  console.log(JSON.stringify(report));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) { server.kill(); }
  try {
    const { PrismaClient } = await import(path.join(serverDir, 'node_modules/@prisma/client/index.js'));
    const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${dbUrl.searchParams.get('schema')}" CASCADE`);
    await prisma.$disconnect();
  } catch { /* cleanup best-effort */ }
  fs.mkdirSync(path.join(root, 'performance'), { recursive: true });
  fs.writeFileSync(path.join(root, 'performance/local-checkout-verification.json'), JSON.stringify(report, null, 2));
}

async function waitFor(plan, baseline, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const status = events.checkoutStatuses[baseline];
    if (events.checkoutCalls.slice(baseline).some(p => p === plan) && (status === 503 || events.sandboxFrames.length)) return null;
    await page.waitForTimeout(500);
  }
  const visibleAlerts = await page.getByRole('alert').allTextContents().catch(() => []);
  const body = await page.locator('body').innerText().catch(() => '');
  return `timed out | url=${page.url()} | alerts=${JSON.stringify(visibleAlerts)} | body=${body.replace(/\s+/g, ' ').slice(0, 300)}`;
}
