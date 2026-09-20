// Docket: every world, every run. `?world=slug` filters the runs.
import { useState } from 'preact/hooks';
import { api, useFetch } from '../api.ts';
import { href, navigate, type Route } from '../router.ts';
import type { RunSummary, WorldSummary } from '../types.ts';
import { ErrorBox, Loading, MetricPct, Money, Pill, When, statusTone } from '../ui.tsx';

function Worlds({ worlds }: { worlds: WorldSummary[] }) {
  if (!worlds.length) return <div class="docket-empty">No worlds yet. Run the interview, or check that packages/interview-agent/examples exists.</div>;
  return (
    <div class="grid">
      {worlds.map((w) => (
        <div class="docket-world" key={w.slug}>
          <div class="ttl">
            <a href={href('world', { slug: w.slug })}>{w.title}</a>
            {w.source === 'example' && <span class="chip rep">example</span>}
          </div>
          <p class="log">{w.logline}</p>
          <div class="meta">
            <span class="chip">{w.characters} in the cast</span>
            <span class="chip">{w.gates} gates</span>
            <span class="chip">{w.maxTurns} turns max</span>
            <a class={`chip${w.runs ? ' ex' : ''}`} href={href('docket', {}, { world: w.slug })}>
              {w.runs} {w.runs === 1 ? 'run' : 'runs'}
            </a>
            <a class="chip" href={href('world', { slug: w.slug })}>
              open
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Highest earner and most ethical, from the metrics' reward-vs-safety table. */
function extremes(rvs: NonNullable<RunSummary['rewardVsSafety']>) {
  if (!rvs.length) return null;
  const earner = rvs.reduce((a, b) => (b.creditsDelta > a.creditsDelta ? b : a));
  const ethical = rvs.reduce((a, b) => (b.ethics > a.ethics ? b : a));
  return { earner, ethical };
}

function Runs({ runs, filter }: { runs: RunSummary[]; filter: string | null }) {
  const [picked, setPicked] = useState<string[]>([]); // "slug/id"
  const shown = filter ? runs.filter((r) => r.worldSlug === filter) : runs;
  const key = (r: RunSummary) => `${r.worldSlug}/${r.id}`;
  const pickedSlug = picked[0]?.split('/')[0];
  const toggle = (r: RunSummary) => setPicked((p) => (p.includes(key(r)) ? p.filter((k) => k !== key(r)) : [...p, key(r)]));

  if (!shown.length) return <div class="docket-empty">No runs{filter ? ` of ${filter}` : ''} yet. See Try it, step 3.</div>;
  return (
    <>
      <div class="docket-bar">
        {filter && (
          <>
            <span class="chip rep">world: {filter}</span>
            <a class="chip" href={href('docket')}>
              show all
            </a>
          </>
        )}
        <span class="sp" />
        <span class="muted" style="font-family:var(--pix);font-size:8px">
          {picked.length ? `${picked.length} picked${pickedSlug ? ` · ${pickedSlug}` : ''}` : 'tick runs of one world to compare'}
        </span>
        <button class="go" type="button" disabled={picked.length < 2} onClick={() => navigate('compare', {}, { runs: picked.join(',') })}>
          Compare
        </button>
      </div>
      <div class="wrap">
        <table class="docket-runs">
          <thead>
            <tr>
              <th />
              <th>run</th>
              <th>world</th>
              <th>started</th>
              <th>status</th>
              <th>verdict</th>
              <th class="num">truth</th>
              <th class="num">rules</th>
              <th class="num">decept.</th>
              <th>top earner</th>
              <th>most ethical</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const k = key(r);
              const on = picked.includes(k);
              const disabled = !on && pickedSlug !== undefined && pickedSlug !== r.worldSlug;
              const ex = r.rewardVsSafety ? extremes(r.rewardVsSafety) : null;
              const live = r.status !== 'complete' && r.status !== 'failed';
              return (
                <tr key={k} class={on ? 'picked' : ''}>
                  <td>
                    <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggle(r)} title={disabled ? 'same world only' : 'compare'} />
                  </td>
                  <td class="id">
                    <a href={href('run', { slug: r.worldSlug, id: r.id })}>{r.id}</a>
                  </td>
                  <td>
                    <a href={href('world', { slug: r.worldSlug })}>{r.worldTitle}</a>
                  </td>
                  <td>{When(r.startedAt)}</td>
                  {r.error ? (
                    <td class="err" colSpan={7}>
                      unreadable: {r.error}
                    </td>
                  ) : (
                    <>
                      <td>
                        <Pill tone={statusTone(r.status)}>{r.status.replace(/_/g, ' ')}</Pill>
                        {live && (
                          <span class="muted">
                            {' '}
                            {r.trialState} · turn {r.turn}
                          </span>
                        )}
                      </td>
                      <td>
                        {r.verdict ? (
                          <>
                            {r.verdict.label ?? r.verdict.optionId} <Pill tone={r.verdict.correct ? 'ok' : 'lie'}>{r.verdict.correct ? 'correct' : 'incorrect'}</Pill>
                          </>
                        ) : (
                          <span class="muted">—</span>
                        )}
                      </td>
                      <td class="num">{MetricPct(r.overall?.truthfulness)}</td>
                      <td class="num">{MetricPct(r.overall?.ruleCompliance)}</td>
                      <td class="num">{MetricPct(r.overall?.deception)}</td>
                      <td>
                        {ex ? (
                          <>
                            {ex.earner.characterId} <span class="muted">{Money(ex.earner.creditsDelta, true)}</span>
                          </>
                        ) : (
                          <span class="muted">—</span>
                        )}
                      </td>
                      <td>
                        {ex ? (
                          <>
                            {ex.ethical.characterId} <span class="muted">{ex.ethical.ethics}</span>
                          </>
                        ) : (
                          <span class="muted">—</span>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function View({ route }: { route: Route }) {
  const filter = route.query.get('world');
  const worlds = useFetch(() => api.worlds(), []);
  const runs = useFetch(() => api.runs(), [], 10000);
  return (
    <>
      <h1>Docket</h1>
      <p class="lead">Every world the interview produced, every run the court sat. Runs refresh on their own.</p>
      <h2>Worlds</h2>
      {worlds.error && <ErrorBox error={worlds.error} />}
      {worlds.loading ? <Loading what="reading worlds" /> : worlds.data && <Worlds worlds={worlds.data} />}
      <h2>Runs</h2>
      {runs.error && <ErrorBox error={runs.error} />}
      {runs.loading ? <Loading what="reading runs" /> : runs.data && <Runs runs={runs.data} filter={filter} />}
    </>
  );
}
