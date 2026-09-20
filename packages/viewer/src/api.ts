// The only place fetch() is called. Server routes: see CONTRACT.md § API.
import { useEffect, useState } from 'preact/hooks';
import type { RunDetail, RunSummary, TrialEvent, World, WorldSummary } from './types.ts';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${path}`);
  return body as T;
}

export const api = {
  worlds: () => get<{ worlds: WorldSummary[] }>('/api/worlds').then((r) => r.worlds),
  world: (slug: string) => get<World>(`/api/worlds/${slug}`),
  runs: () => get<{ runs: RunSummary[] }>('/api/runs').then((r) => r.runs),
  run: (slug: string, id: string) => get<RunDetail>(`/api/runs/${slug}/${id}`),
  events: (slug: string, id: string) => get<{ events: TrialEvent[] }>(`/api/runs/${slug}/${id}/events`).then((r) => r.events),
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
