'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button, Card, CardDescription, CardTitle, Field, Input } from '@/components/ui';

import { updateName, type SettingsState } from '../actions';

export const AccountForm = ({ name }: { name: string }) => {
  const [state, action] = useActionState<SettingsState, FormData>(updateName, {});

  return (
    <form action={action}>
      <Card>
        <CardTitle>Profile</CardTitle>
        <CardDescription>What the court calls you.</CardDescription>
        <Field
          error={state.error}
          hint="Shown in the HUD and used by the Judge when it addresses you."
          label="Name"
        >
          <Input defaultValue={name} name="name" required />
        </Field>
        <div className="mt-4 flex items-center justify-between">
          <SaveState saved={state.saved} />
          <SaveButton />
        </div>
      </Card>
    </form>
  );
};

/* Its own component so `useFormStatus` reports this form's status, not idle. */
const SaveButton = () => {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit" variant="primary">
      {pending ? 'Saving…' : 'Save'}
    </Button>
  );
};

const SaveState = ({ saved }: { saved?: boolean }) => {
  const { pending } = useFormStatus();
  if (pending || !saved) return null;
  return (
    <p aria-live="polite" className="font-pix text-pix-xs text-ok">
      saved
    </p>
  );
};
