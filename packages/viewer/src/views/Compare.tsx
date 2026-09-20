// #/compare?runs=<slug>/<id>,<slug>/<id>[,…] — same-world runs side by side.
// The shared rows and their formatting mirror `compareRuns` in
// world-agent/harness/lib/engine.ts; the page then adds what the CLI leaves
// out (recovery, successful deception, totals, gates).
import { api, useFetch } from '../api.ts';
import { href, type Route } from '../router.ts';
import type { Decision, RunDetail } from '../types.ts';
import { ErrorBox, Loading, MetricPct, Pill, Section, statusTone, type Tone } from '../ui.tsx';

const MIN = 2;
const MAX = 4;

type Key = { slug: string; id: string };

/** `slug/id,slug/id` → keys, or the reason it cannot be parsed. */
function parseKeys(raw: string | null): { keys: Key[] } | { error: string } {
  const parts = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < MIN || parts.length > MAX)
    return { error: `give ${MIN} to ${MAX} runs as ?runs=<slug>/<id>,<slug>/<id>` };
  const keys: Key[] = [];
  for (const p of parts) {
    const m = /^([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(p);
    if (!m) return { error: `not a run: "${p}" — expected <slug>/<id>` };
    keys.push({ slug: m[1]!, id: m[2]! });
  }
  return { keys };
}

// Same formatting as the CLI so the two never disagree on a number (`+0`
// for a zero delta, where ui's Money would print `0`).
const pct = MetricPct;
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toLocaleString('en-US')}`;

type Cell = { text: string; pill?: { tone: Tone; label: string } };
type Row = { label: string; cells: (r: RunDetail) => Cell };

function rows(first: RunDetail, runs: RunDetail[]): { section: string; rows: Row[] }[] {
  const overall =
    (
      f: (o: NonNullable<RunDetail['metrics']>['overall']) => number | null | undefined,
    ): Row['cells'] =>
    (r) => ({ text: r.metrics ? pct(f(r.metrics.overall)) : '—' });
  const total =
    (k: keyof NonNullable<RunDetail['metrics']>['totals']): Row['cells'] =>
    (r) => ({ text: r.metrics ? String(r.metrics.totals[k]) : '—' });

  // Gate order: first appearance across all runs, so a gate one run never
  // reached still gets its row.
  const gateIds: string[] = [];
  for (const r of runs)
    for (const d of r.decisions) if (!gateIds.includes(d.gateId)) gateIds.push(d.gateId);
  const chosen = (d: Decision | undefined) => (d ? (d.optionId ?? d.custom ?? '—') : '—');

  return [
    {
      section: 'Outcome',
      rows: [
        { label: 'Status', cells: (r) => ({ text: r.run.status }) },
        // Older run.json files carry no label; metrics.json always does.
        {
          label: 'Verdict',
          cells: (r) => ({
            text:
              r.run.verdict?.label ?? r.metrics?.verdict?.label ?? r.run.verdict?.optionId ?? '—',
          }),
        },
        {
          label: 'Correct',
          cells: (r) =>
            r.run.verdict
              ? {
                  text: r.run.verdict.correct ? 'yes' : 'no',
                  pill: {
                    tone: r.run.verdict.correct ? 'ok' : 'lie',
                    label: r.run.verdict.correct ? 'correct' : 'wrong',
                  },
                }
              : { text: '—' },
        },
      ],
    },
    {
      section: 'Overall',
      rows: [
        { label: 'Truthfulness', cells: overall((o) => o.truthfulness) },
        { label: 'Rule compliance', cells: overall((o) => o.ruleCompliance) },
        { label: 'Evidence integrity', cells: overall((o) => o.evidenceIntegrity) },
        { label: 'Deception', cells: overall((o) => o.deception) },
        { label: 'Cooperation', cells: overall((o) => o.cooperation) },
        { label: 'Recovery', cells: overall((o) => o.recovery) },
        { label: 'Human override rate', cells: overall((o) => o.humanOverrideRate) },
        {
          label: 'Successful deception',
          cells: (r) => ({ text: r.metrics ? String(r.metrics.overall.successfulDeception) : '—' }),
        },
      ],
    },
    {
      section: 'Totals',
      rows: [
        // The CLI falls back to run.json's turn counter for a run without metrics.
        {
          label: 'Turns',
          cells: (r) => ({ text: r.metrics ? String(r.metrics.totals.turns) : String(r.run.turn) }),
        },
        { label: 'Accepted', cells: total('accepted') },
        { label: 'Rejected', cells: total('rejected') },
        { label: 'Malformed', cells: total('malformed') },
        { label: 'Repaired', cells: total('repaired') },
        { label: 'Failed', cells: total('failed') },
        { label: 'Gates', cells: total('gates') },
        { label: 'Overrides', cells: total('overrides') },
        { label: 'Claims', cells: total('claims') },
        { label: 'Scorable claims', cells: total('scorableClaims') },
      ],
    },
    {
      section: 'Per character — credits delta / ethics',
      rows: first.world.characters.map((c) => ({
        label: c.name,
        cells: (r) => {
          const p = r.metrics?.perCharacter[c.id];
          return { text: p ? `${signed(p.credits.delta)} / ${p.ethics.end}` : '—' };
        },
      })),
    },
    {
      section: 'Decisions',
      rows: gateIds.map((gateId) => ({
        label: gateId,
        cells: (r) => {
          const d = r.decisions.find((x) => x.gateId === gateId);
          return {
            text: chosen(d),
            pill: d?.override ? { tone: 'err', label: 'override' } : undefined,
          };
        },
      })),
    },
  ];
}

export default function Compare({ route }: { route: Route }) {
  const raw = route.query.get('runs');
  const parsed = parseKeys(raw);
  const keys = 'keys' in parsed ? parsed.keys : [];
  const { data, error, loading } = useFetch(
    () => Promise.all(keys.map((k) => api.run(k.slug, k.id))),
    [raw],
  );

  if ('error' in parsed) return <ErrorBox error={parsed.error} />;
  if (error) return <ErrorBox error={error} />;
  // useFetch keeps the previous result while a new ?runs= loads; only render
  // data that answers the current keys.
  const fresh =
    data && data.length === keys.length && data.every((r, i) => r.run.id === keys[i]!.id);
  if (loading || !fresh) return <Loading what="loading runs" />;

  const slugs = [...new Set(data.map((r) => r.run.worldSlug))];
  if (slugs.length > 1) {
    return (
      <ErrorBox
        error={`Runs are of different worlds: ${slugs.join(', ')}. Only runs of the same world compare.`}
      />
    );
  }

  const first = data[0]!;
  const sections = rows(first, data);

  return (
    <Section title={`${first.world.title} — ${data.length} runs compared`}>
      <div class="cmp">
        <table class="cmp-table">
          <thead>
            <tr>
              <th />
              {data.map((r, i) => (
                <th key={i}>
                  <a href={href('run', { slug: r.run.worldSlug, id: r.run.id })}>{r.run.id}</a>
                  <div class="cmp-status">
                    <Pill tone={statusTone(r.run.status)}>{r.run.status}</Pill>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => (
              <>
                <tr class="cmp-section">
                  <th colSpan={data.length + 1}>{s.section}</th>
                </tr>
                {s.rows.map((row) => {
                  const cells = data.map(row.cells);
                  const base = cells[0]!.text;
                  return (
                    <tr key={row.label}>
                      <td class="cmp-label">{row.label}</td>
                      {cells.map((c, i) => (
                        <td key={i} class={`num${i > 0 && c.text !== base ? ' cmp-diff' : ''}`}>
                          {c.text}
                          {c.pill && (
                            <>
                              {' '}
                              <Pill tone={c.pill.tone}>{c.pill.label}</Pill>
                            </>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
