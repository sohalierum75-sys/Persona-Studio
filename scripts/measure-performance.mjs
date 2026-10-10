import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { preview } from 'vite';
import { chromium } from 'playwright';

const label = process.argv[2] ?? 'baseline';
const remote = process.env.PERF_ORIGIN;
const server = remote ? null : await preview({ preview: { host: '127.0.0.1', port: 0 } });
const origin = remote ?? `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? chromium.executablePath() });
const runs = [];
try {
  for (let i = 0; i < 5; i++) {
    const context = await browser.newContext({ viewport: { width: 1365, height: 768 } });
    const page = await context.newPage();
    if (!remote) await page.route('**/api/billing/config', route => route.fulfill({ json: { configured: false, lifetime: { limit: 50, claimed: null, remaining: null } } }));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 80, downloadThroughput: 200000, uploadThroughput: 100000 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.addInitScript(() => {
      window.perfLcp = 0;
      new PerformanceObserver(list => { window.perfLcp = list.getEntries().at(-1).startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    await page.goto(origin, { waitUntil: 'networkidle', timeout: 90000 });
    await page.locator('h1').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    runs.push(await page.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0];
      return { ttfbMs: n.responseStart, domContentLoadedMs: n.domContentLoadedEventEnd, loadMs: n.loadEventEnd,
        fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime, lcpMs: window.perfLcp,
        resources: performance.getEntriesByType('resource').map(r => ({ path: new URL(r.name).pathname, bytes: r.decodedBodySize, transferBytes: r.transferSize })) };
    }));
    await context.close();
  }
  const files = remote ? [] : fs.readdirSync('dist', { recursive: true }).filter(f => /\.(js|css|png|svg|woff2)$/.test(f)).map(f => {
    const buffer = fs.readFileSync(path.join('dist', f));
    return { path: f, bytes: buffer.length, gzipBytes: gzipSync(buffer).length };
  });
  const apis = {};
  if (remote) for (const endpoint of ['/api/health', '/api/billing/config', '/api/sync', '/api/billing/entitlements']) {
    apis[endpoint] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const response = await fetch(origin + endpoint, { signal: AbortSignal.timeout(15000) });
      const body = await response.arrayBuffer();
      apis[endpoint].push({ ms: performance.now() - start, status: response.status, bytes: body.byteLength, cacheControl: response.headers.get('cache-control'), encoding: response.headers.get('content-encoding') });
    }
  }
  fs.mkdirSync('performance', { recursive: true });
  fs.writeFileSync(`performance/${label}.json`, JSON.stringify({ origin, measuredAt: new Date().toISOString(), conditions: '5 cold contexts, 80ms latency, 1.6Mbps down, 4x CPU slowdown; local billing response mocked', runs, files, apis }, null, 2));
  console.log(JSON.stringify({ label, runs: runs.map(({resources, ...r}) => ({...r, jsBytes: resources.filter(x => x.path.endsWith('.js')).reduce((n,r) => n+r.bytes,0), fontBytes: resources.filter(x => x.path.endsWith('.woff2')).reduce((n,r) => n+r.bytes,0) })) }, null, 2));
} finally { await browser.close(); await new Promise(resolve => server ? server.httpServer.close(resolve) : resolve()); }
