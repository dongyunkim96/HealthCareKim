import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { cookieSession, context, revoke } from '@/lib/auth';
import { createDemo } from '@/lib/seed';
import { transaction, lockDemoCreation, run, one } from '@/lib/db';
import { trustedOrigin } from '@/lib/origin';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  if (!trustedOrigin(req)) return Response.json({ error: 'Origin not allowed' }, { status: 403 });
  try {
    const input = z
      .object({
        action: z.enum(['enter', 'switch', 'reset', 'logout']),
        persona: z.enum(['admin', 'coordinator', 'viewer']).default('admin'),
      })
      .parse(await req.json());
    const current = await context();
    const cookie = await cookieSession();
    if (input.action === 'logout') {
      if (current) await revoke(current.sessionId);
      cookie.destroy();
      return Response.json({ success: true });
    }
    if (input.action === 'switch') {
      if (!current) return Response.json({ error: 'Session expired' }, { status: 401 });
      const user = await one<{
        id: string;
      }>('SELECT id FROM users WHERE demo_id=? AND persona=?', current.demoId, input.persona);
      if (!user) return Response.json({ error: 'Persona unavailable' }, { status: 404 });
      const id = randomUUID();
      await transaction(async () => {
        await revoke(current.sessionId);
        await run(
          'INSERT INTO sessions VALUES(?,?,?,?)',
          id,
          current.demoId,
          user.id,
          Date.now() + 86400000,
        );
      });
      cookie.sid = id;
    } else {
      if (input.action === 'reset' && !current)
        return Response.json({ error: 'Session expired' }, { status: 401 });
      // Delete only the caller's synthetic workspace. Never reset another demo.
      cookie.sid = (
        await transaction(async () => {
          await lockDemoCreation();
          if (current) await run('DELETE FROM demo_sessions WHERE id=?', current.demoId);
          return createDemo(input.persona);
        })
      ).sessionId;
    }
    await cookie.save();
    return Response.json({ success: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Unable to start demo' },
      { status: 400 },
    );
  }
}
