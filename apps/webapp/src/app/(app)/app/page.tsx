import { Card, CardDescription, CardTitle, Chip, SectionLabel } from '@/components/ui';

export const metadata = { title: 'Home' };

/**
 * The home screen, deliberately almost empty.
 *
 * A bootstrap that ships a fake dashboard makes the first real task "delete the
 * fake dashboard". This is the shell proving itself — HUD, the card, the chips,
 * the two typefaces — and nothing else. The courtroom, the scenario creator and
 * the report each replace a line below when they land.
 */
export default function HomePage() {
  return (
    <main className="flex-1 overflow-y-auto bg-stage p-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <Card>
          <CardTitle>All parties are present.</CardTitle>
          <CardDescription>
            One person writes the case and publishes it. Another starts a trial, sits with the
            Judge, and returns a verdict. Then the record is opened and every agent is scored on
            what it actually said.
          </CardDescription>

          <SectionLabel className="mt-4">What is built</SectionLabel>
          <ul className="flex flex-col gap-1 text-[13px] text-ink-soft">
            <li>Sign in, sign up, email codes, password reset, Google — all through Supabase.</li>
            <li>Our own auth emails, rendered from the app and delivered by Resend or Mailpit.</li>
            <li>This shell, and the courtroom tokens in one stylesheet.</li>
          </ul>

          <SectionLabel className="mt-4">Next</SectionLabel>
          <div className="flex flex-wrap gap-1">
            <Chip tone="brass">milestone zero · AI SDK + XO spike</Chip>
            <Chip>scenario creator</Chip>
            <Chip>trial engine</Chip>
            <Chip>judge + verdict</Chip>
            <Chip>evaluation</Chip>
          </div>
        </Card>

        <p className="font-pix text-pix-xs text-ink-faint">
          spec · docs/raw/AI-Courtroom-Agent-Benchmark-Specification.md
        </p>
      </div>
    </main>
  );
}
