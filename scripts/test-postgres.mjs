import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_DRIVER: 'pglite', DATABASE_URL: '' },
});
child.on('exit', (code) => (process.exitCode = code ?? 1));
