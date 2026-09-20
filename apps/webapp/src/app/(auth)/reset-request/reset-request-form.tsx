'use client';

import { useActionState } from 'react';

import { Field, Input } from '@/components/ui';

import { requestReset, type AuthState } from '../actions';
import { AuthError } from '../auth-card';
import { SubmitButton } from '../login/login-form';

export const ResetRequestForm = () => {
  const [state, action] = useActionState<AuthState, FormData>(requestReset, {});

  /* Deliberately the same message whether or not the address has an account. */
  if (state.done) {
    return (
      <p className="text-[13px] text-ink-soft">
        If that address has an account, a reset link is on its way. Check your inbox.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required autoFocus />
      </Field>

      <AuthError error={state.error} message={state.message} />

      <SubmitButton>Send the link</SubmitButton>
    </form>
  );
};
