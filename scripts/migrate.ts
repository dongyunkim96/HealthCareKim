import nextEnv from '@next/env';
import { readFile } from 'node:fs/promises';
nextEnv.loadEnvConfig(process.cwd());
// Migration tooling uses the direct endpoint; normal application traffic remains pooled.
if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
const { databaseKind, execSQL, closeDatabase } = await import('../src/lib/db');
try {
  const kind = await databaseKind();
  if (kind === 'postgres') await execSQL(await readFile('migrations/postgres/0001.sql', 'utf8'));
  console.log(`Database schema ready (${kind}). No existing workspace data was reset.`);
} finally {
  await closeDatabase();
}
