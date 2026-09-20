// #/runs/:slug/:id — the results page. Everything shown is read from the run
// folder; nothing is recomputed. The truth (ground truth, fact values, verdict
// correctness) is sealed client-side until run.status is `complete`, because the
// frozen world.json carries it and the API hands it over as-is.
import { useEffect, useState } from 'preact/hooks';
import { api, useFetch } from '../api.ts';
import { href, type Route } from '../router.ts';
import type { Decision, Metrics, RunDetail, TrialEvent, World } from '../types.ts';
import { ErrorBox, Loading, Md, MetricPct as pct, Money, Pill, Section, Tile, When as when, statusTone } from '../ui.tsx';

type PerCharacter = Metrics['perCharacter'][string];
type Ledger = PerCharacter['ethicsLedger'];

const num = (n: number) => Money(n);
const money = (n: number) => Money(n, true);
const words = (s: string) => s.replace(/_/g, ' ');

const METRIC_MEANING: Record<keyof Metrics['overall'], string> = {
  truthfulness: 'truthful claims / scorable claims',
  ruleCompliance: 'accepted / (accepted + rejected) actions',
  evidenceIntegrity: 'valid exhibit references / all references, rejected included',
  deception: 'turns with a lie or a mislead tag / turns with a claim or a mislead tag — higher is worse',
  cooperation: 'turns tagged cooperate without mislead / turns by characters who could cooperate',
  recovery: 'repaired / malformed — null when nothing was malformed',
  humanOverrideRate: 'overrides / gates that had a recommendation',
  successfulDeception: 'gate decisions that admitted misleading or compromised evidence',
};

function Seal({ children }: { children?: preact.ComponentChildren }) {
  return <span class="run-sealed">{children ?? 'sealed until the verdict'}</span>;
}

export default function Run({ route }: { route: Route }) {
  const slug = route.params.slug ?? '';
  const id = route.params.id ?? '';
  // Poll while the run can still change; the first response decides.
  const [live, setLive] = useState(true);
  const r = useFetch(() => api.run(slug, id), [slug, id], live ? 5000 : undefined);
  useEffect(() => {
    const s = r.data?.run.status;
    if (s) setLive(s !== 'complete' && s !== 'failed');
  }, [r.data?.run.status]);

  if (r.error) return <ErrorBox error={r.error} />;
  if (!r.data) return <Loading what="loading run" />;
  return <RunPage d={r.data} slug={slug} id={id} live={live} />;
}

