// "Try it": the loop for a teammate with a fresh clone. Static; no fetch.
import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { href } from '../router.ts';

function Cmd({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => {
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    });
  };
  return (
    <div class="try-cmd">
      <pre>
        <code>{text}</code>
      </pre>
      <button class={`ghost${done ? ' done' : ''}`} onClick={copy} type="button">
        {done ? 'copied' : 'copy'}
      </button>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ComponentChildren }) {
  return (
    <div class="try-step">
      <h3>
        <span>{String(n).padStart(2, '0')}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

const See = ({ children }: { children: ComponentChildren }) => (
  <p class="try-see">
    <b>You will see:</b> {children}
  </p>
);

export default function View() {
  return (
    <>
      <h1>Try it</h1>
      <p class="lead">
        Two Claude Code agents and a harness between them. One writes a world, the other puts it on trial with you as the judge. Everything lands in
        files; this page reads them. Five steps, about fifteen minutes the first time.
      </p>

      <Step n={1} title="Install">
        <p>From the repository root. Node 26 runs the TypeScript directly; there is no build.</p>
        <Cmd text="pnpm install" />
        <See>the usual pnpm output. Nothing else to configure — the agents use the Claude Code login you already have.</See>
      </Step>

      <Step n={2} title="Interview: write a world">
        <p>
          The interview agent asks one question at a time and turns your answers into a world file: the truth, the facts, the evidence, the cast
          with rules, goals, hidden agendas and incentives, the judge's decision gates, the plan. Say <em>skip</em> to any question and it picks.
        </p>
        <Cmd text="cd packages/interview-agent && claude" />
        <p>then, inside Claude Code:</p>
        <Cmd text="/interview" />
        <See>
          a short explanation of what a world is, then questions. It ends by writing <code>worlds/&lt;slug&gt;.json</code> and running{' '}
          <code>node scripts/validate.ts</code> on it until it is clean. To skip the interview, use the seed world:{' '}
          <code>examples/murder-of-mike.json</code>.
        </See>
      </Step>

      <Step n={3} title="Run: put it on trial">
        <p>
          The world agent is the court clerk. It spawns one subagent per character per turn, validates every action through the harness, keeps
          the credit and ethics ledgers, and stops to ask you at each gate and for the verdict. It never sees the truth; neither do you until the
          end.
        </p>
        <Cmd text="cd packages/world-agent && claude" />
        <p>then, inside Claude Code (or a path under the interview agent's worlds folder):</p>
        <Cmd text="/run-world ../interview-agent/examples/murder-of-mike.json" />
        <See>
          the court opens, characters speak in turn, and every few turns Claude Code asks you a question — accept an exhibit or send it to
          forensics, whom to examine, whether to separate the witnesses — and finally the verdict. Twenty-odd turns, ten to fifteen minutes.
          The run folder is <code>runs/&lt;slug&gt;/&lt;run-id&gt;/</code>.
        </See>
      </Step>

      <Step n={4} title="Come back here">
        <p>This viewer reads the files the run wrote. Start it once and leave it running; a run in progress refreshes every five seconds.</p>
        <Cmd text="pnpm viewer" />
        <See>
          <a href={href('docket')}>the docket</a>: every world and every run. Open the run.
        </See>
      </Step>

      <Step n={5} title="What to look at">
        <div class="try-look">
          <a href={href('docket')}>
            <div class="lbl">The run page</div>
            <div class="txt">
              Verdict against truth, the metrics, the reward-vs-safety table, every gate decision and whether you followed the recommendation,
              the court record, the trace.
            </div>
          </a>
          <a href={href('docket')}>
            <div class="lbl">The report</div>
            <div class="txt">
              <code>report.md</code>, at the bottom of the run page: what actually happened, the material claims, the ethics walk per character.
              The last table is the point: the character that earned the most is rarely the one that behaved best.
            </div>
          </a>
          <a href={href('docket')}>
            <div class="lbl">courtroom.html</div>
            <div class="txt">
              The replay, in the run folder. If the button on the run page says it is not rendered, run{' '}
              <code>node harness/render.ts runs/&lt;slug&gt;/&lt;run-id&gt;</code> from <code>packages/world-agent</code>.
            </div>
          </a>
          <a href={href('docket')}>
            <div class="lbl">Compare</div>
            <div class="txt">Tick two runs of the same world in the docket. Same world, different judge, different choices — side by side.</div>
          </a>
        </div>
      </Step>
    </>
  );
}
