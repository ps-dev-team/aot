/**
 * render.ts <run> — writes <run>/courtroom.html.
 *
 * `lib/rundata.ts` turns the run folder into the viewer's object (and seals the
 * truth until the run is complete); this injects it into viewer/template.html
 * at `/*__RUN_DATA__*\/`. The page is the record, not a second judge.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildRunData } from './lib/rundata.ts';

function main() {
  const runDir = process.argv[2];
  if (!runDir) throw new Error('usage: node harness/render.ts <runDir>');
  const dir = resolve(runDir);
  const data = buildRunData(dir);

  const templatePath = join(import.meta.dirname, '..', 'viewer', 'template.html');
  const template = readFileSync(templatePath, 'utf8');
  const marker = '/*__RUN_DATA__*/';
  if (template.split(marker).length !== 2) throw new Error(`template must contain ${marker} exactly once`);
  // `<` never appears outside a JSON string, so this closes no tag and breaks no JSON.
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const html = template.replace(marker, () => json);
  const path = join(dir, 'courtroom.html');
  writeFileSync(path, html);
  console.log(JSON.stringify({ ok: true, path }, null, 2));
}

try {
  main();
} catch (err) {
  console.log(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
}
