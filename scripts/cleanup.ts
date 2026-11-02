import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const { cleanup } = await import('../src/lib/seed');
console.log(`Removed ${await cleanup()} expired demo workspaces.`);
const { closeDatabase } = await import('../src/lib/db');
await closeDatabase();
