import { Card, CardDescription, CardTitle, Chip } from '@/components/ui';

export const metadata = { title: 'Trials' };

/** Placeholder until Milestone Three. The route exists so the HUD has somewhere to point. */
export default function TrialsPage() {
  return (
    <main className="flex-1 overflow-y-auto bg-stage p-6">
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardTitle>Trials</CardTitle>
          <CardDescription>
            Where a published scenario becomes a courtroom: agents act, the Judge asks, you rule,
            and the record is scored.
          </CardDescription>
          <Chip>milestone three</Chip>
        </Card>
      </div>
    </main>
  );
}