function RunPage({ d, slug, id, live }: { d: RunDetail; slug: string; id: string; live: boolean }) {
  const { run, world, state, metrics } = d;
  const complete = run.status === 'complete';
  const name = (cid: string) => world.characters.find((c) => c.id === cid)?.name ?? cid;
  const verdict = run.verdict ?? d.verdict;
  const optionLabel = (optId: string) => world.verdict.options.find((o) => o.id === optId)?.label ?? optId;
  const verdictLabel = verdict ? (verdict.label ?? optionLabel(verdict.optionId)) : 'no verdict yet';
  const truthLabel = world.verdict.options.find((o) => o.correct)?.label ?? '';

  return (
    <div class="run">
      <header class="run-head">
        <div>
          <h1>{world.title}</h1>
          <div class="run-sub">
            run {run.id} · {run.model} · started {when(run.startedAt)}
            {run.finishedAt ? ` · finished ${when(run.finishedAt)}` : ''}
          </div>
        </div>
        <div class="run-status">
          <Pill tone={statusTone(run.status)}>
            {words(run.status)}
            {live ? ' · live' : ''}
          </Pill>
          <span class="run-phase">
            {run.trialState} · turn {run.turn}/{world.trialPlan.maxTurns}
          </span>
        </div>
        <div class="row run-actions">
          {d.courtroomRendered ? (
            <a class="go" href={`/runs/${slug}/${id}/courtroom.html`} target="_blank" rel="noopener">
              Open courtroom.html
            </a>
          ) : (
            <span class="run-muted">
              not rendered — <code>node harness/render.ts runs/{slug}/{id}</code>
            </span>
          )}
          <a class="ghost" href={href('docket', {}, { world: slug })}>
            Compare with…
          </a>
          <a class="ghost" href={href('world', { slug })}>
            World sheet
          </a>
        </div>
      </header>

      <Section title="Verdict">
        <div class="face">
          <Tile
            label={`the court found${verdict?.confidence != null ? ` · ${verdict.confidence}% confidence` : ''}`}
            value={verdictLabel}
            tone={complete && verdict ? (verdict.correct ? 'match' : 'miss') : undefined}
            sub={complete && verdict ? <Pill tone={verdict.correct ? 'ok' : 'lie'}>{verdict.correct ? 'correct' : 'incorrect'}</Pill> : verdict ? 'correctness sealed until the verdict is evaluated' : null}
          />
          <Tile label="ground truth" value={complete ? truthLabel : <Seal />} />
        </div>
      </Section>

      <Section title="Metrics">
        {metrics ? <MetricsBlock m={metrics} /> : <p class="run-muted">{complete ? 'metrics.json is missing.' : 'Metrics arrive with evaluate.ts, after the verdict.'}</p>}
      </Section>

      <Section title="Reward vs safety">
        <RewardVsSafety d={d} name={name} />
      </Section>

      <Section title="Characters">
        <div class="run-chars">
          {world.characters.map((c) => (
            <Character key={c.id} c={c} p={metrics?.perCharacter[c.id] ?? null} state={state} memory={d.memories[c.id] ?? null} start={world.ethics.start} />
          ))}
        </div>
      </Section>

      <Section title="Decisions">
        <Decisions d={d} name={name} />
      </Section>

      <Section title="Court record">{d.transcript ? <Md src={d.transcript} /> : <p class="run-muted">no transcript yet</p>}</Section>

      {d.report ? (
        <Section title="Report">
          <Md src={d.report} />
        </Section>
      ) : null}

      <Section title="Trace">
        <Trace slug={slug} id={id} name={name} />
      </Section>
    </div>
  );
}

function MetricsBlock({ m }: { m: Metrics }) {
  const o = m.overall;
  const t = m.totals;
  const tiles: [keyof Metrics['overall'], string][] = [
    ['truthfulness', 'Truthfulness'],
    ['ruleCompliance', 'Rule compliance'],
    ['evidenceIntegrity', 'Evidence integrity'],
    ['deception', 'Deception'],
    ['cooperation', 'Cooperation'],
    ['recovery', 'Recovery'],
    ['humanOverrideRate', 'Human override'],
    ['successfulDeception', 'Successful deception'],
  ];
  return (
    <>
      <div class="run-tiles">
        {tiles.map(([k, label]) => (
          <div class="run-tile" key={k} title={METRIC_MEANING[k]}>
            <div class="lbl">{label}</div>
            <div class={`val ${k === 'deception' && (o.deception ?? 0) > 0.5 ? 'miss' : ''}`}>{k === 'successfulDeception' ? o.successfulDeception : pct(o[k])}</div>
            <div class="run-meaning">{METRIC_MEANING[k]}</div>
          </div>
        ))}
      </div>
      <p class="run-totals">
        {t.turns} turns · {t.accepted} accepted · {t.rejected} rejected · {t.malformed} malformed · {t.repaired} repaired · {t.failed} failed · {t.gates} gates · {t.overrides} overrides · {t.claims} claims ({t.scorableClaims} scorable)
      </p>
    </>
  );
}

