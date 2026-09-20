// Script → animation state, ported from the prototype's loop. Owns the index,
// mode, typewriter, positions and the balloon; draws only on the canvas it is
// given (or none), and reports every state change through `onRender`.
import { COURT_ID, drawPerson, drawRoom, screenOf, seatCast, type Member, type Pt } from './iso.ts';
import type { CastEntry, RunData, ScriptEntry, TurnEntry } from './types.ts';

export type Mode = 'auto' | 'manual';
export type Halt = { kind: 'gate'; gateId: string } | { kind: 'pd' } | { kind: 'verdict' } | null;
export type Balloon = { who: string; text: string; typed: number; done: boolean; entry: TurnEntry | null };

export type PlayerState = {
  idx: number;
  mode: Mode;
  playing: boolean;
  phase: string;
  turn: number;
  balloon: Balloon | null;
  speaker: string | null;
  halt: Halt;
  /** The record is exhausted and the run is finished. */
  ended: boolean;
  /** The record is exhausted but the run is live: the clerk is working. */
  waiting: boolean;
  expected: string | null;
  canAdvance: boolean;
  record: ScriptEntry[];
  seen: Set<string>;
  spoke: Set<string>;
  credits: Record<string, number>;
  ethics: Record<string, number>;
  lastNote: Record<string, string>;
  counts: { turns: number; rejected: number; errors: number; repaired: number };
};

export type PlayerOptions = {
  cast: CastEntry[];
  ledgers: RunData['ledgers'];
  pd?: RunData['pd'];
  live: boolean;
  expected?: string | null;
  reduced?: boolean;
  onRender: (s: PlayerState) => void;
  /** Every frame: where the speaker's head is, in overlay percentages. */
  onFrame?: (speaker: Pt | null) => void;
};

/**
 * What a refetch added. Usually `next.slice(prev.length)`, but the script is not a
 * strict prefix across completion: the `verdict` entry appears before a court line
 * already played. Take the common prefix, then the tail minus what was already seen.
 */
export function newEntries(prev: ScriptEntry[], next: ScriptEntry[]): ScriptEntry[] {
  const key = (e: ScriptEntry) => `${e.kind}|${'turn' in e ? e.turn : ''}|${'text' in e ? e.text : ''}|${'gateId' in e ? e.gateId : ''}`;
  let i = 0;
  while (i < prev.length && i < next.length && key(prev[i]!) === key(next[i]!)) i++;
  const played = new Set(prev.slice(i).map(key));
  return next.slice(i).filter((e) => !played.has(key(e)));
}

const near = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < 0.05;
const clamp = (n: number) => Math.max(0, Math.min(100, n));

export class Player {
  readonly cast: Record<string, Member>;
  private ctx: CanvasRenderingContext2D | null;
  private readonly opts: PlayerOptions;
  private script: ScriptEntry[] = [];
  private idx = 0;
  private mode: Mode = 'auto';
  private playing = true;
  private phase = 'opening';
  private turn = 0;
  private halt: Halt = null;
  private ended = false;
  private waiting = false;
  private live: boolean;
  private expected: string | null;
  private pdPayoffApplied = false;
  private balloon: Balloon | null = null;
  private readonly pos: Record<string, Pt> = {};
  private readonly target: Record<string, Pt> = {};
  private readonly record: ScriptEntry[] = [];
  private readonly seen = new Set<string>();
  private readonly spoke = new Set<string>();
  private readonly credits: Record<string, number>;
  private readonly ethics: Record<string, number>;
  private readonly lastNote: Record<string, string> = {};
  private readonly counts = { turns: 0, rejected: 0, errors: 0, repaired: 0 };
  private last = 0;
  private acc = 0;
  private nextAt = 1400;
  private raf = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(canvas: HTMLCanvasElement | null, opts: PlayerOptions) {
    this.opts = opts;
    this.ctx = canvas?.getContext('2d') ?? null;
    this.cast = seatCast(opts.cast);
    this.live = opts.live;
    this.expected = opts.expected ?? null;
    this.credits = { ...opts.ledgers.credits };
    this.ethics = { ...opts.ledgers.ethics };
    for (const k of Object.keys(this.cast)) {
      this.pos[k] = [...this.cast[k]!.seat.home] as Pt;
      this.target[k] = [...this.cast[k]!.seat.home] as Pt;
    }
  }

  /** The canvas can arrive after construction (it mounts once data is loaded). */
  attach(canvas: HTMLCanvasElement | null): void {
    this.ctx = canvas?.getContext('2d') ?? null;
  }

  // ---- state out --------------------------------------------------------------

