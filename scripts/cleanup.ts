import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const { cleanup } = await import('../src/lib/seed');
console.log(`Removed ${cleanup()} expired demo workspaces.`);
