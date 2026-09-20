import { Card, CardDescription, CardTitle, Chip } from '@/components/ui';

export const metadata = { title: 'Scenarios' };

/** Placeholder until Milestone Two. The route exists so the HUD has somewhere to point. */
export default function ScenariosPage() {
  return (
    <main className="flex-1 overflow-y-auto bg-stage p-6">
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardTitle>Scenarios</CardTitle>
          <CardDescription>
            Where a case is written with the Scenario Creator, reviewed, and published as an
            immutable version.
          </CardDescription>
          <Chip>milestone two</Chip>
        </Card>
      </div>
    </main>
  );
}