  state(): PlayerState {
    return {
      idx: this.idx, mode: this.mode, playing: this.playing, phase: this.phase, turn: this.turn,
      balloon: this.balloon, speaker: this.balloon?.who ?? null, halt: this.halt, ended: this.ended,
      waiting: this.waiting, expected: this.expected, canAdvance: this.canAdvance(),
      record: this.record, seen: this.seen, spoke: this.spoke, credits: this.credits, ethics: this.ethics,
      lastNote: this.lastNote, counts: this.counts,
    };
  }
  private emit(): void {
    this.opts.onRender(this.state());
  }
  get length(): number {
    return this.script.length;
  }

  // ---- script in ----------------------------------------------------------------

  load(script: ScriptEntry[]): void {
    this.script = [...script];
    this.emit();
  }

  /** Live turns: extends the script and wakes the player if it was waiting. */
  append(entries: ScriptEntry[]): void {
    if (!entries.length) return;
    this.script.push(...entries);
    if (this.waiting || this.ended) {
      this.waiting = false;
      this.ended = false;
      this.acc = this.nextAt; // do not make the human wait twice
    }
    this.emit();
  }

  setLive(live: boolean): void {
    this.live = live;
    if (!live && this.waiting) {
      this.waiting = false;
      this.emit();
    }
  }
  setExpected(id: string | null): void {
    this.expected = id;
    this.emit();
  }
  setPhase(p: string): void {
    this.phase = p;
    this.emit();
  }

  // ---- controls -------------------------------------------------------------------

  canAdvance(): boolean {
    return this.halt === null && !this.ended && !this.waiting && this.idx < this.script.length;
  }
  setMode(m: Mode): void {
    this.mode = m;
    if (m === 'auto') this.playing = true;
    else this.playing = false;
    this.emit();
  }
  play(): void {
    this.playing = true;
    this.emit();
  }
  pause(): void {
    this.playing = false;
    this.emit();
  }
  /** One input: finish the line if it is still typing, otherwise take the next turn. */
  advance(): void {
    if (this.balloon && !this.balloon.done) {
      this.balloon = { ...this.balloon, typed: this.balloon.text.length, done: true };
      this.emit();
      return;
    }
    if (!this.canAdvance()) {
      if (this.idx >= this.script.length && !this.halt && !this.ended && !this.waiting) this.finish();
      return;
    }
    this.acc = 0;
    this.step();
  }
  /** The modal a halt opened has closed; carry on. */
  release(): void {
    this.halt = null;
    this.acc = 0;
    this.nextAt = 1800;
    if (this.mode === 'auto') this.playing = true;
    this.emit();
  }

  // ---- the loop ---------------------------------------------------------------------

