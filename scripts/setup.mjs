import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
try {
  await writeFile(
    '.env.local',
    `DATABASE_PATH=./data/healthcarekim.sqlite\nSESSION_SECRET=${randomBytes(48).toString('hex')}\nAPP_ORIGIN=http://127.0.0.1:3000\n`,
    { flag: 'wx' },
  );
  console.log(
    'Created ignored .env.local with a random session secret. Existing environments are never overwritten.',
  );
} catch (error) {
  if (error.code === 'EEXIST') console.log('.env.local already exists; preserved.');
  else throw error;
}
