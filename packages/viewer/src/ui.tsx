// Small shared pieces. Classes come from styles.css (ported from the prototype);
// nothing here knows about routes or data.
import type { ComponentChildren } from 'preact';
import { useMemo } from 'preact/hooks';
import { marked } from 'marked';

export type Tone = 'ok' | 'err' | 'lie' | 'none';

/** `.pill` — ok = truth/correct/followed, err = warning/override, lie = false/rejected/wrong. */
export function Pill({ tone = 'none', children, title }: { tone?: Tone; children: ComponentChildren; title?: string }) {
  return (
    <span class={`pill${tone === 'none' ? '' : ` ${tone}`}`} title={title}>
      {children}
    </span>
  );
}

/** One `.face` cell: label over value. Wrap several in `<div class="face">`. */
export function Tile({ label, value, sub, tone }: { label: string; value: ComponentChildren; sub?: ComponentChildren; tone?: 'match' | 'miss' }) {
  return (
    <div>
      <div class="lbl">{label}</div>
      <div class={`val${tone ? ` ${tone}` : ''}`}>{value}</div>
      {sub !== undefined && sub !== null && <div class="sub">{sub}</div>}
    </div>
  );
}

/** 0.68 → "68%"; null → "—". */
export function MetricPct(value: number | null | undefined): string {
  return value === null || value === undefined || Number.isNaN(value) ? '—' : `${Math.round(value * 100)}%`;
}

/** 150000 → "150,000"; negative keeps its sign; `signed` adds "+" to positives. */
export function Money(n: number | null | undefined, signed = false): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const s = Math.abs(n).toLocaleString('en-US');
  return n < 0 ? `−${s}` : signed && n > 0 ? `+${s}` : s;
}

/** Markdown → `.narr`. Only for the harness's own files (transcript, report, memory). */
export function Md({ src, class: cls }: { src: string; class?: string }) {
  const html = useMemo(() => marked.parse(src, { async: false }) as string, [src]);
  return <div class={`narr${cls ? ` ${cls}` : ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** A page section: `.report h2`-style heading over its children. */
export function Section({ title, children, right, id }: { title: string; children: ComponentChildren; right?: ComponentChildren; id?: string }) {
  return (
    <section id={id}>
      <h2 style={right ? 'display:flex;align-items:center;gap:10px' : undefined}>
        <span style={right ? 'flex:1' : undefined}>{title}</span>
        {right}
      </h2>
      {children}
    </section>
  );
}

export function Loading({ what = 'loading' }: { what?: string }) {
  return <div class="loading">{what}…</div>;
}

export function ErrorBox({ error }: { error: string }) {
  return <div class="err-box">{error}</div>;
}

/** Short ISO → "20 Sep 14:30"; empty/invalid → "—". */
export function When(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Run status → pill tone. */
export function statusTone(status: string): Tone {
  if (status === 'complete') return 'ok';
  if (status === 'failed') return 'lie';
  return 'err';
}
