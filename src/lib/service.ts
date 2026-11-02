import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { db, clinicSchema, sqlite, one, all, run } from './db';
import type { Context, Clinic, Member, Case, Audit, Appointment, Note } from './types';
import { statuses, priorities } from './types';
import { validCalendarDate } from './dates';

export function fail(
  code: 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'BAD_REQUEST' | 'UNAUTHORIZED',
  message: string,
): never {
  throw new TRPCError({ code, message });
}
export function scope(ctx: Context, slug: string, write = false, admin = false) {
  // Identity comes only from a verified server session. Re-read membership on every operation.
  const clinic = db
    .select()
    .from(clinicSchema)
    .where(and(eq(clinicSchema.demoId, ctx.demoId), eq(clinicSchema.slug, slug)))
    .get();
  if (!clinic) fail('NOT_FOUND', 'Clinic not found in this demo workspace.');
  const member = one<Member>(
    'SELECT * FROM memberships WHERE clinic_id=? AND user_id=? AND active=1',
    clinic.id,
    ctx.user.id,
  );
  if (!member || (write && member.role === 'viewer') || (admin && member.role !== 'admin'))
    fail('FORBIDDEN', 'Your current role does not allow this action.');
  const record = one<Clinic>('SELECT * FROM clinics WHERE id=?', clinic.id)!;
  return { clinic: record, member };
}
function audit(
  clinicId: string,
  actor: string,
  action: string,
  entity: string,
  description: string,
) {
  run(
    'INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)',
    randomUUID(),
    clinicId,
    actor,
    action,
    entity,
    description,
    Date.now(),
  );
}
export const filterSchema = z.object({
  q: z.string().max(100).default(''),
  status: z.enum([...statuses, 'Open', '']).default(''),
  completedDays: z.union([z.literal(0), z.literal(7), z.literal(14), z.literal(30)]).default(0),
  priority: z.enum([...priorities, '']).default(''),
  assignee: z.string().max(100).default(''),
  type: z.string().max(100).default(''),
  from: z
    .string()
    .refine((value) => !value || validCalendarDate(value), 'Choose a valid date.')
    .default(''),
  to: z
    .string()
    .refine((value) => !value || validCalendarDate(value), 'Choose a valid date.')
    .default(''),
  sort: z.enum(['updated', 'created', 'patient', 'priority']).default('updated'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  page: z.number().int().min(1).max(10000).default(1),
});
export type Filters = z.infer<typeof filterSchema>;
const caseJoin =
  'FROM cases c JOIN patients p ON p.id=c.patient_id AND p.clinic_id=c.clinic_id LEFT JOIN memberships m ON m.id=c.assignee_id AND m.clinic_id=c.clinic_id';
const caseSelect = 'c.*, p.name patient,p.dob,p.reference,m.name assignee';
export function listCases(ctx: Context, slug: string, input: Filters) {
  const { clinic, member } = scope(ctx, slug);
  const clauses = ['c.clinic_id=?'];
  const args: unknown[] = [clinic.id];
  if (input.q) {
    clauses.push("(p.name LIKE ? ESCAPE '!' OR c.number LIKE ? ESCAPE '!')");
    const s = '%' + input.q.replace(/[!%_]/g, '!$&') + '%';
    args.push(s, s);
  }
  if (input.status === 'Open') clauses.push("c.status<>'Completed'");
  else if (input.status) {
    clauses.push('c.status=?');
    args.push(input.status);
  }
  if (input.completedDays) {
    clauses.push('c.completed_at>=?');
    args.push(Date.now() - input.completedDays * 86400000);
  }
  if (input.priority) {
    clauses.push('c.priority=?');
    args.push(input.priority);
  }
  if (input.type) {
    clauses.push('c.type=?');
    args.push(input.type);
  }
  if (input.assignee === 'unassigned') clauses.push('c.assignee_id IS NULL');
  else if (input.assignee) {
    clauses.push('c.assignee_id=?');
    args.push(input.assignee === 'me' ? member.id : input.assignee);
  }
  if (input.from) {
    clauses.push('c.created_at>=?');
    args.push(fromZonedTime(`${input.from}T00:00:00`, clinic.timezone).getTime());
  }
  if (input.to) {
    const next = new Date(`${input.to}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    clauses.push('c.created_at<?');
    args.push(
      fromZonedTime(`${next.toISOString().slice(0, 10)}T00:00:00`, clinic.timezone).getTime(),
    );
  }
  const where = clauses.join(' AND ');
  const total = one<{ n: number }>(`SELECT COUNT(*) n ${caseJoin} WHERE ${where}`, ...args)!.n;
  const sort = {
    updated: 'c.updated_at',
    created: 'c.created_at',
    patient: 'p.name',
    priority:
      "CASE c.priority WHEN 'Urgent' THEN 4 WHEN 'High' THEN 3 WHEN 'Normal' THEN 2 ELSE 1 END",
  }[input.sort];
  const rows = all<Case>(
    `SELECT ${caseSelect} ${caseJoin} WHERE ${where} ORDER BY ${sort} ${input.direction === 'asc' ? 'ASC' : 'DESC'},c.id ASC LIMIT 15 OFFSET ?`,
    ...args,
    (input.page - 1) * 15,
  );
  return {
    rows,
    total,
    pages: Math.max(1, Math.ceil(total / 15)),
    page: input.page,
  };
}
export function detail(ctx: Context, slug: string, id: string) {
  const { clinic } = scope(ctx, slug);
  const record = one<Case>(
    `SELECT ${caseSelect} ${caseJoin} WHERE c.clinic_id=? AND c.id=?`,
    clinic.id,
    id,
  );
  if (!record) fail('NOT_FOUND', 'This case was not found in the current clinic.');
  return {
    record,
    notes: all<Note>(
      'SELECT * FROM notes WHERE clinic_id=? AND case_id=? ORDER BY created_at,id',
      clinic.id,
      id,
    ),
    events: all<Audit>(
      'SELECT * FROM audit_events WHERE clinic_id=? AND entity_id=? ORDER BY created_at DESC,id',
      clinic.id,
      id,
    ),
  };
}
export const editSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  status: z.enum(statuses).optional(),
  assigneeId: z.string().nullable().optional(),
  priority: z.enum(priorities).optional(),
  note: z.string().trim().max(4000).optional(),
  reason: z.string().trim().max(500).optional(),
});
export type CaseEdit = z.infer<typeof editSchema>;
export function editCase(ctx: Context, slug: string, input: CaseEdit) {
  return sqlite
    .transaction(() => {
      const { clinic } = scope(ctx, slug, true);
      const item = one<Case>('SELECT * FROM cases WHERE clinic_id=? AND id=?', clinic.id, input.id);
      if (!item) fail('NOT_FOUND', 'Case not found in this clinic.');
      if (item.version !== input.version)
        fail(
          'CONFLICT',
          'This case changed in another session. Refresh the record, review the latest changes, then save again. Your draft is preserved.',
        );
      if (
        input.assigneeId &&
        !one(
          'SELECT id FROM memberships WHERE clinic_id=? AND id=? AND active=1 AND role<>?',
          clinic.id,
          input.assigneeId,
          'viewer',
        )
      )
        fail('BAD_REQUEST', 'Choose an active coordinator or administrator from this clinic.');
      const transitions: Record<string, string[]> = {
        New: ['In review'],
        'In review': ['Needs information', 'Completed'],
        'Needs information': ['In review'],
        Completed: ['In review'],
      };
      if (input.status && input.status !== item.status) {
        if (!transitions[item.status].includes(input.status))
          fail('BAD_REQUEST', `Cannot move directly from ${item.status} to ${input.status}.`);
        if (item.status === 'Completed' && (!input.reason || input.reason.length < 5))
          fail('BAD_REQUEST', 'A reopen reason of at least 5 characters is required.');
      }
      const now = Date.now(),
        status = input.status ?? item.status,
        assignee = input.assigneeId === undefined ? item.assignee_id : input.assigneeId,
        priority = input.priority ?? item.priority;
      const changed = run(
        'UPDATE cases SET status=?,assignee_id=?,priority=?,updated_at=?,completed_at=?,version=version+1 WHERE clinic_id=? AND id=? AND version=?',
        status,
        assignee,
        priority,
        now,
        status === 'Completed' ? (item.completed_at ?? now) : null,
        clinic.id,
        item.id,
        input.version,
      );
      if (!changed.changes)
        fail('CONFLICT', 'This record changed. Refresh and review before saving.');
      if (status !== item.status)
        audit(
          clinic.id,
          ctx.user.name,
          item.status === 'Completed' ? 'case.reopened' : 'case.status',
          item.id,
          `${item.number}: ${item.status} → ${status}${input.reason ? `. Reason: ${input.reason}` : ''}`,
        );
      if (assignee !== item.assignee_id) {
        const name = assignee
          ? one<{ name: string }>('SELECT name FROM memberships WHERE id=?', assignee)?.name
          : 'Unassigned';
        audit(
          clinic.id,
          ctx.user.name,
          'case.assigned',
          item.id,
          `${item.number} assigned to ${name}`,
        );
      }
      if (priority !== item.priority)
        audit(
          clinic.id,
          ctx.user.name,
          'case.priority',
          item.id,
          `${item.number} priority changed to ${priority}`,
        );
      if (input.note) {
        run(
          'INSERT INTO notes VALUES(?,?,?,?,?,?)',
          randomUUID(),
          clinic.id,
          item.id,
          ctx.user.name,
          input.note,
          now,
        );
        audit(
          clinic.id,
          ctx.user.name,
          'case.note',
          item.id,
          `Added an internal note to ${item.number}`,
        );
      }
      return { version: item.version + 1 };
    })
    .immediate();
}
export function bulkEdit(ctx: Context, slug: string, items: CaseEdit[]) {
  scope(ctx, slug, true);
  return items.map((item) => {
    try {
      return {
        id: item.id,
        success: true as const,
        ...editCase(ctx, slug, item),
      };
    } catch (e) {
      return {
        id: item.id,
        success: false as const,
        error: e instanceof Error ? e.message : 'Unable to save',
      };
    }
  });
}
export function bootstrap(ctx: Context, slug: string) {
  const { clinic, member } = scope(ctx, slug);
  return {
    clinic,
    member,
    caseCount: one<{ n: number }>('SELECT COUNT(*) n FROM cases WHERE clinic_id=?', clinic.id)!.n,
    columns: JSON.parse(
      one<{ columns: string }>(
        'SELECT columns FROM table_preferences WHERE clinic_id=? AND user_id=?',
        clinic.id,
        ctx.user.id,
      )?.columns ?? '{"created_at":false,"type":false}',
    ) as Record<string, boolean>,
    user: ctx.user,
    sessionKey: ctx.sessionId,
    clinics: all<Clinic>(
      'SELECT c.* FROM clinics c JOIN memberships m ON m.clinic_id=c.id WHERE c.demo_id=? AND m.user_id=? AND m.active=1 ORDER BY c.name',
      ctx.demoId,
      ctx.user.id,
    ),
    members: all<Member>(
      "SELECT m.*, (SELECT COUNT(*) FROM cases c WHERE c.clinic_id=m.clinic_id AND c.assignee_id=m.id AND c.status<>'Completed') workload FROM memberships m WHERE clinic_id=? ORDER BY name",
      clinic.id,
    ),
    views: all<{ id: string; name: string; filters: string }>(
      'SELECT * FROM saved_views WHERE clinic_id=? AND user_id=? ORDER BY name',
      clinic.id,
      ctx.user.id,
    ),
  };
}
export function overview(ctx: Context, slug: string, days: number) {
  const { clinic } = scope(ctx, slug);
  const since = Date.now() - days * 86400000;
  const rows = all<Case>('SELECT * FROM cases WHERE clinic_id=?', clinic.id);
  const completed = rows.filter((r) => r.completed_at && r.completed_at >= since);
  const breakdown = statuses.map((status) => ({
    status,
    count: rows.filter((r) => r.status === status).length,
  }));
  const trend: Array<{ date: string; opened: number; completed: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = formatInTimeZone(Date.now() - i * 86400000, clinic.timezone, 'yyyy-MM-dd');
    trend.push({
      date: day,
      opened: rows.filter(
        (r) => formatInTimeZone(r.created_at, clinic.timezone, 'yyyy-MM-dd') === day,
      ).length,
      completed: rows.filter(
        (r) =>
          r.completed_at && formatInTimeZone(r.completed_at, clinic.timezone, 'yyyy-MM-dd') === day,
      ).length,
    });
  }
  return {
    total: rows.length,
    open: rows.filter((r) => r.status !== 'Completed').length,
    unassigned: rows.filter((r) => !r.assignee_id && r.status !== 'Completed').length,
    completed: completed.length,
    averageHours: completed.length
      ? completed.reduce((s, r) => s + (r.completed_at! - r.created_at) / 3600000, 0) /
        completed.length
      : 0,
    breakdown,
    trend,
    appointments: appointments(ctx, slug)
      .filter((a) => !a.cancelled && a.starts_at >= Date.now())
      .slice(0, 4),
    events: activity(ctx, slug, '', 1).rows.slice(0, 5),
  };
}
export function activity(ctx: Context, slug: string, q: string, page: number) {
  const { clinic } = scope(ctx, slug);
  const like = `%${q}%`;
  return {
    rows: all<Audit>(
      'SELECT * FROM audit_events WHERE clinic_id=? AND (description LIKE ? OR actor LIKE ? OR action LIKE ?) ORDER BY created_at DESC,id LIMIT 20 OFFSET ?',
      clinic.id,
      like,
      like,
      like,
      (page - 1) * 20,
    ),
    total: one<{ n: number }>(
      'SELECT COUNT(*) n FROM audit_events WHERE clinic_id=? AND (description LIKE ? OR actor LIKE ? OR action LIKE ?)',
      clinic.id,
      like,
      like,
      like,
    )!.n,
  };
}
export function appointments(ctx: Context, slug: string) {
  const { clinic } = scope(ctx, slug);
  return all<Appointment>(
    'SELECT a.*,p.name patient,m.name staff FROM appointments a JOIN patients p ON p.id=a.patient_id AND p.clinic_id=a.clinic_id JOIN memberships m ON m.id=a.staff_id AND m.clinic_id=a.clinic_id WHERE a.clinic_id=? ORDER BY starts_at,id',
    clinic.id,
  );
}
export const appointmentSchema = z.object({
  id: z.string().optional(),
  version: z.number().int().positive().optional(),
  patientId: z.string(),
  staffId: z.string(),
  title: z.string().trim().min(3).max(100),
  localStart: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  duration: z.number().int().min(15).max(120),
  cancel: z.boolean().optional(),
});
export function validateSlot(clinic: Clinic, local: string, duration: number) {
  const start = fromZonedTime(local, clinic.timezone).getTime(),
    end = start + duration * 60000;
  if (
    !Number.isFinite(start) ||
    formatInTimeZone(start, clinic.timezone, "yyyy-MM-dd'T'HH:mm") !== local
  )
    fail('BAD_REQUEST', 'This local time does not exist because of a daylight-saving change.');
  const weekday = Number(formatInTimeZone(start, clinic.timezone, 'i')),
    hour =
      Number(formatInTimeZone(start, clinic.timezone, 'H')) +
      Number(formatInTimeZone(start, clinic.timezone, 'm')) / 60;
  if (weekday > 5 || hour < clinic.start_hour || hour + duration / 60 > clinic.end_hour)
    fail(
      'BAD_REQUEST',
      `Choose a weekday between ${clinic.start_hour}:00 and ${clinic.end_hour}:00 in ${clinic.timezone}.`,
    );
  return { start, end };
}
export function saveAppointment(
  ctx: Context,
  slug: string,
  input: z.infer<typeof appointmentSchema>,
) {
  try {
    return sqlite
      .transaction(() => {
        const { clinic } = scope(ctx, slug, true);
        const existing = input.id
          ? one<Appointment>(
              'SELECT * FROM appointments WHERE clinic_id=? AND id=?',
              clinic.id,
              input.id,
            )
          : undefined;
        if (input.id && !existing) fail('NOT_FOUND', 'Appointment not found.');
        if (existing && existing.version !== input.version)
          fail('CONFLICT', 'This appointment changed. Refresh and review before saving.');
        if (!one('SELECT id FROM patients WHERE clinic_id=? AND id=?', clinic.id, input.patientId))
          fail('BAD_REQUEST', 'Choose a patient from this clinic.');
        if (
          !one(
            "SELECT id FROM memberships WHERE clinic_id=? AND id=? AND active=1 AND role<>'viewer'",
            clinic.id,
            input.staffId,
          )
        )
          fail('BAD_REQUEST', 'Choose an available clinic staff member.');
        const slot =
          input.cancel && existing
            ? { start: existing.starts_at, end: existing.ends_at }
            : validateSlot(clinic, input.localStart, input.duration);
        const id = existing?.id ?? randomUUID();
        if (existing)
          run(
            'UPDATE appointments SET patient_id=?,staff_id=?,title=?,starts_at=?,ends_at=?,cancelled=?,version=version+1 WHERE clinic_id=? AND id=?',
            input.patientId,
            input.staffId,
            input.title,
            slot.start,
            slot.end,
            input.cancel ? 1 : 0,
            clinic.id,
            id,
          );
        else
          run(
            'INSERT INTO appointments(id,clinic_id,patient_id,staff_id,title,starts_at,ends_at) VALUES(?,?,?,?,?,?,?)',
            id,
            clinic.id,
            input.patientId,
            input.staffId,
            input.title,
            slot.start,
            slot.end,
          );
        audit(
          clinic.id,
          ctx.user.name,
          input.cancel
            ? 'appointment.cancelled'
            : existing
              ? 'appointment.rescheduled'
              : 'appointment.created',
          id,
          `${input.title} ${input.cancel ? 'cancelled' : existing ? 'rescheduled' : 'scheduled'}`,
        );
        return { id };
      })
      .immediate();
  } catch (e) {
    if (e instanceof Error && e.message.includes('APPOINTMENT_OVERLAP'))
      fail(
        'CONFLICT',
        'This staff member is already booked. Try a later time or another staff member; availability is rechecked when saving.',
      );
    throw e;
  }
}
export function updateMember(
  ctx: Context,
  slug: string,
  id: string,
  role: 'admin' | 'coordinator' | 'viewer',
  active: boolean,
) {
  return sqlite
    .transaction(() => {
      const { clinic } = scope(ctx, slug, true, true);
      const member = one<Member>(
        'SELECT * FROM memberships WHERE clinic_id=? AND id=?',
        clinic.id,
        id,
      );
      if (!member) fail('NOT_FOUND', 'Member not found.');
      if (
        member.role === 'admin' &&
        member.active &&
        (!active || role !== 'admin') &&
        one<{ n: number }>(
          "SELECT COUNT(*) n FROM memberships WHERE clinic_id=? AND role='admin' AND active=1",
          clinic.id,
        )!.n <= 1
      )
        fail('BAD_REQUEST', 'Keep at least one active clinic administrator.');
      run(
        'UPDATE memberships SET role=?,active=? WHERE clinic_id=? AND id=?',
        role,
        active ? 1 : 0,
        clinic.id,
        id,
      );
      audit(
        clinic.id,
        ctx.user.name,
        'member.updated',
        id,
        `${member.name}: ${role}, ${active ? 'active' : 'inactive'}`,
      );
      return { success: true };
    })
    .immediate();
}
export const settingsSchema = z
  .object({
    name: z.string().trim().min(3).max(80),
    accent: z.enum(['teal', 'blue', 'violet']),
    timezone: z.string().refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, 'Choose a valid IANA timezone.'),
    startHour: z.number().int().min(0).max(22),
    endHour: z.number().int().min(1).max(23),
  })
  .refine((v) => v.endHour > v.startHour, 'Closing time must be after opening time.');
export function settings(ctx: Context, slug: string, input: z.infer<typeof settingsSchema>) {
  return sqlite
    .transaction(() => {
      const { clinic } = scope(ctx, slug, true, true);
      run(
        'UPDATE clinics SET name=?,accent=?,timezone=?,start_hour=?,end_hour=? WHERE id=?',
        input.name,
        input.accent,
        input.timezone,
        input.startHour,
        input.endHour,
        clinic.id,
      );
      audit(
        clinic.id,
        ctx.user.name,
        'clinic.updated',
        clinic.id,
        'Updated clinic settings and business hours',
      );
      return { success: true };
    })
    .immediate();
}
export function saveView(ctx: Context, slug: string, name: string, filters: Filters) {
  const { clinic } = scope(ctx, slug);
  run(
    'INSERT INTO saved_views VALUES(?,?,?,?,?) ON CONFLICT(clinic_id,user_id,name) DO UPDATE SET filters=excluded.filters',
    randomUUID(),
    clinic.id,
    ctx.user.id,
    name,
    JSON.stringify(filters),
  );
  return { success: true };
}
