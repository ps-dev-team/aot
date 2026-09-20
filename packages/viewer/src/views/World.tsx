// #/worlds/:slug — the world file made legible. Ground truth, fact truth,
// evidence integrity, hidden agendas and the correct verdict sit behind one
// Reveal toggle; sealed values render as a chip, never as a blank.
import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { api, useFetch } from '../api.ts';
import { href, type Route } from '../router.ts';
import type { World } from '../types.ts';
import { ErrorBox, Loading, Money, Pill, Section } from '../ui.tsx';

type Character = World['characters'][number];
type Knowledge = Character['knowledge'][number];
type Gate = World['decisionGates'][number];

const money = (n: number) => Money(n);
const signed = (n: number) => Money(n, true);
const words = (s: string) => s.replace(/_/g, ' ');

// ---- local helpers (dedupe into ui.tsx once it lands) ------------------------

function Sealed() {
  return <span class="chip world-sealed">sealed</span>;
}

/** The value, or the seal. `children` is rendered only when revealed. */
function Seal({ open, children }: { open: boolean; children: ComponentChildren }) {
  return open ? <>{children}</> : <Sealed />;
}

function Chips({ items, cls = '' }: { items: readonly string[]; cls?: string }) {
  return (
    <span class="world-chips">
      {items.map((x) => (
        <span key={x} class={`chip ${cls}`}>{words(x)}</span>
      ))}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="world-row">
      <span class="lbl">{label}</span>
      <div class="world-row-val">{children}</div>
    </div>
  );
}

/** Access → colour: knows brass, believes ink-soft, suspects teal, does_not_know ink-faint. */
function KnowledgeChip({ k, open, world }: { k: Knowledge; open: boolean; world: World }) {
  const fact = world.facts.find((f) => f.id === k.factId);
  const stance = k.access === 'does_not_know' ? '?' : (k.beliefStance ?? '?');
  return (
    <span class={`chip world-k world-k-${k.access}`} title={fact?.statement ?? k.factId}>
      {k.factId} · {words(k.access)} · {stance}
      {k.source && (
        <>
          {' · '}
          <Seal open={open}>
            <i>{k.source}</i>
          </Seal>
        </>
      )}
    </span>
  );
}

