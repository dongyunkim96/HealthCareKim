import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import type { Context } from '@/lib/types';
import * as service from '@/lib/service';
import { all, run } from '@/lib/db';
const t = initTRPC
  .context<{
    identity: Context | null;
  }>()
  .create();
const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.identity)
    service.fail('UNAUTHORIZED', 'Your demo session expired. Enter the demo to continue.');
  return next({ ctx: ctx.identity });
});
const scoped = z.object({ slug: z.string().min(1).max(40) });
export const appRouter = t.router({
  bootstrap: protectedProcedure
    .input(scoped)
    .query(async ({ ctx, input }) => await service.bootstrap(ctx, input.slug)),
  cases: protectedProcedure
    .input(scoped.extend({ filters: service.filterSchema }))
    .query(async ({ ctx, input }) => await service.listCases(ctx, input.slug, input.filters)),
  detail: protectedProcedure
    .input(scoped.extend({ id: z.string() }))
    .query(async ({ ctx, input }) => await service.detail(ctx, input.slug, input.id)),
  editCase: protectedProcedure
    .input(scoped.extend({ edit: service.editSchema }))
    .mutation(async ({ ctx, input }) => await service.editCase(ctx, input.slug, input.edit)),
  bulkEdit: protectedProcedure
    .input(scoped.extend({ items: z.array(service.editSchema).min(1).max(15) }))
    .mutation(({ ctx, input }) => service.bulkEdit(ctx, input.slug, input.items)),
  overview: protectedProcedure
    .input(
      scoped.extend({
        days: z.union([z.literal(7), z.literal(14), z.literal(30)]).default(14),
      }),
    )
    .query(async ({ ctx, input }) => await service.overview(ctx, input.slug, input.days)),
  activity: protectedProcedure
    .input(
      scoped.extend({
        q: z.string().max(100).default(''),
        page: z.number().int().min(1).default(1),
      }),
    )
    .query(async ({ ctx, input }) => await service.activity(ctx, input.slug, input.q, input.page)),
  appointments: protectedProcedure
    .input(scoped)
    .query(async ({ ctx, input }) => await service.appointments(ctx, input.slug)),
  patients: protectedProcedure.input(scoped).query(async ({ ctx, input }) => {
    const { clinic } = await service.scope(ctx, input.slug);
    return await all<{
      id: string;
      name: string;
    }>('SELECT id,name FROM patients WHERE clinic_id=? ORDER BY name', clinic.id);
  }),
  saveAppointment: protectedProcedure
    .input(scoped.extend({ appointment: service.appointmentSchema }))
    .mutation(({ ctx, input }) => service.saveAppointment(ctx, input.slug, input.appointment)),
  updateMember: protectedProcedure
    .input(
      scoped.extend({
        id: z.string(),
        role: z.enum(['admin', 'coordinator', 'viewer']),
        active: z.boolean(),
      }),
    )
    .mutation(
      async ({ ctx, input }) =>
        await service.updateMember(ctx, input.slug, input.id, input.role, input.active),
    ),
  settings: protectedProcedure
    .input(scoped.extend({ settings: service.settingsSchema }))
    .mutation(async ({ ctx, input }) => await service.settings(ctx, input.slug, input.settings)),
  preferences: protectedProcedure
    .input(
      scoped.extend({
        appearance: z.enum(['light', 'dark']),
        density: z.enum(['comfortable', 'compact']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await service.scope(ctx, input.slug);
      await run(
        'UPDATE users SET appearance=?,density=? WHERE id=?',
        input.appearance,
        input.density,
        ctx.user.id,
      );
      return { success: true };
    }),
  tableColumns: protectedProcedure
    .input(
      scoped.extend({
        columns: z.partialRecord(
          z.enum([
            'selection',
            'number',
            'patient',
            'type',
            'status',
            'priority',
            'assignee',
            'created_at',
            'updated_at',
          ]),
          z.boolean(),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { clinic } = await service.scope(ctx, input.slug);
      await run(
        'INSERT INTO table_preferences VALUES(?,?,?) ON CONFLICT(clinic_id,user_id) DO UPDATE SET columns=excluded.columns',
        clinic.id,
        ctx.user.id,
        JSON.stringify(input.columns),
      );
      return { success: true };
    }),
  saveView: protectedProcedure
    .input(
      scoped.extend({
        name: z.string().trim().min(1).max(40),
        filters: service.filterSchema,
      }),
    )
    .mutation(
      async ({ ctx, input }) => await service.saveView(ctx, input.slug, input.name, input.filters),
    ),
  deleteView: protectedProcedure
    .input(scoped.extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { clinic } = await service.scope(ctx, input.slug);
      const result = await run(
        'DELETE FROM saved_views WHERE clinic_id=? AND user_id=? AND id=?',
        clinic.id,
        ctx.user.id,
        input.id,
      );
      if (!result.changes) service.fail('NOT_FOUND', 'Saved view not found.');
      return { success: true };
    }),
});
export type AppRouter = typeof appRouter;