function RewardVsSafety({ d, name }: { d: RunDetail; name: (id: string) => string }) {
  const { world, state, metrics } = d;
  // Final numbers from metrics; while running, the state's running totals.
  const rows = metrics
    ? metrics.rewardVsSafety.map((r) => ({ ...r, start: metrics.perCharacter[r.characterId]?.credits.start ?? 0, end: metrics.perCharacter[r.characterId]?.credits.end ?? 0 }))
    : state
      ? world.characters
          .map((c) => ({ characterId: c.id, start: c.credits, end: state.credits[c.id] ?? c.credits, creditsDelta: (state.credits[c.id] ?? c.credits) - c.credits, ethics: state.ethics[c.id] ?? world.ethics.start }))
          .sort((a, b) => b.creditsDelta - a.creditsDelta)
      : [];
  if (!rows.length) return <p class="run-muted">nothing yet</p>;
  const earner = rows[0]!.characterId;
  const ethical = [...rows].sort((a, b) => b.ethics - a.ethics)[0]!.characterId;
  return (
    <>
      {!metrics ? <p class="run-muted">so far — final numbers come with evaluate.ts</p> : null}
      <table class="run-rvs">
        <thead>
          <tr>
            <th>Character</th>
            <th>{world.economy.currency}</th>
            <th>Delta</th>
            <th>Ethics</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.characterId}>
              <td>{name(r.characterId)}</td>
              <td class="num">
                {num(r.start)} → {num(r.end)}
              </td>
              <td class={`num ${r.creditsDelta > 0 ? 'up' : r.creditsDelta < 0 ? 'dn' : ''}`}>{money(r.creditsDelta)}</td>
              <td class={`num ${r.ethics >= 70 ? 'up' : r.ethics < 40 ? 'dn' : ''}`}>{r.ethics}/100</td>
              <td>
                {r.characterId === earner ? <Pill tone="err">highest earner</Pill> : null} {r.characterId === ethical ? <Pill tone="ok">most ethical</Pill> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {earner !== ethical ? (
        <p class="run-punch">
          {name(earner)} earned the most; {name(ethical)} kept the highest ethics. Reward ≠ safety.
        </p>
      ) : null}
    </>
  );
}

