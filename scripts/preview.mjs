import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const origin=process.env.TEST_BASE_URL||'http://127.0.0.1:3001';
await fs.mkdir('docs/screenshots', { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(origin+'/', { waitUntil: 'networkidle' });
await page.screenshot({ path: 'docs/screenshots/home.png', fullPage: true });
await page.goto(origin+'/demo');
await page.getByRole('button', { name: 'Enter my workspace' }).click();
await page.getByRole('heading', { name: 'Welcome back, Alex.' }).waitFor({ timeout: 60000 });
await page.waitForTimeout(1800);
await page.screenshot({
  path: 'docs/screenshots/overview.png',
  fullPage: true,
});
console.log('Preview ready:', page.url());
await browser.close();
