/**
 * node scripts/validate.ts <world.json>
 *
 * Prints every issue grouped by level. Exit 1 on any error, 0 otherwise —
 * warnings are advice, not a gate. The interview agent runs this before it
 * declares a world done.
 */
import { readFileSync } from 'node:fs';
import { validateWorld, type Issue } from '@aot/interview-agent/schema';

export function validateFile(path: string): { ok: boolean; issues: Issue[] } {
  let input: unknown;
  try {
    input = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { ok: false, issues: [{ level: 'error', path: '', message: `cannot read ${path}: ${(e as Error).message}` }] };
  }
  const { issues } = validateWorld(input);
  return { ok: !issues.some((i) => i.level === 'error'), issues };
}

export function format(path: string, issues: Issue[]): string {
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  const line = (i: Issue) => `  ${i.path || '(root)'}: ${i.message}`;
  const out = [`${path}`];
  if (errors.length) out.push(`${errors.length} error(s)`, ...errors.map(line));
  if (warnings.length) out.push(`${warnings.length} warning(s)`, ...warnings.map(line));
  if (!errors.length && !warnings.length) out.push('valid, no warnings');
  else if (!errors.length) out.push('valid');
  return out.join('\n');
}

// `node scripts/validate.ts` runs this; importing it from a test does not.
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: node scripts/validate.ts <world.json>');
    process.exit(2);
  }
  const { ok, issues } = validateFile(path);
  console.log(format(path, issues));
  process.exit(ok ? 0 : 1);
}
