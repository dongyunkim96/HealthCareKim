import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
const origin = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001';
async function enter(page: Page, persona = 'admin') {
  const response = await page.request.post(origin + '/api/demo', {
    headers: { origin },
    data: { action: 'enter', persona },
  });
  expect(response.ok()).toBe(true);
}
async function query(page: Page, method: string, input: unknown) {
  const r = await page.request.get(
    `/api/trpc/${method}?input=${encodeURIComponent(JSON.stringify(input))}`,
  );
  const body = await r.json();
  return { response: r, data: body.result?.data, error: body.error };
}
async function mutate(page: Page, method: string, input: unknown) {
  const r = await page.request.post(`/api/trpc/${method}`, { headers: { origin }, data: input });
  return { response: r, body: await r.json() };
}
async function screenshot(page: Page, name: string) {
  await fs.mkdir('docs/screenshots', { recursive: true });
  await page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: true });
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
}
test('demo entry → filter → assign → status → audit → refresh → clinic isolation', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Enter my workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back, Alex.' })).toBeVisible();
  await page.getByRole('link', { name: 'Cases', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cases', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const filters = page.getByRole('dialog');
  await filters.getByLabel('Status', { exact: true }).selectOption('New');
  await filters.getByLabel('Assignee', { exact: true }).selectOption('unassigned');
  await filters.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(/status=New/);
  await expect(page).toHaveURL(/assignee=unassigned/);
  await page.getByRole('button', { name: 'Save current view' }).click();
  await page.getByLabel('View name').fill('Intake triage');
  await page.getByRole('button', { name: 'Save view', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await screenshot(page, 'cases');
  const first = page.locator('.cases-table tbody .case-number').first(),
    href = await first.getAttribute('href');
  await first.click();
  await expect(page.getByRole('dialog', { name: 'Case workspace' })).toBeVisible();
  await page.getByRole('link', { name: 'Full page' }).click();
  await expect(page).toHaveURL(new RegExp(href!.split('/').pop()!));
  await page.getByLabel('Case assignee').selectOption({ label: 'Jamie Chen' });
  await page.getByLabel('Case status').selectOption('In review');
  await page
    .getByLabel('Internal note')
    .fill('Synthetic verification: intake assigned and ready for review.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('Changes saved');
  await page.getByRole('button', { name: /Activity history/ }).click();
  await expect(page.locator('.detail-events')).toContainText('assigned to Jamie Chen');
  await expect(page.locator('.detail-events')).toContainText('New → In review');
  await screenshot(page, 'case-detail');
  await page.reload();
  await expect(page.getByLabel('Case assignee')).toHaveValue(/.+/);
  await expect(page.getByLabel('Case status')).toHaveValue('In review');
  await expect(page.locator('.notes-list')).toContainText('Synthetic verification');
  const recordId = href!.split('/').pop()!;
  await page.getByLabel('Switch clinic').selectOption('harbor');
  await expect(page).toHaveURL(/harbor\/overview/);
  const denied = await query(page, 'detail', { slug: 'harbor', id: recordId });
  expect(denied.response.status()).toBe(404);
  await page.getByLabel('Switch clinic').selectOption('willow');
  await expect(page.getByRole('heading', { name: 'Welcome back, Alex.' })).toBeVisible();
  await page.goto('/app/willow/cases');
  await page.getByRole('button', { name: /Saved views/ }).click();
  await page.getByRole('menuitem', { name: 'Intake triage' }).click();
  await expect(page).toHaveURL(/status=New/);
  await page.reload();
  await expect(page).toHaveURL(/assignee=unassigned/);
  await noOverflow(page);
  expect(errors).toEqual([]);
});
test('URL sorting, pagination, back navigation, and selection clearing', async ({ page }) => {
  await enter(page);
  await page.goto('/app/willow/cases');
  await expect(page.locator('.cases-table tbody tr')).toHaveCount(15);
  await page.getByRole('checkbox', { name: 'Select all cases on this page' }).check();
  await expect(page.locator('.bulk-bar')).toContainText('15');
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator('.bulk-bar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Patient', exact: true }).click();
  await expect(page).toHaveURL(/sort=patient/);
  await expect(page).not.toHaveURL(/page=2/);
  await page.goBack();
  await expect(page).toHaveURL(/page=2/);
  await page.reload();
  await expect(page.locator('.pagination')).toContainText('Page 2 of 10');
  await page.getByRole('textbox', { name: 'Search cases' }).fill('HC-11000');
  await expect(page).toHaveURL(/q=HC-11000/);
  await expect(page.locator('.cases-table tbody tr')).toHaveCount(1);
});
test('direct API role enforcement and demo persona switching', async ({ page }) => {
  await enter(page, 'viewer');
  const cases = await query(page, 'cases', { slug: 'willow', filters: {} });
  const record = cases.data.rows[0];
  const denied = await mutate(page, 'editCase', {
    slug: 'willow',
    edit: { id: record.id, version: record.version, note: 'Forbidden write' },
  });
  expect(denied.response.status()).toBe(403);
  await page.goto(`/app/willow/cases/${record.id}`);
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await page.getByRole('button', { name: 'Account and demo persona menu' }).click();
  await page.getByRole('menuitem', { name: 'Explore as coordinator' }).click();
  await expect(page).toHaveURL(/overview/);
  await page.goto(`/app/willow/cases/${record.id}`);
  await expect(page.getByLabel('Internal note')).toBeEnabled();
  const foreignOrigin = await page.request.post(origin + '/api/demo', {
    headers: { origin: 'https://untrusted.example' },
    data: { action: 'enter' },
  });
  expect(foreignOrigin.status()).toBe(403);
});
test('appointments create, conflict recovery, reschedule and cancellation', async ({ page }) => {
  await enter(page);
  await page.goto('/app/willow/appointments');
  await page.getByRole('button', { name: 'New appointment' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Synthetic patient').selectOption({ index: 1 });
  await dialog.getByLabel('Date and local time').fill('2027-01-04T15:00');
  await dialog.getByLabel('Appointment title').fill('Verified synthetic appointment');
  await dialog.getByRole('button', { name: 'Save appointment' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.agenda-groups')).toContainText('Verified synthetic appointment');
  const appointment = page
    .locator('.agenda-row')
    .filter({ hasText: 'Verified synthetic appointment' });
  await appointment.getByRole('button', { name: 'Reschedule' }).click();
  await page.getByLabel('Date and local time').fill('2027-01-04T16:00');
  await page.getByRole('button', { name: 'Save appointment' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(appointment).toContainText('4:00 PM');
  await appointment.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm cancellation' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Show cancelled').check();
  await expect(page.locator('.cancelled-row')).toContainText('Verified synthetic appointment');
});
for (const viewport of [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
]) {
  test(`responsive navigation, filters, detail and schedule at ${viewport.width}×${viewport.height}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.width < 1100,
      isMobile: viewport.width < 768,
    });
    const page = await context.newPage();
    await page.goto(origin + '/demo');
    await expect(page.getByRole('heading', { name: 'Step into a clearer day.' })).toBeVisible();
    await noOverflow(page);
    await enter(page);
    await page.goto(origin + '/app/willow/overview');
    await expect(page.getByRole('heading', { name: 'Welcome back, Alex.' })).toBeVisible();
    await page.waitForTimeout(450);
    await noOverflow(page);
    await screenshot(page, `overview-${viewport.width}`);
    if (viewport.width < 768) {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await page.getByRole('dialog').getByRole('link', { name: 'Cases', exact: true }).click();
    } else await page.getByRole('link', { name: 'Cases', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Cases', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Priority', { exact: true }).selectOption('High');
    await dialog.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page).toHaveURL(/priority=High/);
    await noOverflow(page);
    await screenshot(page, `cases-${viewport.width}`);
    if (viewport.width < 768) {
      await page.locator('.mobile-case>a').first().click();
      await expect(page.getByLabel('Case assignee')).toBeVisible();
    } else {
      const link = page.locator('.cases-table tbody .case-number').first();
      await link.click();
      if (viewport.width >= 1024) await page.getByRole('link', { name: 'Full page' }).click();
      await expect(page.getByLabel('Case assignee')).toBeVisible();
    }
    await noOverflow(page);
    await screenshot(page, `detail-${viewport.width}`);
    await page.goto(origin + '/app/willow/appointments');
    await expect(page.getByRole('heading', { name: 'Appointments', exact: true })).toBeVisible();
    await expect(page.locator('.agenda-groups')).toBeVisible();
    await noOverflow(page);
    await screenshot(page, `appointments-${viewport.width}`);
    await context.close();
  });
}
test('representative accessibility scans and keyboard dialog focus', async ({ page }) => {
  await enter(page);
  const records = await query(page, 'cases', { slug: 'willow', filters: {} });
  const report: Record<string, unknown> = {};
  for (const route of [
    '/',
    '/demo',
    '/app/willow/overview',
    '/app/willow/cases',
    `/app/willow/cases/${records.data.rows[0].id}`,
    '/app/willow/appointments',
    '/app/willow/team',
    '/app/willow/activity',
    '/app/willow/settings',
  ]) {
    await page.goto(route);
    if (route.includes('/app')) await page.locator('.page-content h1').waitFor();
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    report[route] = result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    }));
  }
  await fs.mkdir('docs', { recursive: true });
  await fs.writeFile('docs/accessibility-results.json', JSON.stringify(report, null, 2));
  expect(Object.values(report).flat()).toEqual([]);
  await page.goto('/app/willow/cases');
  const trigger = page.getByRole('button', { name: 'Filters', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Close dialog' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await page.getByRole('dialog').evaluate((el) => el.contains(document.activeElement))).toBe(
    true,
  );
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
test('stale case edit preserves the draft and allows review before retry', async ({ page }) => {
  await enter(page);
  const result = await query(page, 'cases', { slug: 'willow', filters: { status: 'New' } }),
    record = result.data.rows[0];
  await page.goto(`/app/willow/cases/${record.id}`);
  await page.getByLabel('Internal note').fill('Draft preserved through a concurrent update.');
  const first = await mutate(page, 'editCase', {
    slug: 'willow',
    edit: { id: record.id, version: record.version, priority: 'High' },
  });
  expect(first.response.ok()).toBe(true);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.error-box[role="alert"]')).toContainText('another session');
  await expect(page.getByLabel('Internal note')).toHaveValue(
    'Draft preserved through a concurrent update.',
  );
  await screenshot(page, 'conflict');
  await page.getByRole('button', { name: 'Refresh record & keep draft' }).click();
  await expect(page.locator('.metadata-grid')).toContainText(`Version ${record.version + 1}`);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('Changes saved');
  await expect(page.locator('.notes-list')).toContainText(
    'Draft preserved through a concurrent update.',
  );
});
test('appointment conflicts offer alternatives and preserve the form', async ({ page }) => {
  await enter(page);
  const boot = await query(page, 'bootstrap', { slug: 'willow' }),
    patients = await query(page, 'patients', { slug: 'willow' });
  const staff = boot.data.members.find((m: { role: string }) => m.role === 'admin');
  await mutate(page, 'saveAppointment', {
    slug: 'willow',
    appointment: {
      patientId: patients.data[0].id,
      staffId: staff.id,
      title: 'Pre-existing synthetic booking',
      localStart: '2027-01-04T15:00',
      duration: 30,
    },
  });
  await page.goto('/app/willow/appointments');
  await page.getByRole('button', { name: 'New appointment' }).click();
  await page.getByLabel('Synthetic patient').selectOption(patients.data[1].id);
  await page.getByLabel('Staff member', { exact: true }).selectOption(staff.id);
  await page.getByLabel('Appointment title').fill('Draft appointment after a conflict');
  await page.getByLabel('Date and local time').fill('2027-01-04T15:00');
  await page.getByRole('button', { name: 'Save appointment' }).click();
  await expect(page.getByRole('alert')).toContainText('already booked');
  await expect(page.getByLabel('Appointment title')).toHaveValue(
    'Draft appointment after a conflict',
  );
  await expect(page.locator('.alternative-times')).toBeVisible();
  await page.locator('.alternative-times button').first().click();
  await page.getByRole('button', { name: 'Save appointment' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.agenda-groups')).toContainText('Draft appointment after a conflict');
});
test('display preferences persist, and dark/mobile layouts remain accessible', async ({ page }) => {
  await enter(page);
  await page.goto('/app/willow/cases');
  await page.getByRole('button', { name: 'Display' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'created at' }).click();
  await page.reload();
  await expect(page.locator('.cases-table thead')).toContainText('Created');
  await page.goto('/app/willow/settings');
  await page.getByLabel('Appearance', { exact: true }).selectOption('dark');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByRole('status')).toContainText('Preferences saved');
  await page.reload();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
  const report: Record<string, unknown> = {};
  for (const route of ['/app/willow/overview', '/app/willow/cases', '/app/willow/settings']) {
    await page.goto(route);
    await page.locator('.page-content h1').waitFor();
    report[`dark:${route}`] = (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    }));
  }
  await screenshot(page, 'dark-settings');
  await mutate(page, 'preferences', {
    slug: 'willow',
    appearance: 'light',
    density: 'comfortable',
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/app/willow/cases');
  await page.locator('.mobile-case').first().waitFor();
  await noOverflow(page);
  report['mobile:cases'] = (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  ).violations.map((v) => ({
    id: v.id,
    nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
  }));
  await fs.writeFile('docs/accessibility-variants.json', JSON.stringify(report, null, 2));
  expect(Object.values(report).flat()).toEqual([]);
});
test('competing HTTP writes preserve case versions and prevent overlapping bookings', async ({
  page,
}) => {
  await enter(page);
  const cases = await query(page, 'cases', { slug: 'willow', filters: { status: 'New' } });
  const record = cases.data.rows[0];
  const edit = {
    slug: 'willow',
    edit: { id: record.id, version: record.version, note: 'Competing HTTP writer' },
  };
  const edits = await Promise.all([mutate(page, 'editCase', edit), mutate(page, 'editCase', edit)]);
  expect(edits.map((r) => r.response.status()).sort()).toEqual([200, 409]);
  const detail = await query(page, 'detail', { slug: 'willow', id: record.id });
  expect(detail.data.record.version).toBe(record.version + 1);
  expect(
    detail.data.notes.filter((n: { body: string }) => n.body === 'Competing HTTP writer'),
  ).toHaveLength(1);
  const boot = await query(page, 'bootstrap', { slug: 'willow' });
  const patients = await query(page, 'patients', { slug: 'willow' });
  const staff = boot.data.members.find((m: { role: string }) => m.role === 'admin');
  const booking = {
    slug: 'willow',
    appointment: {
      patientId: patients.data[0].id,
      staffId: staff.id,
      title: 'Competing HTTP booking',
      localStart: '2027-01-04T15:00',
      duration: 30,
    },
  };
  const bookings = await Promise.all([
    mutate(page, 'saveAppointment', booking),
    mutate(page, 'saveAppointment', booking),
  ]);
  expect(bookings.map((r) => r.response.status()).sort()).toEqual([200, 409]);
});

test('demo reset replaces only the current workspace', async ({ page, browser }) => {
  await enter(page);
  const original = await query(page, 'cases', { slug: 'willow', filters: {} });
  const otherContext = await browser.newContext({ baseURL: origin });
  const otherPage = await otherContext.newPage();
  await enter(otherPage);
  const other = await query(otherPage, 'cases', { slug: 'willow', filters: {} });
  const response = await page.request.post(origin + '/api/demo', {
    headers: { origin },
    data: { action: 'reset', persona: 'admin' },
  });
  expect(response.ok()).toBe(true);
  expect(
    (
      await query(page, 'detail', { slug: 'willow', id: original.data.rows[0].id })
    ).response.status(),
  ).toBe(404);
  expect(
    (await query(otherPage, 'detail', { slug: 'willow', id: other.data.rows[0].id })).response.ok(),
  ).toBe(true);
  expect((await query(page, 'cases', { slug: 'willow', filters: {} })).data.total).toBe(150);
  await otherContext.close();
});
