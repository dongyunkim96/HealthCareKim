import fs from 'node:fs/promises';
import path from 'node:path';
const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
let output =
  '# Third-party notices\n\nHealthCareKim is an original implementation. The wordmark icon is original SVG artwork. No commercial template or photography is used.\n\nAccessible dialog, dropdown, button, class composition, and table composition patterns were informed by [shadcn/ui](https://github.com/shadcn-ui/ui) (MIT, copyright shadcn). No full template was copied. shadcn/ui MIT notice:\n\n' +
  (await fs.readFile('docs/licenses/shadcn-ui-MIT.txt', 'utf8')) +
  '\n\nProduction dependencies and their installed license notices follow. Transitive packages retain their own notices in node_modules and distribution bundles. Regenerate this document with `node scripts/notices.mjs` after dependency changes.\n';
for (const name of Object.keys(pkg.dependencies).sort()) {
  const root = path.join('node_modules', name),
    meta = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const repo =
    typeof meta.repository === 'string'
      ? meta.repository
      : (meta.repository?.url ?? meta.homepage ?? '');
  output += `\n## ${name} ${meta.version}\n\nLicense: ${typeof meta.license === 'string' ? meta.license : JSON.stringify(meta.license)}. Source: ${repo.replace(/^git\+/, '').replace(/\.git$/, '')}.\n\n`;
  const files = (await fs.readdir(root)).filter((f) => /^licen[cs]e(\.|$)/i.test(f));
  for (const file of files) {
    if ((await fs.stat(path.join(root, file))).isFile())
      output += '```text\n' + (await fs.readFile(path.join(root, file), 'utf8')).trim() + '\n```\n';
  }
}
await fs.writeFile('THIRD_PARTY_NOTICES.md', output);
console.log('Wrote installed production dependency notices.');
