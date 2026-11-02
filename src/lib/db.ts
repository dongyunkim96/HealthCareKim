import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { sql, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';

type Row = Record<string, unknown>;
type Result = { rows: Row[]; changes: number };
type Executor = {
  query: (text: string, params?: unknown[]) => Promise<Result>;
  exec: (text: string) => Promise<void>;
};
type Adapter = Executor & {
  kind: 'sqlite' | 'postgres' | 'pglite';
  transaction: <T>(fn: (executor: Executor) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
};
type DatabaseState = { active: AsyncLocalStorage<Executor>; adapterPromise?: Promise<Adapter> };
const runtime = globalThis as unknown as { healthcarekimDatabase?: DatabaseState };
const state = (runtime.healthcarekimDatabase ??= { active: new AsyncLocalStorage<Executor>() });
const active = state.active;
const pgDialect = new PgDialect();
const sqliteDialect = new SQLiteSyncDialect();

/** Compile trusted SQL fragments and bound values through Drizzle, never interpolating request values. */
export function compileQuery(text: string, params: unknown[], postgres: boolean) {
  let position = 0,
    last = 0;
  const chunks: SQL[] = [];
  const tokens = /'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g;
  for (const token of text.matchAll(tokens)) {
    if (token[0] !== '?') continue;
    chunks.push(sql.raw(text.slice(last, token.index)), sql`${params[position++]}`);
    last = token.index! + 1;
  }
  chunks.push(sql.raw(text.slice(last)));
  if (position !== params.length) throw new Error('SQL parameter count mismatch.');
  return (postgres ? pgDialect : sqliteDialect).sqlToQuery(sql.join(chunks, sql.raw('')));
}
function mutex() {
  let tail = Promise.resolve();
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    const previous = tail;
    let release!: () => void;
    tail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

async function createAdapter(): Promise<Adapter> {
  if (process.env.DATABASE_URL) {
    const { Pool, neonConfig, types } = await import('@neondatabase/serverless');
    const { default: WebSocket } = await import('ws');
    neonConfig.webSocketConstructor = WebSocket;
    types.setTypeParser(20, (value) => Number(value));
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 1000,
      connectionTimeoutMillis: 15000,
      allowExitOnIdle: true,
    });
    pool.on('error', () =>
      console.error('Idle database connection closed; the next request can reconnect.'),
    );
    const executor = (client: Pick<typeof pool, 'query'>): Executor => ({
      query: async (text, params = []) => {
        const result = await client.query(text, params);
        return { rows: result.rows, changes: result.rowCount ?? 0 };
      },
      exec: async (text) => {
        await client.query(text);
      },
    });
    return {
      ...executor(pool),
      kind: 'postgres',
      transaction: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query("SET LOCAL lock_timeout='10s'");
          const value = await fn(executor(client));
          await client.query('COMMIT');
          return value;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }
  if (process.env.DATABASE_DRIVER === 'pglite') {
    if (process.env.VERCEL)
      throw new Error('PGlite is a local test engine. Set DATABASE_URL for deployment.');
    const { PGlite } = await import('@electric-sql/pglite');
    const { btree_gist } = await import('@electric-sql/pglite/contrib/btree_gist');
    const pg = await PGlite.create({
      dataDir: process.env.PGLITE_DATA_DIR || 'memory://',
      extensions: { btree_gist },
      parsers: { 20: (value) => Number(value) },
    });
    const execute = (client: Pick<typeof pg, 'query' | 'exec'>): Executor => ({
      query: async (text, params = []) => {
        const result = await client.query<Row>(text, params);
        return { rows: result.rows, changes: result.affectedRows ?? 0 };
      },
      exec: async (text) => {
        await client.exec(text);
      },
    });
    await pg.exec(readFileSync(path.join(process.cwd(), 'migrations/postgres/0001.sql'), 'utf8'));
    return {
      ...execute(pg),
      kind: 'pglite',
      transaction: (fn) => pg.transaction((tx) => fn(execute(tx))),
      close: () => pg.close(),
    };
  }
  if (process.env.VERCEL)
    throw new Error(
      'DATABASE_URL is required on Vercel. A local SQLite file cannot persist hosted records.',
    );
  const { default: Database } = await import('better-sqlite3');
  const filename = process.env.DATABASE_PATH || './data/healthcarekim.sqlite';
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const sqlite = new Database(filename);
  sqlite.pragma('journal_mode=WAL');
  sqlite.pragma('foreign_keys=ON');
  sqlite.pragma('busy_timeout=10000');
  if (Number(sqlite.pragma('user_version', { simple: true })) < 2)
    sqlite.transaction(() =>
      sqlite.exec(readFileSync(path.join(process.cwd(), 'migrations/0001_sqlite.sql'), 'utf8')),
    )();
  const locked = mutex();
  const executor: Executor = {
    query: async (text, params = []) => {
      const statement = sqlite.prepare(text);
      return statement.reader
        ? { rows: statement.all(...params) as Row[], changes: 0 }
        : { rows: [], changes: statement.run(...params).changes };
    },
    exec: async (text) => {
      sqlite.exec(text);
    },
  };
  return {
    kind: 'sqlite',
    query: (text, params) => locked(() => executor.query(text, params)),
    exec: (text) => locked(() => executor.exec(text)),
    transaction: (fn) =>
      locked(async () => {
        sqlite.exec('BEGIN IMMEDIATE');
        try {
          const value = await fn(executor);
          sqlite.exec('COMMIT');
          return value;
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        }
      }),
    close: async () => {
      sqlite.close();
    },
  };
}
async function adapter() {
  return (state.adapterPromise ??= createAdapter());
}
export async function databaseKind() {
  return (await adapter()).kind;
}
export async function all<T>(text: string, ...params: unknown[]): Promise<T[]> {
  const db = await adapter();
  const input = db.kind === 'sqlite' ? text : text.replace(/\bLIKE\b/g, 'ILIKE');
  const compiled = compileQuery(input, params, db.kind !== 'sqlite');
  return (await (active.getStore() ?? db).query(compiled.sql, compiled.params)).rows as T[];
}
export async function one<T>(text: string, ...params: unknown[]): Promise<T | undefined> {
  return (await all<T>(text, ...params))[0];
}
export async function run(text: string, ...params: unknown[]) {
  const db = await adapter(),
    compiled = compileQuery(text, params, db.kind !== 'sqlite');
  return {
    changes: (await (active.getStore() ?? db).query(compiled.sql, compiled.params)).changes,
  };
}
export async function execSQL(text: string) {
  const db = await adapter();
  await (active.getStore() ?? db).exec(text);
}
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  if (active.getStore()) return fn();
  return (await adapter()).transaction((executor) => active.run(executor, fn));
}
export async function lockClinic(id: string) {
  if ((await databaseKind()) !== 'sqlite')
    await one('SELECT id FROM clinics WHERE id=? FOR UPDATE', id);
}
export async function lockDemoCreation() {
  if ((await databaseKind()) !== 'sqlite') await one('SELECT pg_advisory_xact_lock(73031001)');
}
export async function closeDatabase() {
  if (state.adapterPromise) await (await state.adapterPromise).close();
  state.adapterPromise = undefined;
}
export async function insertMany(table: string, columns: string[], rows: unknown[][]) {
  if (!/^[a-z_]+$/.test(table) || columns.some((c) => !/^[a-z_]+$/.test(c)))
    throw new Error('Invalid internal SQL identifier.');
  for (let start = 0; start < rows.length; start += 200) {
    const chunk = rows.slice(start, start + 200);
    await run(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES ${chunk.map((row) => `(${row.map(() => '?').join(',')})`).join(',')}`,
      ...chunk.flat(),
    );
  }
}
