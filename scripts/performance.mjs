import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const origin = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001';
const browser = await chromium.launch({ headless: true });
const report = {
  measuredAt: new Date().toISOString(),
  conditions:
    'Local production build; Chromium headless; server warm; browser cache disabled; no network throttling; desktop CPU native, mobile CPU throttled 4x. These are navigation/paint timings, not Lighthouse scores.',
  samples: [],
};
for (const profile of [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, cpu: 1 },
  { name: 'mobile', viewport: { width: 390, height: 844 }, cpu: 4 },
]) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    isMobile: profile.name === 'mobile',
    hasTouch: profile.name === 'mobile',
  });
  await context.request.post(origin + '/api/demo', {
    headers: { origin },
    data: { action: 'enter', persona: 'admin' },
  });
  for (const route of ['/', '/app/willow/overview', '/app/willow/cases']) {
    for (let run = 1; run <= 3; run++) {
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
      await page.addInitScript(() => {
        window.__metrics = { lcp: 0, cls: 0 };
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          window.__metrics.lcp = entries[entries.length - 1]?.startTime ?? 0;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            if (!entry.hadRecentInput) window.__metrics.cls += entry.value;
        }).observe({ type: 'layout-shift', buffered: true });
      });
      const start = performance.now();
      const response = await page.goto(origin + route, { waitUntil: 'networkidle' });
      await page.locator(route === '/' ? 'h1' : '.page-content h1').waitFor();
      if (route.endsWith('/cases'))
        await page
          .locator(profile.name === 'mobile' ? '.mobile-case' : '.cases-table tbody tr')
          .first()
          .waitFor();
      await page.waitForTimeout(150);
      const metrics = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        return {
          ttfbMs: nav.responseStart,
          lcpMs: window.__metrics.lcp,
          cls: window.__metrics.cls,
          domContentLoadedMs: nav.domContentLoadedEventEnd,
          loadMs: nav.loadEventEnd,
          resources: performance.getEntriesByType('resource').length,
        };
      });
      report.samples.push({
        profile: profile.name,
        viewport: profile.viewport,
        route,
        run,
        status: response.status(),
        ...metrics,
        readyMs: Math.round(performance.now() - start),
      });
      await page.close();
    }
  }
  await context.close();
}
await fs.writeFile('docs/performance-results.json', JSON.stringify(report, null, 2));
await browser.close();
console.log('Saved production navigation and paint timings to docs/performance-results.json.');
