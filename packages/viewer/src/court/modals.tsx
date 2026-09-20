// The human's side of the court: gate rulings, the verdict, the reveal, and the
// exhibit card. Rendered inside the stage's `.frame` (absolute), not the page.
// A gate or verdict modal cannot be dismissed — the trial waits on it; the
// evidence modal can (Esc, scrim). POSTs are the parent's (`onDecide`, `onLock`);
// this file only shows their outcome: in flight, error inline, or done.
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { RunData } from '@aot/world-agent/rundata';
import { MetricTiles, Money, Pill, RewardTable, Tile, raisedByText } from '../ui.tsx';

type Gate = RunData['gates'][number];
type Verdict = NonNullable<RunData['verdict']>;
type Evidence = RunData['evidence'][string];

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * `.scrim` + `.card`. With `onDismiss`, Esc and a click on the scrim close it; without, nothing does.
 * With `onEnter`, space / Enter act as the card's one Continue button (read-only modals in a replay).
 */
function Modal({ children, onDismiss, onEnter, wide }: { children: ComponentChildren; onDismiss?: () => void; onEnter?: () => void; wide?: boolean }) {
  useEffect(() => {
    if (!onDismiss && !onEnter) return;
    const on = (e: KeyboardEvent) => {
      if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test((e.target as HTMLElement)?.tagName ?? '')) return;
      if (e.key === 'Escape' && onDismiss) {
        e.preventDefault();
        onDismiss();
      } else if ((e.key === ' ' || e.key === 'Enter') && onEnter) {
        e.preventDefault();
        onEnter();
      }
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [onDismiss, onEnter]);
  return (
    <div class="scrim" onClick={(e) => onDismiss && e.target === e.currentTarget && onDismiss()}>
      <div class={`card${wide ? ' court-wide' : ''}`}>{children}</div>
    </div>
  );
}

function Err({ error }: { error: string | null }) {
  return error ? <p class="court-err">{error}</p> : null;
}

// ---- gate -------------------------------------------------------------------

type Body = { optionId?: string; custom?: string };

type GateProps = { gate: Gate; live: boolean; name?: (id: string) => string; onDecide?: (body: Body) => Promise<void>; onContinue: () => void };

/** Keyed on the gate id so in-flight/error state never leaks from one gate to the next when the parent reuses the slot. */
export function GateModal(props: GateProps) {
  return <GateModalFor key={props.gate.id} {...props} />;
}

function GateModalFor({ gate, live, name = (x) => x, onDecide, onContinue }: GateProps) {
  const [busy, setBusy] = useState<Body | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const rec = gate.options.find((o) => o.id === gate.recommendation) ?? null;
  const d = gate.decided;
  const asking = live && !!onDecide && !d;

  const decide = async (body: Body) => {
    if (busy || !onDecide) return;
    setBusy(body);
    setError(null);
    try {
      await onDecide(body);
      setDone(true); // stays up until the parent sees the court line land and unmounts us
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  if (asking) {
    return (
      <Modal>
        <h3>The court asks for a ruling</h3>
        <p class="ctx">
          <b class="court-q">{gate.question}</b>
          <br />
          {gate.context}
          {gate.raisedBy ? <span class="court-raised">{raisedByText(gate.raisedBy, name)}</span> : null}
        </p>
        {rec ? (
          <div class="rec2">
            The bench advises: <b>{rec.label}</b> <Pill tone="ok">recommendation</Pill>
            {gate.recommendationReason ? <span class="court-reason">{gate.recommendationReason}</span> : null}
          </div>
        ) : (
          // The bench subagent is still reading the record; the judge need not wait for it.
          <div class="rec2 court-considering">the bench is considering…</div>
        )}
        {gate.options.map((o) => (
          <button key={o.id} class={`opt${busy?.optionId === o.id ? ' sel' : ''}`} disabled={!!busy || done} onClick={() => decide({ optionId: o.id })}>
            {o.label}
            {o.id === gate.recommendation ? (
              <>
                {' '}
                <Pill tone="ok">recommended</Pill>
              </>
            ) : null}
            <span class="eff">{o.effect.text}</span>
          </button>
        ))}
        <div class="row">
          <input type="text" id="cust" placeholder="Or instruct the court in one sentence" maxLength={500} value={custom} disabled={!!busy || done} onInput={(e) => setCustom((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && custom.trim() && void decide({ custom: custom.trim() })} />
          <button class="go" disabled={!!busy || done || !custom.trim()} onClick={() => void decide({ custom: custom.trim() })}>
            {busy?.custom ? 'so ordered…' : 'Instruct'}
          </button>
        </div>
        {busy ? <p class="court-wait">so ordered…</p> : done ? <p class="court-wait">so ordered — waiting for the court to speak</p> : null}
        <Err error={error} />
      </Modal>
    );
  }

  // Recorded: show the ruling and wait for Continue. Never asks again.
  const chosen = d?.optionId ? (gate.options.find((o) => o.id === d.optionId) ?? null) : null;
  const effect = d?.effect && typeof d.effect === 'object' && 'text' in d.effect ? String((d.effect as { text?: unknown }).text ?? '') : (chosen?.effect.text ?? '');
  const pill = !d ? <Pill>no decision recorded</Pill> : gate.recommendation ? <Pill tone={d.override ? 'err' : 'ok'}>{d.override ? 'override' : 'followed recommendation'}</Pill> : <Pill>unadvised</Pill>;
  return (
    <Modal onEnter={onContinue}>
      <h3>
        The court ruled <span class="court-h3pill">{pill}</span>
      </h3>
      <p class="ctx">
        <b class="court-q">{gate.question}</b>
        <br />
        {gate.context}
        {gate.raisedBy ? <span class="court-raised">{raisedByText(gate.raisedBy, name)}</span> : null}
      </p>
      {rec ? (
        <div class="rec2">
          The bench advised: <b>{rec.label}</b>
          {gate.recommendationReason ? <span class="court-reason">{gate.recommendationReason}</span> : null}
        </div>
      ) : (
        <div class="rec2 court-considering">the bench had not advised when the court ruled</div>
      )}
      {gate.options.map((o) => (
        <button key={o.id} class={`opt${chosen?.id === o.id ? ' sel' : ' court-dim'}`} disabled>
          {o.label}
          {chosen?.id === o.id ? (
            <>
              {' '}
              <Pill tone="ok">chosen</Pill>
            </>
          ) : null}
          <span class="eff">{o.effect.text}</span>
        </button>
      ))}
      {d?.custom ? (
        <div class="court-custom">
          <span class="lbl">custom instruction</span>“{d.custom}”
        </div>
      ) : null}
      {effect ? <p class="ctx court-effect">The court: {effect}</p> : null}
      <div class="row">
        <button class="go" onClick={onContinue}>
          Continue
        </button>
      </div>
    </Modal>
  );
}

// ---- verdict ------------------------------------------------------------------

export function VerdictModal({
  question,
  options,
  recorded,
  onLock,
  onContinue,
}: {
  question: string;
  options: { id: string; label: string; text?: string }[];
  recorded?: Verdict;
  onLock?: (body: { optionId: string; confidence: number }) => Promise<void>;
  onContinue: () => void;
}) {
  const [pick, setPick] = useState<string | null>(null);
  const [conf, setConf] = useState(60);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lock = async () => {
    if (!pick || busy || !onLock) return;
    setBusy(true);
    setError(null);
    try {
      await onLock({ optionId: pick, confidence: conf });
      setDone(true);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!recorded && onLock) {
    return (
      <Modal>
        <h3>Return a verdict</h3>
        <p class="ctx">{question}</p>
        {options.map((o) => (
          <button key={o.id} class={`opt${pick === o.id ? ' sel' : ''}`} disabled={busy || done} onClick={() => setPick(o.id)}>
            {o.label}
            {o.text ? <span class="eff">{o.text}</span> : null}
          </button>
        ))}
        <div class="conf">
          <span>confidence</span>
          <input type="range" min={0} max={100} value={conf} disabled={busy || done} onInput={(e) => setConf(Number((e.currentTarget as HTMLInputElement).value))} />
          <b>{conf}%</b>
        </div>
        <button class="go" disabled={!pick || busy || done} onClick={() => void lock()}>
          {busy ? 'locking…' : done ? 'locked' : 'Lock verdict'}
        </button>
        {done ? <p class="court-wait">locked — the court is preparing the reveal</p> : null}
        <Err error={error} />
      </Modal>
    );
  }

  // Recorded (replay, or a live run after the lock): the verdict as returned; correctness belongs to the report.
  return (
    <Modal onEnter={onContinue}>
      <h3>The verdict</h3>
      <p class="ctx">{question}</p>
      {options.map((o) => (
        <button key={o.id} class={`opt${recorded?.optionId === o.id ? ' sel' : ' court-dim'}`} disabled>
          {o.label}
          {recorded?.optionId === o.id ? (
            <>
              {' '}
              <Pill tone="ok">returned</Pill>
            </>
          ) : null}
        </button>
      ))}
      {recorded?.confidence != null ? (
        <div class="conf">
          <span>confidence</span>
          <div class="court-bar">
            <i style={{ width: `${Math.max(0, Math.min(100, recorded.confidence))}%` }} />
          </div>
          <b>{recorded.confidence}%</b>
        </div>
      ) : null}
      {!recorded ? <p class="ctx">No verdict was recorded.</p> : null}
      <button class="go" onClick={onContinue}>
        {recorded ? 'Reveal' : 'Continue'}
      </button>
    </Modal>
  );
}

// ---- evidence -------------------------------------------------------------------

export function EvidenceModal({ id, evidence, status, revealed, onClose }: { id: string; evidence: Evidence; status?: string; revealed: boolean; onClose: () => void }) {
  const integ = revealed && evidence.integrity ? evidence.integrity : null;
  return (
    <Modal onDismiss={onClose}>
      <h3>
        {id} · {evidence.title}
      </h3>
      <p class="ctx">{evidence.description}</p>
      <div class="court-kv">
        <span>kind</span>
        <b>{evidence.kind.replace(/_/g, ' ')}</b>
      </div>
      <div class="court-kv">
        <span>status</span>
        <b>
          {(status ?? evidence.status ?? 'not introduced').replace(/_/g, ' ')}
          {evidence.introducedBy ? ` · by ${evidence.introducedBy}` : ''}
        </b>
      </div>
      <div class={`integ${integ ? ` ${integ}` : ''}`}>integrity: {integ ?? 'sealed until verdict'}</div>
      <button class="ghost" onClick={onClose}>
        Close
      </button>
    </Modal>
  );
}

// ---- prisoner's dilemma ----------------------------------------------------------

/** Sits in the balloon slot, not in a scrim: the parent positions it. */
export function PdCard({ pd, participants, names }: { pd?: RunData['pd']; participants: string[]; names: (id: string) => string }) {
  const who = participants.map(names).join(' and ');
  if (!pd) {
    return (
      <div class="court-pd">
        <div class="nm">The Court · private interrogation</div>
        <div class="tx">
          {who} are being questioned separately. Neither sees the other's answer.<span class="caret" />
        </div>
      </div>
    );
  }
  const pay = (id: string) => {
    const v = pd.payoff[id];
    return typeof v === 'number' ? Money(v, true) : '—';
  };
  return (
    <div class="court-pd">
      <div class="nm">The Court · private interrogation</div>
      <table>
        <thead>
          <tr>
            <th>Witness</th>
            <th>Choice</th>
            <th>Payoff</th>
          </tr>
        </thead>
        <tbody>
          {pd.participants.map((id) => {
            const choice = String(pd.choices[id] ?? '?');
            const v = pd.payoff[id];
            return (
              <tr key={id}>
                <td>{names(id)}</td>
                <td>
                  <Pill tone={choice === 'confess' ? 'lie' : choice === 'silent' ? 'ok' : 'none'}>{choice}</Pill>
                </td>
                <td class={`num ${typeof v === 'number' && v > 0 ? 'up' : typeof v === 'number' && v < 0 ? 'dn' : ''}`}>{pay(id)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {pd.trustChanges.length ? (
        <div class="court-trust">
          {pd.trustChanges
            .map((t) => t as { from?: string; to?: string; delta?: number })
            .map((t) => `${names(t.from ?? '?')}'s trust in ${names(t.to ?? '?')} ${Money(t.delta ?? 0, true)}`)
            .join(' · ')}
        </div>
      ) : null}
    </div>
  );
}

// ---- the reveal -------------------------------------------------------------------

/** Everything from `metrics` and `truth`; nothing recomputed. The run page has the long form. */
export function ReportModal({ data, runHref, onClose }: { data: RunData; runHref: string; onClose: () => void }) {
  const { metrics: m, truth, verdict: v, world, gates, pd, cast } = data;
  const name = (id: string) => cast.find((c) => c.id === id)?.name ?? id;
  const rows = m ? m.rewardVsSafety.map((r) => ({ ...r, start: m.perCharacter[r.characterId]?.credits.start ?? 0, end: m.perCharacter[r.characterId]?.credits.end ?? 0 })) : [];
  const decided = gates.filter((g) => g.decided);
  const label = (g: (typeof gates)[number], id?: string) => (id ? (g.options.find((o) => o.id === id)?.label ?? id) : '—');
  return (
    <Modal onDismiss={onClose} wide>
      <div class="report court-report">
        <div class="face">
          <Tile label={`verdict${v?.confidence != null ? ` · ${v.confidence}% confidence` : ''}`} value={v ? v.label : 'no verdict'} tone={v ? (v.correct ? 'match' : 'miss') : undefined} sub={v ? <Pill tone={v.correct ? 'ok' : 'lie'}>{v.correct ? 'correct' : 'incorrect'}</Pill> : null} />
          <Tile label="ground truth" value={truth?.answer ?? m?.truthAnswer ?? 'sealed'} />
        </div>

        <h2>What actually happened</h2>
        <div class="narr">{truth ? truth.reveal.map((p, i) => <p key={i}>{p}</p>) : <p>Sealed until the run is complete.</p>}</div>

        <h2>Metrics</h2>
        {m ? <MetricTiles m={m} /> : <p class="ctx">metrics.json is not there yet.</p>}

        <h2>Reward ≠ safety</h2>
        <RewardTable rows={rows} name={name} currency={world.currency} />

        <h2>Decisions</h2>
        {decided.length ? (
          <table>
            <thead>
              <tr>
                <th>Question</th>
                <th>Chosen</th>
                <th>Recommended</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {decided.map((g) => {
                const d = g.decided!;
                return (
                  <tr key={g.id}>
                    <td>{g.question}</td>
                    <td>{d.custom ? `“${d.custom}”` : label(g, d.optionId)}</td>
                    <td>{label(g, g.recommendation ?? undefined)}</td>
                    <td class="num">
                      <Pill tone={d.override ? 'err' : 'ok'}>{d.override ? 'override' : 'followed'}</Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p class="ctx">No gate was decided.</p>
        )}
        {pd ? (
          <>
            <h2>Prisoner's dilemma</h2>
            <PdCard pd={pd} participants={pd.participants} names={name} />
            {pd.rationales ? (
              <div class="narr">
                {pd.participants.map((id) => (
                  <p key={id}>
                    <b>{name(id)}</b> — {pd.rationales?.[id] ?? '—'}
                  </p>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        <div class="row">
          <a class="go" href={runHref}>
            Full report on the run page
          </a>
          <button class="ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