  start(): void {
    if (typeof requestAnimationFrame !== 'function') return;
    const loop = (now: number) => {
      this.tick(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    // rAF sleeps in a hidden tab; a live court should keep pace while the human looks elsewhere.
    // Timers are throttled there too, so each firing catches up in 50 ms steps.
    this.timer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return;
      const now = performance.now();
      if (!this.last) {
        this.tick(now);
        return;
      }
      let t = this.last;
      while (t < now) {
        t = Math.min(now, t + 50);
        this.tick(t, false);
      }
    }, 250);
  }
  stop(): void {
    if (this.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One frame at time `now` (ms). Public so tests can drive it without rAF. */
  tick(now: number, paint = true): void {
    const dt = this.last ? Math.min(50, now - this.last) : 16;
    this.last = now;
    this.acc += dt;
    const R = this.opts.reduced ?? false;
    for (const k of Object.keys(this.cast)) {
      const a = this.pos[k]!;
      const b = this.target[k]!;
      const sp = R ? 1 : Math.min(1, 0.0042 * dt * 3.2);
      a[0] += (b[0] - a[0]) * sp;
      a[1] += (b[1] - a[1]) * sp;
    }
    if (paint) this.draw(now);
    if (this.balloon && !this.balloon.done) {
      const typed = R ? this.balloon.text.length : Math.min(this.balloon.text.length, this.balloon.typed + dt * 0.055);
      this.balloon = { ...this.balloon, typed, done: typed >= this.balloon.text.length };
      this.emit();
    }
    if (this.opts.onFrame) {
      const who = this.balloon?.who;
      const p = who ? this.pos[who] : undefined;
      this.opts.onFrame(p ? screenOf(p[0], p[1]) : null);
    }
    const atEnd = this.idx >= this.script.length && !this.halt && !this.ended && !this.waiting;
    if (this.mode === 'auto' && this.playing) {
      if (this.acc > this.nextAt) {
        this.acc = 0;
        if (this.canAdvance()) this.step();
        else if (atEnd) this.finish();
      }
    } else if (atEnd && (!this.balloon || this.balloon.done)) this.finish(); // manual: the end shows once the last line is read
  }

  private draw(now: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    drawRoom(ctx);
    const order = Object.keys(this.cast).sort((a, b) => this.pos[a]![0] + this.pos[a]![1] - (this.pos[b]![0] + this.pos[b]![1]));
    for (const k of order) {
      const m = this.cast[k]!;
      const moving = Math.abs(this.pos[k]![0] - this.target[k]![0]) + Math.abs(this.pos[k]![1] - this.target[k]![1]) > 0.04;
      const seated = k === COURT_ID || (!moving && near(this.pos[k]!, m.seat.home) && m.seat.home[1] > 4);
      drawPerson(ctx, this.pos[k]![0], this.pos[k]![1], m.look, now, moving, seated);
    }
  }

  // ---- turns -----------------------------------------------------------------------------

  private setPhaseFrom(e: ScriptEntry): void {
    if ('trialState' in e && e.trialState && e.trialState !== this.phase) this.phase = e.trialState;
  }
  private applyDeltas(who: string, e: { credits: { delta: number; note: string; key: string }[]; ethics: { delta: number; note: string; key: string }[] }): void {
    if (!(who in this.credits)) return;
    for (const d of e.credits) {
      this.credits[who] = (this.credits[who] ?? 0) + (d.delta || 0);
      this.lastNote[who] = `${d.delta >= 0 ? '+' : '−'}${Math.abs(d.delta).toLocaleString('en-US')} ${d.key.replace(/_/g, ' ')}`;
    }
    for (const d of e.ethics) {
      this.ethics[who] = clamp((this.ethics[who] ?? 100) + (d.delta || 0));
      this.lastNote[who] = `ethics ${d.delta >= 0 ? '+' : '−'}${Math.abs(d.delta)} ${d.key.replace(/_/g, ' ')}`;
    }
  }

  private say(who: string, text: string, entry: TurnEntry | null): void {
    for (const k of Object.keys(this.cast)) this.target[k] = [...this.cast[k]!.seat.home] as Pt;
    const m = this.cast[who];
    if (m) this.target[who] = [...m.seat.mark] as Pt;
    const R = this.opts.reduced ?? false;
    this.balloon = { who, text, typed: R ? text.length : 0, done: R || text.length === 0, entry };
  }

  private finish(): void {
    if (this.live) {
      this.waiting = true;
    } else {
      this.ended = true;
      this.playing = false;
      const text = 'The record ends here.';
      this.record.push({ kind: 'court', text, trialState: this.phase });
      this.say(COURT_ID, text, null);
    }
    this.emit();
  }

  /** Takes the next script entry. Returns false when nothing was taken. */
  step(): boolean {
    if (this.halt || this.ended) return false;
    if (this.idx >= this.script.length) {
      this.finish();
      return false;
    }
    const e = this.script[this.idx++]!;
    this.setPhaseFrom(e);
    const R = this.opts.reduced ?? false;
    const pace = (text: string) => (R ? 1200 : Math.min(9000, 2600 + text.length * 26));
    switch (e.kind) {
      case 'gate':
        this.halt = { kind: 'gate', gateId: e.gateId };
        this.playing = false;
        this.say(COURT_ID, 'The court will hear the parties on this. One moment.', null);
        break;
      case 'pd':
        // The payoff is the only credit movement that is not on a turn.
        if (this.opts.pd && !this.pdPayoffApplied) {
          this.pdPayoffApplied = true;
          for (const [k, v] of Object.entries(this.opts.pd.payoff)) if (k in this.credits) this.credits[k] = (this.credits[k] ?? 0) + (Number(v) || 0);
        }
        this.halt = { kind: 'pd' };
        this.playing = false;
        this.say(COURT_ID, 'The witnesses are questioned separately. The record will show each answer.', null);
        break;
      case 'verdict':
        this.phase = 'verdict';
        this.halt = { kind: 'verdict' };
        this.playing = false;
        this.balloon = null;
        break;
      case 'error':
        this.counts.errors++;
        this.record.push(e);
        this.nextAt = 1500;
        break;
      case 'rejected':
        this.counts.rejected++;
        this.applyDeltas(e.who, e);
        this.record.push(e);
        if (e.turn) this.turn = e.turn;
        this.nextAt = 1500;
        break;
      case 'court':
        this.record.push(e);
        this.say(COURT_ID, e.text, null);
        this.nextAt = pace(e.text);
        break;
      case 'turn': {
        if (!this.cast[e.who]) {
          this.record.push(e);
          this.nextAt = 1500;
          break;
        }
        for (const x of e.ev) this.seen.add(x);
        this.spoke.add(e.who);
        this.counts.turns++;
        if (e.repaired) this.counts.repaired++;
        this.applyDeltas(e.who, e);
        this.record.push(e);
        if (e.turn) this.turn = e.turn;
        this.say(e.who, e.text, e);
        this.nextAt = pace(e.text);
        break;
      }
    }
    this.emit();
    return true;
  }
}