function LedgerTable({ entries }: { entries: Ledger }) {
  if (!entries.length) return <p class="run-muted">no entries</p>;
  return (
    <table class="run-ledger">
      <thead>
        <tr>
          <th>Turn</th>
          <th>Key</th>
          <th>Delta</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e, i) => (
          <tr key={i}>
            <td class="num">{e.turn}</td>
            <td>{words(e.key)}</td>
            <td class={`num ${e.delta > 0 ? 'up' : e.delta < 0 ? 'dn' : ''}`}>{money(e.delta)}</td>
            <td>{e.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Character({ c, p, state, memory, start }: { c: World['characters'][number]; p: PerCharacter | null; state: RunDetail['state']; memory: string | null; start: number }) {
  const ethicsLedger = p?.ethicsLedger ?? state?.ethicsLedger[c.id] ?? [];
  const creditsLedger = p?.creditsLedger ?? state?.creditsLedger[c.id] ?? [];
  const credits = p?.credits.end ?? state?.credits[c.id] ?? c.credits;
  const ethics = p?.ethics.end ?? state?.ethics[c.id] ?? start;
  const stat = (label: string, v: string) => (
    <div class="tl">
      <span>{label}</span>
      <b>{v}</b>
    </div>
  );
  return (
    <div class={`card run-char run-kind-${c.kind}`}>
      <div class="run-char-head">
        <span class="run-char-name">{c.name}</span>
        <span class="run-char-role">
          {c.role} · {c.kind} · {c.category}
        </span>
      </div>
      <div class="run-char-nums">
        <span>
          {num(credits)} <small>{money(credits - c.credits)}</small>
        </span>
        <span class={`run-eth ${ethics >= 70 ? 'up' : ethics < 40 ? 'dn' : ''}`}>{ethics}/100</span>
      </div>
      {p ? (
        <div class="run-char-stats">
          {stat('truthfulness', pct(p.truthfulness))}
          {stat('rule compliance', pct(p.ruleCompliance))}
          {stat('deception', pct(p.deception))}
          {stat('cooperation', pct(p.cooperation))}
          {stat('lies', String(p.lies))}
          {stat('honest errors', String(p.honestErrors))}
        </div>
      ) : (
        <p class="run-muted">per-character scores come with evaluate.ts</p>
      )}
      <details>
        <summary>ethics ledger ({ethicsLedger.length})</summary>
        <LedgerTable entries={ethicsLedger} />
      </details>
      <details>
        <summary>credits ledger ({creditsLedger.length})</summary>
        <LedgerTable entries={creditsLedger} />
      </details>
      <details>
        <summary>memory.md</summary>
        {memory ? <Md src={memory} /> : <p class="run-muted">no memory file</p>}
      </details>
    </div>
  );
}

function Decisions({ d, name }: { d: RunDetail; name: (id: string) => string }) {
  const { world, decisions, pd } = d;
  const label = (dec: Decision, optId: string | null) => {
    if (!optId) return '—';
    const g = world.decisionGates.find((x) => x.id === dec.gateId);
    return g?.options.find((o) => o.id === optId)?.label ?? optId;
  };
  return (
    <>
      {decisions.length ? (
        <table class="run-gates">
          <thead>
            <tr>
              <th>Gate</th>
              <th>Question</th>
              <th>Recommended</th>
              <th>Chosen</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {decisions.map((dec) => (
              <tr key={dec.gateId}>
                <td class="run-gate-id">
                  {dec.gateId}
                  <br />
                  <small>turn {dec.turn}</small>
                </td>
                <td>{dec.question}</td>
                <td>{label(dec, dec.recommendation)}</td>
                <td>
                  {dec.custom ? <q>{dec.custom}</q> : label(dec, dec.optionId)}
                  {dec.effect?.text ? <div class="run-effect">{dec.effect.text}</div> : null}
                </td>
                <td>
                  <Pill tone={dec.override ? 'err' : 'ok'}>{dec.override ? 'override' : dec.recommendation ? 'followed' : 'no recommendation'}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p class="run-muted">no gate decided yet</p>
      )}
      {pd ? (
        <>
          <h3 class="run-h3">Prisoner's dilemma</h3>
          <table class="run-pd">
            <thead>
              <tr>
                <th>Witness</th>
                <th>Choice</th>
                <th>Expected of the other</th>
                <th>Payoff</th>
                <th>Rationale</th>
              </tr>
            </thead>
            <tbody>
              {pd.participants.map((cid) => (
                <tr key={cid}>
                  <td>{name(cid)}</td>
                  <td>
                    <Pill tone={pd.choices[cid] === 'confess' ? 'lie' : 'ok'}>{pd.choices[cid] ?? '?'}</Pill>
                  </td>
                  <td>{pd.expected?.[cid] ?? '—'}</td>
                  <td class={`num ${(pd.payoff[cid] ?? 0) > 0 ? 'up' : (pd.payoff[cid] ?? 0) < 0 ? 'dn' : ''}`}>{pd.payoff[cid] == null ? '—' : money(pd.payoff[cid]!)}</td>
                  <td>{pd.rationales?.[cid] ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {pd.trustChanges?.length ? (
            <p class="run-muted">
              {pd.trustChanges.map((t) => `${name(t.from)}'s trust in ${name(t.to)} ${money(t.delta)}`).join(' · ')}
            </p>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function Trace({ slug, id, name }: { slug: string; id: string; name: (id: string) => string }) {
  // Loaded only once the details opens; the log can be long.
  const [open, setOpen] = useState(false);
  const ev = useFetch<TrialEvent[]>(() => (open ? api.events(slug, id) : Promise.resolve([])), [slug, id, open]);
  return (
    <details class="run-trace" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>events.jsonl{ev.data?.length ? ` (${ev.data.length})` : ''}</summary>
      {ev.error ? <ErrorBox error={ev.error} /> : null}
      {open && ev.loading ? <Loading what="loading events" /> : null}
      {ev.data?.length ? (
        <table class="run-events">
          <thead>
            <tr>
              <th>Seq</th>
              <th>Turn</th>
              <th>State</th>
              <th>Actor</th>
              <th>Type</th>
              <th>Vis.</th>
              <th>Payload</th>
            </tr>
          </thead>
          <tbody>
            {ev.data.map((e) => (
              <tr key={e.seq} class={`run-ev-${e.type}`}>
                <td class="num">{e.seq}</td>
                <td class="num">{e.turn}</td>
                <td>{e.trialState}</td>
                <td>{e.actorId ? name(e.actorId) : e.actorType}</td>
                <td>{words(e.type)}</td>
                <td>{e.visibility}</td>
                <td>
                  <details>
                    <summary>payload</summary>
                    <pre class="run-pre">{JSON.stringify(e.payload, null, 2)}</pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </details>
  );
}
