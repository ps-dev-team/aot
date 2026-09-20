// Hash router. '#/runs/murder-of-mike/20260920-120912?x=1' → { name: 'run', params: { slug, id }, query }.
import { useEffect, useState } from 'preact/hooks';

export type RouteName = 'try' | 'docket' | 'world' | 'run' | 'compare' | 'court';
export type Route = { name: RouteName; params: Record<string, string>; query: URLSearchParams };

const PATTERNS: [RouteName, RegExp, string[]][] = [
  ['try', /^\/?$/, []],
  ['docket', /^\/docket\/?$/, []],
  ['world', /^\/worlds\/([a-z0-9-]+)\/?$/, ['slug']],
  ['run', /^\/runs\/([a-z0-9_-]+)\/([a-z0-9_-]+)\/?$/, ['slug', 'id']],
  ['court', /^\/court\/([a-z0-9_-]+)\/([a-z0-9_-]+)\/?$/, ['slug', 'id']],
  ['compare', /^\/compare\/?$/, []],
];

export function parse(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?', 2) as [string, string?];
  const query = new URLSearchParams(qs);
  for (const [name, re, keys] of PATTERNS) {
    const m = re.exec(path);
    if (m) {
      const params: Record<string, string> = {};
      keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]!)));
      return { name, params, query };
    }
  }
  return { name: 'docket', params: {}, query };
}

export function href(name: RouteName, params: Record<string, string> = {}, query?: Record<string, string>): string {
  const path = {
    try: '/',
    docket: '/docket',
    world: `/worlds/${params.slug ?? ''}`,
    run: `/runs/${params.slug ?? ''}/${params.id ?? ''}`,
    court: `/court/${params.slug ?? ''}/${params.id ?? ''}`,
    compare: '/compare',
  }[name];
  const qs = query ? new URLSearchParams(query).toString() : '';
  return `#${path}${qs ? `?${qs}` : ''}`;
}

export function navigate(name: RouteName, params?: Record<string, string>, query?: Record<string, string>): void {
  location.hash = href(name, params, query);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(location.hash));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}
