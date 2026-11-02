import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const { createDemo } = await import('../src/lib/seed');
const { sqlite, one, run } = await import('../src/lib/db');
const result = sqlite
  .transaction(() => {
    sqlite.exec(
      'CREATE TABLE IF NOT EXISTS seed_fixture(key TEXT PRIMARY KEY,demo_id TEXT NOT NULL REFERENCES demo_sessions(id) ON DELETE CASCADE)',
    );
    const existing = one<{ id: string }>(
      "SELECT d.id FROM seed_fixture f JOIN demo_sessions d ON d.id=f.demo_id WHERE f.key='default' AND d.expires_at>?",
      Date.now(),
    );
    if (existing) return { id: existing.id, created: false };
    const demo = createDemo();
    run(
      "INSERT INTO seed_fixture VALUES('default',?) ON CONFLICT(key) DO UPDATE SET demo_id=excluded.demo_id",
      demo.demoId,
    );
    return { id: demo.demoId, created: true };
  })
  .immediate();
console.log(
  `${result.created ? 'Created' : 'Preserved existing'} synthetic fixture ${result.id}. Open /demo for an authenticated, isolated browser workspace. Repeated seed commands preserve this fixture until expiration.`,
);
