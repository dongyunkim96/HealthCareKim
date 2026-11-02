import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { one, run } from './db';
import type { Context, User } from './types';

const authGlobal = globalThis as unknown as { localSessionSecret?: string };
function secret() {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32)
    return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production')
    throw new Error('SESSION_SECRET must contain at least 32 characters in production.');
  return (authGlobal.localSessionSecret ??= randomBytes(32).toString('hex'));
}
export async function cookieSession() {
  return getIronSession<{ sid?: string }>(await cookies(), {
    password: secret(),
    cookieName: 'hck_session',
    ttl: 86400,
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
  });
}
export async function context(): Promise<Context | null> {
  const session = await cookieSession();
  if (!session.sid) return null;
  const row = one<{ id: string; demo_id: string; user_id: string }>(
    'SELECT s.* FROM sessions s JOIN demo_sessions d ON d.id=s.demo_id WHERE s.id=? AND s.expires_at>? AND d.expires_at>?',
    session.sid,
    Date.now(),
    Date.now(),
  );
  if (!row) return null;
  const user = one<User>('SELECT * FROM users WHERE id=?', row.user_id);
  if (!user) return null;
  return { sessionId: row.id, demoId: row.demo_id, user };
}
export function revoke(sid: string) {
  run('DELETE FROM sessions WHERE id=?', sid);
}