function CharacterCard({ c, world, open }: { c: Character; world: World; open: boolean }) {
  const name = (id: string) => world.characters.find((x) => x.id === id)?.name ?? id;
  return (
    <article class={`card world-char world-kind-${c.kind}`}>
      <h3>
        {c.name} <span class="chip">{c.id}</span>
      </h3>
      <p class="ctx">{c.role}</p>
      <div class="world-chips">
        <span class={`chip ${c.kind === 'robot' ? 'world-robot' : ''}`}>{c.kind}</span>
        <span class="chip">{c.category}</span>
        <span class="chip rep">{money(c.credits)} {world.economy.currency}</span>
      </div>
      <Row label="profile">{c.publicProfile}</Row>
      {c.voice && <Row label="voice">{c.voice}</Row>}
      <Row label="rules">
        <ul class="world-list">
          {c.rules.map((r) => <li key={r}>{r}</li>)}
          {c.kind === 'robot' && world.laws.map((l) => <li key={l} class="world-law">{l} <span class="chip">law</span></li>)}
        </ul>
      </Row>
      <Row label="goal">{c.goal}</Row>
      <Row label="hidden agenda">{c.hiddenAgenda ? <Seal open={open}>{c.hiddenAgenda}</Seal> : <span class="chip">none</span>}</Row>
      <Row label="incentives">
        <ul class="world-list">{c.incentives.map((x) => <li key={x}>{x}</li>)}</ul>
      </Row>
      <Row label="constraints">
        <ul class="world-list">{c.constraints.map((x) => <li key={x}>{x}</li>)}</ul>
      </Row>
      <Row label="allowed actions"><Chips items={c.allowedActions} /></Row>
      <Row label="knowledge">
        {c.knowledge.length ? (
          <span class="world-chips">{c.knowledge.map((k) => <KnowledgeChip key={k.factId} k={k} open={open} world={world} />)}</span>
        ) : <span class="chip">nothing beyond the public record</span>}
      </Row>
      <Row label="relationships">
        {c.relationships.length ? (
          <table class="world-rel">
            <tbody>
              {c.relationships.map((r) => (
                <tr key={r.characterId}>
                  <td>{name(r.characterId)}</td>
                  <td class="num">{r.trust}/100</td>
                  <td>{r.note ? <Seal open={open}>{r.note}</Seal> : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <span class="chip">defaults (50)</span>}
      </Row>
    </article>
  );
}

function trigger(g: Gate): string {
  const t = g.trigger;
  const parts: string[] = [];
  if (t.atPhaseStart) parts.push(`at start of ${g.phase}`);
  if (t.afterEvidenceIntroduced) parts.push(`after ${t.afterEvidenceIntroduced} is introduced`);
  if (t.afterCharacterSpeaks) parts.push(`after ${t.afterCharacterSpeaks} speaks`);
  if (t.afterTurn !== undefined) parts.push(`after turn ${t.afterTurn}`);
  return parts.join(' · ');
}

function GateCard({ g }: { g: Gate }) {
  return (
    <article class="card world-gate">
      <h3>
        {g.id} <span class="chip">{g.phase}</span> <span class="chip">{trigger(g)}</span>
      </h3>
      <p class="world-q">{g.question}</p>
      <p class="ctx">{g.context}</p>
      {g.options.map((o) => (
        <div key={o.id} class={`opt ${o.id === g.recommendation ? 'sel' : ''}`}>
          {o.label} <span class="chip">{o.id}</span>{' '}
          {o.id === g.recommendation && <Pill tone="ok">recommended</Pill>}
          <span class="eff">
            {words(o.effect.kind)}{o.effect.targetId ? ` ${o.effect.targetId}` : ''} — “{o.effect.text}”
          </span>
        </div>
      ))}
      <div class="world-chips">
        <span class="chip">{g.allowCustomInstruction ? 'custom instruction allowed' : 'options only'}</span>
      </div>
    </article>
  );
}

function PayoffGrid({ world }: { world: World }) {
  const pd = world.prisonersDilemma!;
  const [a, b] = pd.participants;
  const name = (id: string) => world.characters.find((x) => x.id === id)?.name ?? id;
  const cell = (t: [number, number]) => (
    <div class="world-pd-cell">
      <span>{name(a)} {signed(t[0])}</span>
      <span>{name(b)} {signed(t[1])}</span>
    </div>
  );
  return (
    <div class="world-pd">
      <div class="world-pd-corner lbl">{name(a)} ↓ · {name(b)} →</div>
      <div class="lbl">confess</div>
      <div class="lbl">silent</div>
      <div class="lbl">confess</div>
      {cell(pd.payoff.both_confess)}
      {cell(pd.payoff.confess_silent)}
      <div class="lbl">silent</div>
      {cell(pd.payoff.silent_confess)}
      {cell(pd.payoff.both_silent)}
    </div>
  );
}

// ---- the view ----------------------------------------------------------------

export default function View({ route }: { route: Route }) {
  const slug = route.params.slug ?? '';
  const { data, error, loading } = useFetch(() => api.world(slug), [slug]);
  const [open, setOpen] = useState(false);

  if (loading) return <Loading what={`loading ${slug}`} />;
  if (error || !data) return <ErrorBox error={error ?? 'no such world'} />;
  const world = data;

  const name = (id: string) => world.characters.find((x) => x.id === id)?.name ?? id;
  const { economy: eco, ethics, groundTruth: gt, trialPlan: plan } = world;
  const amountRows = (o: Record<string, number>, fmt: (n: number) => string) =>
    Object.entries(o).map(([k, v]) => (
      <tr key={k}>
        <td>{words(k)}</td>
        <td class="num">{fmt(v)}</td>
      </tr>
    ));
  const factRef = (ids: readonly string[]) => (ids.length ? <Chips items={ids} /> : <span class="chip">—</span>);

  return (
    <div class="world">
      <header class="world-head">
        <div>
          <h4>World · {world.slug} · schema {world.schemaVersion}</h4>
          <h1 class="world-title">{world.title}</h1>
          <p class="world-logline">{world.logline}</p>
          <div class="world-chips">
            <span class="chip">{words(world.tone)}</span>
            <span class="chip">{world.characters.length} in the cast</span>
            <span class="chip">{world.facts.length} facts</span>
            <span class="chip">{world.evidence.length} exhibits</span>
            <span class="chip">{world.decisionGates.length} gates</span>
            <span class="chip">{plan.maxTurns} turns max</span>
          </div>
        </div>
        <div class="row world-actions">
          <a class="ghost" href={href('docket', {}, { world: world.slug })}>Runs of this world</a>
          <button type="button" class={open ? 'go' : 'ghost'} onClick={() => setOpen(!open)} aria-pressed={open}>
            {open ? 'Revealed — hide' : 'Reveal'}
          </button>
        </div>
      </header>

      <Section title="The case">
        <p class="world-q">{world.centralQuestion}</p>
        <Row label="setting">{world.setting}</Row>
        <Row label="public case summary">{world.publicCaseSummary}</Row>
        <Row label="laws">
          {world.laws.length ? <ol class="world-list">{world.laws.map((l) => <li key={l}>{l}</li>)}</ol> : <span class="chip">none</span>}
        </Row>
      </Section>

      <Section title="Economy and ethics">
        <div class="world-cols">
          <table>
            <thead><tr><th>reward ({eco.currency})</th><th class="num">amount</th></tr></thead>
            <tbody>{amountRows(eco.rewards, (n) => `+${money(n)}`)}</tbody>
          </table>
          <table>
            <thead><tr><th>penalty ({eco.currency})</th><th class="num">amount</th></tr></thead>
            <tbody>{amountRows(eco.penalties, (n) => `−${money(n)}`)}</tbody>
          </table>
          <table>
            <thead><tr><th>ethics (start {ethics.start})</th><th class="num">delta</th></tr></thead>
            <tbody>{amountRows(ethics.deltas, (n) => (n >= 0 ? `+${n}` : `−${-n}`))}</tbody>
          </table>
        </div>
      </Section>

      <Section title="Cast">
        <div class="world-cast">
          {world.characters.map((c) => <CharacterCard key={c.id} c={c} world={world} open={open} />)}
        </div>
      </Section>

      <Section title="Facts">
        <table>
          <thead>
            <tr><th>id</th><th>statement</th><th>materiality</th><th>public at start</th><th>truth</th></tr>
          </thead>
          <tbody>
            {world.facts.map((f) => (
              <tr key={f.id}>
                <td class="world-id">{f.id}</td>
                <td>{f.statement}</td>
                <td><span class={`chip world-mat-${f.materiality}`}>{f.materiality}</span></td>
                <td>{f.publicAtStart ? <span class="chip">public</span> : ''}</td>
                <td><Seal open={open}><Pill tone={f.truth === 'true' ? 'ok' : f.truth === 'false' ? 'lie' : 'none'}>{f.truth}</Pill></Seal></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Evidence">
        <div class="world-evidence">
          {world.evidence.map((e) => (
            <article key={e.id} class="world-exhibit">
              <div class="world-exhibit-head">
                <span class="world-id">{e.id}</span> <b>{e.title}</b>{' '}
                <span class="chip">{words(e.kind)}</span>{' '}
                <span class="chip">reliability {e.reliability}</span>{' '}
                <span class="chip">from {e.availableFromPhase}</span>
              </div>
              <p>{e.description}</p>
              <Row label="supports">{factRef(e.supportsFactIds)}</Row>
              <Row label="contradicts">{factRef(e.contradictsFactIds)}</Row>
              <Row label="known by">{e.knownByCharacterIds.length ? <Chips items={e.knownByCharacterIds.map(name)} /> : <span class="chip">nobody before it is introduced</span>}</Row>
              <Row label="integrity">
                <Seal open={open}><span class={`integ world-integ ${e.integrity}`}>{e.integrity}</span></Seal>
              </Row>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Decision gates">
        {world.decisionGates.length ? (
          <div class="world-gates">{world.decisionGates.map((g) => <GateCard key={g.id} g={g} />)}</div>
        ) : <span class="chip">none — the judge only gives the verdict</span>}
      </Section>

      <Section title="Prisoner’s dilemma">
        {world.prisonersDilemma ? (
          <>
            <Row label="participants"><Chips items={world.prisonersDilemma.participants.map(name)} cls="world-robot" /></Row>
            <Row label="prompt"><span class="world-quote">{world.prisonersDilemma.prompt}</span></Row>
            <Row label={`payoff (${eco.currency})`}><PayoffGrid world={world} /></Row>
          </>
        ) : <span class="chip">none</span>}
      </Section>

      <Section title="Trial plan">
        <div class="phases world-phases">
          {(['opening', 'evidence', 'examination', 'closing'] as const).map((id) => {
            const p = plan.phases.find((x) => x.id === id);
            return (
              <div key={id} class="ph world-ph">
                <div>{id}</div>
                <div class="world-ph-budget">{p ? `${p.turns} turns` : '—'}</div>
                <div class="world-ph-order">{p?.order.map(name).join(' → ')}</div>
              </div>
            );
          })}
        </div>
        <p class="world-note">
          {plan.phases.reduce((n, p) => n + p.turns, 0)} budgeted of {plan.maxTurns} max. Each phase cycles its order until its budget is spent.
        </p>
      </Section>

      <Section title="Verdict">
        <p class="world-q">{world.verdict.question}</p>
        {world.verdict.options.map((o) => (
          <div key={o.id} class={`opt ${open && o.correct ? 'sel' : ''}`}>
            {o.label} <span class="chip">{o.id}</span>{' '}
            <Seal open={open}>{o.correct ? <Pill tone="ok">correct</Pill> : <Pill>incorrect</Pill>}</Seal>
          </div>
        ))}
      </Section>

      <Section title="Ground truth">
        {open ? (
          <>
            <Row label="summary">{gt.summary}</Row>
            <Row label="responsible"><Chips items={gt.responsibleCharacterIds.map(name)} cls="world-lie" /></Row>
            <Row label="timeline">
              {gt.timeline.map((t, i) => (
                <div key={i} class="tl">
                  <b>{t.time}</b>
                  <span class="world-tl-desc">{t.description}{t.characterIds.length ? ` — ${t.characterIds.map(name).join(', ')}` : ''}</span>
                </div>
              ))}
            </Row>
            <Row label="reveal">
              {gt.reveal.map((p, i) => <p key={i} class="world-reveal-p">{p}</p>)}
            </Row>
          </>
        ) : (
          <p class="world-note">
            <Sealed /> summary, responsible characters, timeline ({gt.timeline.length} events) and reveal ({gt.reveal.length} paragraphs). Press Reveal.
          </p>
        )}
      </Section>
    </div>
  );
}
