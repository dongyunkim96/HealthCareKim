import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const clinicSchema = sqliteTable('clinics', {
  id: text('id').primaryKey(),
  demoId: text('demo_id').notNull(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull(),
  accent: text('accent').notNull(),
  startHour: integer('start_hour').notNull(),
  endHour: integer('end_hour').notNull(),
});
const globalDb = globalThis as unknown as {
  clinicDatabase?: Database.Database;
};
const filename = process.env.DATABASE_PATH || './data/healthcarekim.sqlite';
if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
export const sqlite = globalDb.clinicDatabase ?? new Database(filename);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');
if (Number(sqlite.pragma('user_version', { simple: true })) < 2) {
  sqlite.transaction(() =>
    sqlite.exec(readFileSync(path.join(process.cwd(), 'migrations/0001_sqlite.sql'), 'utf8')),
  )();
}
if (process.env.NODE_ENV !== 'production') globalDb.clinicDatabase = sqlite;
export const db = drizzle(sqlite);
export function one<T>(sql: string, ...args: unknown[]): T | undefined {
  return sqlite.prepare(sql).get(...args) as T | undefined;
}
export function all<T>(sql: string, ...args: unknown[]): T[] {
  return sqlite.prepare(sql).all(...args) as T[];
}
export function run(sql: string, ...args: unknown[]) {
  return sqlite.prepare(sql).run(...args);
}
