// Argument parsing and the one-JSON-object-on-stdout discipline every command
// follows. Chatter goes to stderr; failures print { error } and exit 1.

export type Args = {
  positional: string[];
  /** Last value wins for `flag`; `all` returns every occurrence. */
  flag: (name: string) => string | undefined;
  all: (name: string) => string[];
  has: (name: string) => boolean;
};

export function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags = new Map<string, string[]>();
  const push = (k: string, v: string) => flags.set(k, [...(flags.get(k) ?? []), v]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) {
      positional.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    if (eq > 0) {
      push(a.slice(2, eq), a.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    // A bare flag before another flag (or at the end) is boolean.
    if (next === undefined || (next.startsWith('--') && next.length > 2)) push(a.slice(2), '');
    else push(a.slice(2), argv[++i]!);
  }
  return {
    positional,
    flag: (n) => flags.get(n)?.at(-1),
    all: (n) => flags.get(n) ?? [],
    has: (n) => flags.has(n),
  };
}

export function out(json: unknown): void {
  process.stdout.write(JSON.stringify(json, null, 2) + '\n');
}

export function fail(message: string): never {
  process.stdout.write(JSON.stringify({ error: message }) + '\n');
  process.exit(1);
}

/** Wraps a command body: parses argv, prints its result, maps throws to `fail`. */
export async function command(body: (args: Args) => unknown | Promise<unknown>): Promise<void> {
  try {
    out(await body(parseArgs(process.argv.slice(2))));
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

/** Reads a whole stream; used for `propose.ts … -`. */
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks).toString('utf8');
}
