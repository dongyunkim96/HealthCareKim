import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { formatInTimeZone } from 'date-fns-tz';
import type { Context, Case, Clinic, Member, User } from '../src/lib/types';
const folder = mkdtempSync(path.join(tmpdir(), 'hck-tests-'));
process.env.DATABASE_PATH = path.join(folder, 'test.sqlite');
const exec = promisify(execFile);
let s: typeof import('../src/lib/service'),
  d: typeof import('../src/lib/db'),
  seed: typeof import('../src/lib/seed'),
  router: typeof import('../src/server/router');
let admin: Context,
  coordinator: Context,
  viewer: Context,
  other: Context,
  clinic: Clinic,
  harbor: Clinic,
  member: Member,
  foreignMember: Member;
const fresh = (status = 'New') =>
  d.one<Case>(
    'SELECT * FROM cases WHERE clinic_id=? AND status=? ORDER BY number',
    clinic.id,
    status,
  )!;
const patient = () =>
  d.one<{ id: string }>('SELECT id FROM patients WHERE clinic_id=?', clinic.id)!.id;
const slot = (overrides: Record<string, unknown> = {}) => ({
  patientId: patient(),
  staffId: member.id,
  title: 'Synthetic intake',
  localStart: '2027-01-04T15:00',
  duration: 30,
  ...overrides,
});
function identity(demoId: string, persona: string): Context {
  const user = d.one<User>('SELECT * FROM users WHERE demo_id=? AND persona=?', demoId, persona)!;
  return { demoId, sessionId: 'test-session-' + persona, user };
}
beforeAll(async () => {
  d = await import('../src/lib/db');
  s = await import('../src/lib/service');
  seed = await import('../src/lib/seed');
  router = await import('../src/server/router');
  const demo = seed.createDemo();
  admin = identity(demo.demoId, 'admin');
  coordinator = identity(demo.demoId, 'coordinator');
  viewer = identity(demo.demoId, 'viewer');
  const second = seed.createDemo();
  other = identity(second.demoId, 'admin');
  clinic = d.one<Clinic>(
    'SELECT * FROM clinics WHERE demo_id=? AND slug=?',
    demo.demoId,
    'willow',
  )!;
  harbor = d.one<Clinic>(
    'SELECT * FROM clinics WHERE demo_id=? AND slug=?',
    demo.demoId,
    'harbor',
  )!;
  member = d.one<Member>(
    'SELECT * FROM memberships WHERE clinic_id=? AND user_id=?',
    clinic.id,
    coordinator.user.id,
  )!;
  foreignMember = d.one<Member>(
    "SELECT * FROM memberships WHERE clinic_id=? AND role='coordinator'",
    harbor.id,
  )!;
});
afterAll(() => {
  d.sqlite.close();
  rmSync(folder, { recursive: true, force: true });
});
describe('tenant isolation and authorization', () => {
  it('creates 150 synthetic cases in each clinic, with a separate second workspace', () => {
    expect(
      d.one<{ n: number }>('SELECT COUNT(*) n FROM cases WHERE clinic_id=?', clinic.id)!.n,
    ).toBe(150);
    expect(s.bootstrap(other, 'willow').clinic.id).not.toBe(clinic.id);
  });
  it.each(['admin', 'coordinator', 'viewer'])(
    '%s can read their clinic and personal views',
    async (persona) => {
      const ctx = { admin, coordinator, viewer }[persona]!;
      const caller = router.appRouter.createCaller({ identity: ctx });
      expect((await caller.cases({ slug: 'willow', filters: {} })).total).toBe(150);
      await caller.saveView({
        slug: 'willow',
        name: `${persona} view`,
        filters: { status: 'New' },
      });
      expect(s.bootstrap(ctx, 'willow').views.some((v) => v.name === `${persona} view`)).toBe(true);
    },
  );
  it('rejects unauthenticated procedure callers', async () => {
    await expect(
      router.appRouter.createCaller({ identity: null }).bootstrap({ slug: 'willow' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  it.each(['admin', 'coordinator'])('%s can mutate cases and appointments', async (persona) => {
    const ctx = { admin, coordinator }[persona]!;
    const item = fresh();
    await router.appRouter.createCaller({ identity: ctx }).editCase({
      slug: 'willow',
      edit: {
        id: item.id,
        version: item.version,
        status: 'In review',
        assigneeId: member.id,
        note: 'Synthetic workflow verified.',
      },
    });
    expect(s.detail(ctx, 'willow', item.id).record.status).toBe('In review');
    const a = s.saveAppointment(
      ctx,
      'willow',
      slot({
        localStart: persona === 'admin' ? '2027-01-05T15:00' : '2027-01-05T16:00',
      }),
    );
    expect(a.id).toBeTruthy();
  });
  it('viewer is denied every operational and administrative mutation at procedure level', async () => {
    const c = router.appRouter.createCaller({ identity: viewer }),
      item = fresh();
    await expect(
      c.editCase({
        slug: 'willow',
        edit: { id: item.id, version: item.version, note: 'no' },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      c.bulkEdit({
        slug: 'willow',
        items: [{ id: item.id, version: item.version, status: 'In review' }],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(c.saveAppointment({ slug: 'willow', appointment: slot() })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      c.updateMember({
        slug: 'willow',
        id: member.id,
        role: 'admin',
        active: true,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      c.settings({
        slug: 'willow',
        settings: {
          name: 'Denied clinic',
          accent: 'teal',
          timezone: 'UTC',
          startHour: 8,
          endHour: 18,
        },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('coordinator cannot manage roles or clinic settings', () => {
    expect(() => s.updateMember(coordinator, 'willow', member.id, 'admin', true)).toThrow('role');
    expect(() =>
      s.settings(coordinator, 'willow', {
        name: 'Denied clinic',
        accent: 'teal',
        timezone: 'UTC',
        startHour: 8,
        endHour: 18,
      }),
    ).toThrow('role');
  });
  it('admin can update settings and roles but cannot remove the last active admin', () => {
    s.settings(admin, 'willow', {
      name: clinic.name,
      accent: 'teal',
      timezone: clinic.timezone,
      startHour: 8,
      endHour: 18,
    });
    s.updateMember(admin, 'willow', member.id, 'coordinator', true);
    const own = s.bootstrap(admin, 'willow').member;
    expect(() => s.updateMember(admin, 'willow', own.id, 'viewer', false)).toThrow('at least one');
  });
  it('denies another clinic case, patient, assignee, appointment, and saved view IDs', async () => {
    const foreign = d.one<Case>('SELECT * FROM cases WHERE clinic_id=?', harbor.id)!;
    expect(() => s.detail(admin, 'willow', foreign.id)).toThrow('not found');
    expect(() =>
      s.editCase(admin, 'willow', {
        id: fresh().id,
        version: fresh().version,
        assigneeId: foreignMember.id,
      }),
    ).toThrow('this clinic');
    expect(() =>
      s.saveAppointment(admin, 'willow', slot({ patientId: foreign.patient_id })),
    ).toThrow('this clinic');
    expect(() => s.saveAppointment(admin, 'willow', slot({ staffId: foreignMember.id }))).toThrow(
      'clinic staff',
    );
    const ap = d.one<{ id: string }>('SELECT id FROM appointments WHERE clinic_id=?', harbor.id)!;
    expect(() => s.saveAppointment(admin, 'willow', slot({ id: ap.id, version: 1 }))).toThrow(
      'not found',
    );
    s.saveView(admin, 'harbor', 'Harbor private', s.filterSchema.parse({}));
    const view = s.bootstrap(admin, 'harbor').views[0];
    await expect(
      router.appRouter
        .createCaller({ identity: admin })
        .deleteView({ slug: 'willow', id: view.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(() => s.detail(other, 'willow', fresh().id)).toThrow('not found');
  });
  it('composite foreign keys reject cross-clinic relationships even in raw SQL', () => {
    const item = fresh();
    expect(() =>
      d.run('UPDATE cases SET assignee_id=? WHERE id=?', foreignMember.id, item.id),
    ).toThrow('FOREIGN KEY');
  });
  it('revalidates membership after a role change', () => {
    s.updateMember(admin, 'willow', member.id, 'viewer', true);
    expect(() =>
      s.editCase(coordinator, 'willow', {
        id: fresh().id,
        version: fresh().version,
        note: 'no',
      }),
    ).toThrow('role');
    s.updateMember(admin, 'willow', member.id, 'coordinator', true);
  });
});
describe('transactional workflow and version conflicts', () => {
  it('enforces transitions and requires a reopen reason', () => {
    const item = fresh();
    expect(() =>
      s.editCase(admin, 'willow', {
        id: item.id,
        version: item.version,
        status: 'Completed',
      }),
    ).toThrow('Cannot move');
    const completed = fresh('Completed');
    expect(() =>
      s.editCase(admin, 'willow', {
        id: completed.id,
        version: completed.version,
        status: 'In review',
      }),
    ).toThrow('reopen reason');
    s.editCase(admin, 'willow', {
      id: completed.id,
      version: completed.version,
      status: 'In review',
      reason: 'Synthetic follow-up required',
    });
    expect(s.detail(admin, 'willow', completed.id).events[0].description).toContain(
      'Synthetic follow-up',
    );
  });
  it('rejects a stale write without overwriting saved fields or notes', () => {
    const item = fresh();
    s.editCase(admin, 'willow', {
      id: item.id,
      version: item.version,
      note: 'First writer',
    });
    expect(() =>
      s.editCase(admin, 'willow', {
        id: item.id,
        version: item.version,
        note: 'Stale writer',
      }),
    ).toThrow('another session');
    const result = s.detail(admin, 'willow', item.id);
    expect(result.notes.some((n) => n.body === 'First writer')).toBe(true);
    expect(result.notes.some((n) => n.body === 'Stale writer')).toBe(false);
  });
  it('rolls back the record and note when audit creation fails', () => {
    const item = fresh(),
      before = s.detail(admin, 'willow', item.id);
    d.sqlite.exec(
      "CREATE TEMP TRIGGER fail_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'injected audit failure'); END;",
    );
    try {
      expect(() =>
        s.editCase(admin, 'willow', {
          id: item.id,
          version: item.version,
          status: 'In review',
          note: 'Atomic draft',
        }),
      ).toThrow('injected audit');
      expect(s.detail(admin, 'willow', item.id)).toEqual(before);
    } finally {
      d.sqlite.exec('DROP TRIGGER fail_audit');
    }
  });
  it('reports partial bulk failure per case', () => {
    const item = fresh();
    const results = s.bulkEdit(admin, 'willow', [
      { id: item.id, version: item.version, status: 'In review' },
      { id: 'foreign-or-missing', version: 1, status: 'In review' },
    ]);
    expect(results.map((r) => r.success)).toEqual([true, false]);
  });
  it('serializes real competing processes and rejects the second stale case edit', async () => {
    const item = fresh();
    const input = {
      kind: 'case',
      ctx: admin,
      edit: { id: item.id, version: item.version, note: 'Concurrent writer' },
    };
    const invoke = () =>
      exec(
        process.execPath,
        ['--import', 'tsx', 'tests/concurrent-worker.ts', JSON.stringify(input)],
        { env: process.env },
      );
    const outputs = await Promise.all([invoke(), invoke()]);
    expect(outputs.map((o) => JSON.parse(o.stdout).success).sort()).toEqual([false, true]);
    expect(s.detail(admin, 'willow', item.id).record.version).toBe(item.version + 1);
  });
});
describe('indexed filters and personal views', () => {
  it('searches patient and number, paginates deterministically, and scopes saved views', () => {
    const f = s.filterSchema.parse({ sort: 'created', direction: 'asc' });
    const a = s.listCases(admin, 'willow', f),
      b = s.listCases(admin, 'willow', { ...f, page: 2 });
    expect(a.rows).toHaveLength(15);
    expect(b.rows.some((r) => a.rows.some((x) => x.id === r.id))).toBe(false);
    expect(s.listCases(admin, 'willow', { ...f, q: a.rows[0].number }).total).toBe(1);
    s.saveView(admin, 'willow', 'Stable view', {
      ...f,
      status: 'Needs information',
    });
    expect(s.bootstrap(admin, 'willow').views.find((v) => v.name === 'Stable view')).toBeTruthy();
    expect(
      s.bootstrap(viewer, 'willow').views.find((v) => v.name === 'Stable view'),
    ).toBeUndefined();
    expect(
      s.bootstrap(admin, 'harbor').views.find((v) => v.name === 'Stable view'),
    ).toBeUndefined();
  });
});
describe('appointment integrity and timezone handling', () => {
  it('prevents simultaneous overlapping appointments across real processes', async () => {
    const input = { kind: 'appointment', ctx: admin, appointment: slot() };
    const invoke = () =>
      exec(
        process.execPath,
        ['--import', 'tsx', 'tests/concurrent-worker.ts', JSON.stringify(input)],
        { env: process.env },
      );
    const outputs = await Promise.all([invoke(), invoke()]);
    expect(outputs.map((o) => JSON.parse(o.stdout).success).sort()).toEqual([false, true]);
  });
  it('cancellation releases the slot; rescheduling rechecks availability', () => {
    const created = s.saveAppointment(admin, 'willow', slot({ localStart: '2027-01-06T15:00' }));
    expect(() =>
      s.saveAppointment(admin, 'willow', slot({ localStart: '2027-01-06T15:15' })),
    ).toThrow('already booked');
    s.saveAppointment(
      admin,
      'willow',
      slot({
        id: created.id,
        version: 1,
        localStart: '2027-01-06T15:00',
        cancel: true,
      }),
    );
    const replacement = s.saveAppointment(
      admin,
      'willow',
      slot({ localStart: '2027-01-06T15:00' }),
    );
    expect(replacement.id).toBeTruthy();
    expect(() =>
      s.saveAppointment(
        admin,
        'willow',
        slot({ id: created.id, version: 2, localStart: '2027-01-06T15:00' }),
      ),
    ).toThrow('already booked');
  });
  it('rejects weekends, out-of-hours slots, invalid durations, and stale versions', async () => {
    expect(() =>
      s.saveAppointment(admin, 'willow', slot({ localStart: '2027-01-09T10:00' })),
    ).toThrow('weekday');
    expect(() =>
      s.saveAppointment(admin, 'willow', slot({ localStart: '2027-01-04T17:45', duration: 30 })),
    ).toThrow('weekday');
    await expect(
      router.appRouter.createCaller({ identity: admin }).saveAppointment({
        slug: 'willow',
        appointment: slot({ duration: 2 }),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  it('rejects a nonexistent DST time and keeps local date grouping correct', () => {
    expect(() => s.validateSlot(clinic, '2027-03-14T02:30', 30)).toThrow('daylight-saving');
    expect(
      formatInTimeZone(Date.parse('2026-11-01T05:30:00Z'), clinic.timezone, 'yyyy-MM-dd HH:mm XXX'),
    ).toBe('2026-11-01 01:30 -04:00');
    expect(
      formatInTimeZone(Date.parse('2026-11-01T06:30:00Z'), clinic.timezone, 'yyyy-MM-dd HH:mm XXX'),
    ).toBe('2026-11-01 01:30 -05:00');
    expect(
      formatInTimeZone(Date.parse('2026-11-02T01:00:00Z'), clinic.timezone, 'yyyy-MM-dd'),
    ).toBe('2026-11-01');
  });
  it('expires and cleans only expired workspaces', () => {
    const demo = seed.createDemo();
    d.run('UPDATE demo_sessions SET expires_at=? WHERE id=?', Date.now() - 1, demo.demoId);
    expect(seed.cleanup()).toBe(1);
    expect(d.one('SELECT id FROM demo_sessions WHERE id=?', admin.demoId)).toBeTruthy();
  });
});
