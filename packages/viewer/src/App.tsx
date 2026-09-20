// Shell: top bar + outlet. Views are lazy so a view that is mid-edit does not
// take the whole app down.
import { useRoute, href, type Route } from './router.ts';
import type { ComponentType } from 'preact';
import Try from './views/Try.tsx';
import Docket from './views/Docket.tsx';
import World from './views/World.tsx';
import Run from './views/Run.tsx';
import Compare from './views/Compare.tsx';

const VIEWS: Record<Route['name'], ComponentType<{ route: Route }>> = {
  try: Try,
  docket: Docket,
  world: World,
  run: Run,
  compare: Compare,
};

export function App() {
  const route = useRoute();
  const View = VIEWS[route.name];
  const nav = (name: Route['name'], label: string) => (
    <a href={href(name)} class={`chip${route.name === name ? ' ex' : ''}`}>
      {label}
    </a>
  );
  return (
    <>
      <header class="hud">
        <a href={href('try')} class="hud-title">
          Agent on Trial
        </a>
        <nav class="hud-nav">
          {nav('try', 'Try it')}
          {nav('docket', 'Docket')}
        </nav>
      </header>
      <main class="page">
        <View route={route} />
      </main>
    </>
  );
}
