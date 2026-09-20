// #/court/:slug/:id — the isometric courtroom over a run folder. A finished
// run replays; a live one plays each turn as it lands and puts gates and the
// verdict to the human here. The player owns the animation; this file owns
// the DOM around it: balloon, HUD, aside, and which modal is up.
import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../api.ts';
import { href, type Route } from '../router.ts';
import { ErrorBox, Loading, Money, Pill, statusTone } from '../ui.tsx';
import { EvidenceModal, GateModal, PdCard, ReportModal, VerdictModal } from '../court/modals.tsx';
import { COURT_ID, H, W, type Pt } from '../court/iso.ts';
import { Player, newEntries, type PlayerState } from '../court/player.ts';
import type { RunData, ScriptEntry, TurnEntry } from '../court/types.ts';

const PHASES = ['opening', 'evidence', 'examination', 'closing', 'verdict', 'reveal'];
const isLive = (d: RunData) => d.run.status !== 'complete' && d.run.status !== 'failed';
const reduced = () => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export default function View({ route }: { route: Route }) {
  const slug = route.params.slug ?? '';
  const id = route.params.id ?? '';
  const [data, setData] = useState<RunData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ps, setPs] = useState<PlayerState | null>(null);
  const [tab, setTab] = useState<'rec' | 'cast' | 'ledger'>('rec');
  const [evidenceOpen, setEvidenceOpen] = useState<string | null>(null);
  const [report, setReport] = useState(false);
  // The gate this browser is ruling on: the asking form stays up from the click until the court line lands.
  const [posted, setPosted] = useState<string | null>(null);
  const [lockedHere, setLockedHere] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const balloon = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  const dataRef = useRef<RunData | null>(null);

  // ---- load, play, stream ------------------------------------------------------
  useEffect(() => {
    let alive = true;
    let close: (() => void) | null = null;
    setData(null);
    setPs(null);
    setError(null);
    // Same component instance across #/court/a → #/court/b: nothing from the last run may carry over.
    setPosted(null);
    setLockedHere(false);
    setReport(false);
    setEvidenceOpen(null);
    api.court(slug, id).then(
      (d) => {
        if (!alive) return;
        dataRef.current = d;
        setData(d);
        const p = new Player(canvas.current, {
          cast: d.cast, ledgers: d.ledgers, pd: d.pd, live: isLive(d), expected: d.expectedActor, reduced: reduced(),
          onRender: (s) => setPs(s),
          onFrame: (pos) => place(balloon.current, pos),
        });
        player.current = p;
        p.load(d.script);
        p.start();
        if (isLive(d)) {
          close = api.stream(slug, id, () => {
            api.court(slug, id).then((n) => {
              if (!alive || !player.current) return;
              const prev = dataRef.current;
              dataRef.current = n;
              setData(n);
              player.current.append(newEntries(prev?.script ?? [], n.script));
              player.current.setExpected(n.expectedActor);
              player.current.setLive(isLive(n));
              // The stream keeps flowing after completion; nothing more can change.
              if (!isLive(n) && close) close();
            }, () => undefined);
          });
        }
      },
      (e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      alive = false;
      close?.();
      player.current?.stop();
      player.current = null;
    };
  }, [slug, id]);

  // The canvas mounts once data and the first state exist; hand it to the player then.
  useEffect(() => {
    player.current?.attach(canvas.current);
  }, [data, ps === null]);

  // ---- derived -------------------------------------------------------------------
  const live = data ? isLive(data) : false;
  const complete = data?.run.status === 'complete';
  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of data?.cast ?? []) m.set(c.id, c.name);
    m.set(COURT_ID, 'The Court');
    return (x: string) => m.get(x) ?? x;
  }, [data]);
  const halt = ps?.halt ?? null;
  const gate = halt?.kind === 'gate' ? (data?.gates.find((g) => g.id === halt.gateId) ?? null) : null;
  const pendingPd = live && data?.pending?.kind === 'pd' && ps?.waiting;
  const askVerdict = live && data?.pending?.kind === 'verdict' && ps?.waiting && !lockedHere;
  const preparing = live && ps?.waiting && (lockedHere || data?.pending?.kind === 'evaluate');
  const modalUp = !!gate || halt?.kind === 'verdict' || !!askVerdict || report || !!evidenceOpen;

  // A posted ruling closes its modal once the refetched gate carries the decision.
  useEffect(() => {
    if (!posted || !data) return;
    if (data.gates.find((g) => g.id === posted)?.decided) {
      setPosted(null);
      player.current?.release();
    }
  }, [posted, data]);
  // Verdict locked here: the reveal opens when the run completes and the player reaches the verdict entry.
  useEffect(() => {
    if (halt?.kind !== 'verdict') return;
    if (lockedHere) setReport(true);
  }, [halt, lockedHere]);

  useEffect(() => {
    if (!data) return;
    document.title = `${report ? 'reveal' : (ps?.phase ?? data.run.trialState)} · turn ${ps?.turn ?? 0}/${data.world.maxTurns} — ${data.world.title}`;
    return () => {
      document.title = 'Agent on Trial';
    };
  }, [data, ps?.phase, ps?.turn, report]);

  // Keyboard: space / enter / → as in the prototype; never while a modal is up.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const p = player.current;
      if (!p || modalUp) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '')) return;
      if (e.key !== ' ' && e.key !== 'Enter' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const s = p.state();
      if (s.mode === 'manual') p.advance();
      else if (e.key === ' ') {
        if (s.playing) p.pause();
        else p.play();
      }
      else {
        p.setMode('manual');
        p.advance();
      }
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [modalUp]);

  if (error) return <div class="court-status"><ErrorBox error={error} /></div>;
  const p = player.current;
  if (!data || !ps || !p) return <div class="court-status"><Loading what="opening the court" /></div>;
  const b = ps.balloon;
  const speaker = b ? p.cast[b.who] : null;
  const evidence = evidenceOpen ? data.evidence[evidenceOpen] : null;
  const chips = (t: TurnEntry) => (
    <>
      {t.ev.map((e) => (
        <button key={e} class="chip ex" onClick={() => setEvidenceOpen(e)}>{e}</button>
      ))}
      {t.repaired ? <span class="chip rep">repaired after 1 retry</span> : null}
      {t.claims.map(([f, s]) => (
        <span key={f + s} class="chip" title={s}>{f}{s === 'deny' ? ' ✕' : s === 'uncertain' ? ' ?' : ''}</span>
      ))}
      {t.tags.filter((x) => x === 'mislead' || x === 'cooperate').map((x) => <span key={x} class="chip tag">{x}</span>)}
    </>
  );

  return (
    <div class="court-page">
      <header class="court-top">
        <a href={href('try')} class="court-brand">Agent on Trial</a>
        <a href={href('run', { slug, id })} class="chip">← run page</a>
        <span class="court-title">{data.world.title}</span>
        <span class="court-id">{data.run.id}</span>
        <span class="sp" />
        <Pill tone={statusTone(data.run.status)}>{data.run.status.replace(/_/g, ' ')}</Pill>
        <Pill tone={live ? 'err' : 'none'}>{live ? 'live' : 'replay'}</Pill>
      </header>

      <div class="court-app">
        <div class="court-stage">
          <div class="court-room">
            <div class="court-frame">
              <canvas ref={canvas} width={W} height={H} aria-label="Isometric courtroom" />
              {ps.mode === 'manual' && ps.canAdvance ? <button class="court-tap" aria-label="Continue to the next turn" onClick={() => p.advance()} /> : null}
              <div class="court-overlay">
                {b && speaker && !(halt?.kind === 'pd') ? (
                  <div ref={balloon} class={`balloon k-${speaker.look.kind}`}>
                    <div class="nm">{speaker.name} · {speaker.role}</div>
                    <div class="tx">
                      {b.text.slice(0, Math.floor(b.typed))}
                      {b.done ? null : <span class="caret" />}
                    </div>
                    {b.done && b.entry && (b.entry.ev.length || b.entry.claims.length || b.entry.repaired || b.entry.tags.length) ? <div class="meta">{chips(b.entry)}</div> : null}
                    {ps.mode === 'manual' && ps.canAdvance ? <div class="cont">{b.done ? 'continue ▸' : 'tap to skip ▸'}</div> : null}
                  </div>
                ) : null}
                {halt?.kind === 'pd' || pendingPd ? (
                  <div class="court-slot">
                    <PdCard pd={halt?.kind === 'pd' ? data.pd : undefined} participants={data.pd?.participants ?? []} names={names} />
                    {halt?.kind === 'pd' ? <button class="go court-slot-go" onClick={() => p.release()}>Continue</button> : null}
                  </div>
                ) : null}
                {ps.waiting && !pendingPd && !askVerdict ? (
                  <div class="court-slot court-waitline">
                    {preparing ? 'the court is preparing the reveal' : `the clerk is working — ${ps.expected ? names(ps.expected) : 'the cast'} is thinking`}
                    <span class="caret" />
                  </div>
                ) : null}
              </div>
              {gate ? (
                <GateModal
                  gate={posted === gate.id ? { ...gate, decided: undefined } : gate}
                  live={live && (!gate.decided || posted === gate.id)}
                  onDecide={live && (!gate.decided || posted === gate.id) ? async (body) => {
                    setPosted(gate.id);
                    try {
                      await api.decide(slug, id, body.custom !== undefined ? { gateId: gate.id, custom: body.custom } : { gateId: gate.id, optionId: body.optionId ?? '' });
                    } catch (e) {
                      setPosted(null);
                      throw e;
                    }
                  } : undefined}
                  onContinue={() => p.release()}
                />
              ) : null}
              {halt?.kind === 'verdict' && !lockedHere && !report ? (
                <VerdictModal question={data.world.verdict.question} options={data.world.verdict.options} recorded={data.verdict} onContinue={() => setReport(true)} />
              ) : null}
              {askVerdict ? (
                <VerdictModal
                  question={data.world.verdict.question}
                  options={data.world.verdict.options}
                  onLock={async (body) => {
                    await api.verdict(slug, id, body);
                    setLockedHere(true);
                  }}
                  onContinue={() => undefined}
                />
              ) : null}
              {report ? (
                <ReportModal
                  data={data}
                  runHref={href('run', { slug, id })}
                  onClose={() => {
                    setReport(false);
                    p.setPhase('reveal');
                    p.release();
                  }}
                />
              ) : null}
              {evidence ? <EvidenceModal id={evidenceOpen!} evidence={evidence} status={evidence.status} revealed={!!complete} onClose={() => setEvidenceOpen(null)} /> : null}
            </div>
          </div>

          <div class="court-hud">
            <div class="court-seg">
              <button class={`court-sbtn${ps.mode === 'auto' ? ' on' : ''}`} onClick={() => p.setMode('auto')}>Auto</button>
              <button class={`court-sbtn${ps.mode === 'manual' ? ' on' : ''}`} onClick={() => p.setMode('manual')}>Manual</button>
            </div>
            {ps.mode === 'auto' ? (
              <button class="court-pbtn" disabled={ps.ended} onClick={() => (ps.playing ? p.pause() : p.play())}>
                {ps.ended ? 'Done' : ps.playing ? 'Pause' : 'Resume'}
              </button>
            ) : (
              <button class="court-pbtn" disabled={!ps.canAdvance} onClick={() => p.advance()}>Next turn ▸</button>
            )}
            <div class="phases">
              {PHASES.map((ph) => {
                const a = PHASES.indexOf(ph);
                const cur = PHASES.indexOf(ps.phase);
                return <span key={ph} class={`ph${a < cur ? ' done' : ''}${a === cur ? ' now' : ''}`}>{ph}</span>;
              })}
            </div>
            <span class="sp" />
            {ps.mode === 'manual' ? <span class="court-hint">click the room or press space</span> : null}
            <span>turn <b>{ps.turn}</b>/{data.world.maxTurns}</span>
          </div>
        </div>

        <aside class="court-aside">
          <div class="court-atabs">
            {(['rec', 'cast', 'ledger'] as const).map((t) => (
              <button key={t} class={`court-atab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>{{ rec: 'Record', cast: 'Cast', ledger: 'Ledger' }[t]}</button>
            ))}
          </div>
          {tab === 'rec' ? <Record entries={ps.record} names={names} cast={p.cast} chips={chips} /> : null}
          {tab === 'cast' ? (
            <div class="court-apane">
              <h4>Agents in session</h4>
              {data.cast.map((c) => {
                const cls = ps.speaker === c.id ? 'live' : ps.spoke.has(c.id) ? 'spoke' : '';
                return (
                  <div key={c.id} class={`agent ${cls}`}>
                    <span class="dot" />
                    <span class={`nm k-${c.kind}`}>{c.name} <small>· {c.role}</small></span>
                    <span class="st">{ps.speaker === c.id ? 'speaking' : ps.spoke.has(c.id) ? 'idle' : 'cold'}</span>
                  </div>
                );
              })}
              <h4 class="mt">Exhibits</h4>
              {Object.entries(data.evidence).map(([eid, e]) => {
                const open = ps.seen.has(eid) || ps.phase === 'reveal';
                return (
                  <button key={eid} class="court-ex" disabled={!open} onClick={() => setEvidenceOpen(eid)}>
                    <span class="id">{eid}</span>{e.title}{open ? null : <span class="lk">sealed</span>}
                  </button>
                );
              })}
            </div>
          ) : null}
          {tab === 'ledger' ? (
            <div class="court-apane">
              <h4>Credits and ethics</h4>
              {data.cast.map((c) => {
                const cr = ps.credits[c.id] ?? 0;
                const d = cr - (data.ledgers.credits[c.id] ?? 0);
                const eth = ps.ethics[c.id] ?? 100;
                return (
                  <div key={c.id} class="court-lrow">
                    <div class={`tl${eth < 50 ? ' bad' : ''}`}>
                      <span class={`k-${c.kind}`}>{c.name}</span>
                      <b>{eth}/100</b>
                    </div>
                    <div class="tl">
                      <span>{Money(cr)} {data.world.currency}</span>
                      <b class={d > 0 ? 'court-up' : d < 0 ? 'court-dn' : ''}>{d ? Money(d, true) : '—'}</b>
                    </div>
                    {ps.lastNote[c.id] ? <div class="court-note">{ps.lastNote[c.id]}</div> : null}
                  </div>
                );
              })}
              <h4 class="mt">Session</h4>
              <div class="tl"><span>turns</span><b>{ps.counts.turns}</b></div>
              <div class={`tl${ps.counts.rejected ? ' bad' : ''}`}><span>rejected</span><b>{ps.counts.rejected}</b></div>
              <div class={`tl${ps.counts.errors ? ' bad' : ''}`}><span>malformed / failed</span><b>{ps.counts.errors}</b></div>
              <div class="tl"><span>repaired</span><b>{ps.counts.repaired}</b></div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/** Puts the balloon over the speaker's head; called every frame, outside Preact. */
function place(el: HTMLDivElement | null, pos: Pt | null): void {
  if (!el || !pos) return;
  el.style.left = `${Math.max(22, Math.min(78, pos[0]))}%`;
  el.style.top = `${Math.max(14, pos[1])}%`;
}

function Record({ entries, names, cast, chips }: { entries: ScriptEntry[]; names: (id: string) => string; cast: Player['cast']; chips: (t: TurnEntry) => JSX.Element }) {
  const pane = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = pane.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);
  let n = 0;
  return (
    <div ref={pane} class="court-apane rec">
      {entries.map((e, i) => {
        if (e.kind === 'error' || e.kind === 'rejected') {
          return (
            <div key={i} class={`turn sys ${e.kind}`}>
              <div class="ln">—</div>
              <div><p class="said">{e.text}</p></div>
            </div>
          );
        }
        if (e.kind !== 'turn' && e.kind !== 'court') return null;
        n++;
        const who = e.kind === 'court' ? COURT_ID : e.who;
        const kind = cast[who]?.look.kind ?? 'human';
        return (
          <div key={i} class="turn">
            <div class="ln">{n}</div>
            <div>
              <div class={`who ${kind}`}>{names(who)}</div>
              <p class="said">{e.text}</p>
              {e.kind === 'turn' && (e.ev.length || e.claims.length || e.repaired) ? <div class="meta">{chips(e)}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
