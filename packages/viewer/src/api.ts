// The only place fetch() is called. Server routes: see CONTRACT.md § API.
import { useEffect, useState } from 'preact/hooks';
import type { DecideResult, RunData, RunDetail, RunSummary, StreamChange, TrialEvent, VerdictResult, World, WorldSummary } from './types.ts';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${path}`);
  return body as T;
}

async function post<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${path}`);
  return body as T;
}

/** The court's live feed. Reconnects on its own (EventSource does). Returns close(). */
function stream(slug: string, id: string, onChange: (m: StreamChange) => void): () => void {
  const es = new EventSource(`/api/runs/${slug}/${id}/stream`);
  es.addEventListener('change', (e) => {
    try {
      onChange(JSON.parse((e as MessageEvent<string>).data) as StreamChange);
    } catch {
      // a truncated frame; the next change carries the state
    }
  });
  return () => es.close();
}

export const api = {
  worlds: () => get<{ worlds: WorldSummary[] }>('/api/worlds').then((r) => r.worlds),
  world: (slug: string) => get<World>(`/api/worlds/${slug}`),
  runs: () => get<{ runs: RunSummary[] }>('/api/runs').then((r) => r.runs),
  run: (slug: string, id: string) => get<RunDetail>(`/api/runs/${slug}/${id}`),
  events: (slug: string, id: string) => get<{ events: TrialEvent[] }>(`/api/runs/${slug}/${id}/events`).then((r) => r.events),
  court: (slug: string, id: string) => get<RunData>(`/api/runs/${slug}/${id}/court`),
  stream,
  decide: (slug: string, id: string, body: { gateId: string; optionId: string } | { gateId: string; custom: string }) =>
    post<DecideResult>(`/api/runs/${slug}/${id}/decide`, body),
  verdict: (slug: string, id: string, body: { optionId: string; confidence?: number }) => post<VerdictResult>(`/api/runs/${slug}/${id}/verdict`, body),
};

export type Fetched<T> = { data?: T; error?: string; loading: boolean };

/** Loads once per `deps` change; with `pollMs`, keeps reloading on that interval. */
export function useFetch<T>(load: () => Promise<T>, deps: unknown[], pollMs?: number): Fetched<T> {
  const [st, setSt] = useState<Fetched<T>>({ loading: true });
  useEffect(() => {
    let alive = true;
    setSt((s) => (s.data === undefined ? s : { loading: true })); // new keys: drop the old page's data
    const tick = () =>
      load().then(
        (data) => alive && setSt({ data, loading: false }),
        (e: unknown) => alive && setSt((s) => ({ ...s, error: String((e as Error).message ?? e), loading: false })),
      );
    void tick();
    const timer = pollMs ? setInterval(tick, pollMs) : undefined;
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [...deps, pollMs]);
  return st;
}
