'use client';

import { useActionState } from 'react';

import { Field, Input } from '@/components/ui';

import { resetPassword, type AuthState } from '../actions';
import { AuthError } from '../auth-card';
import { SubmitButton } from '../login/login-form';

export const ResetPasswordForm = () => {
  const [state, action] = useActionState<AuthState, FormData>(resetPassword, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="New password" hint="At least 12 characters.">
        <Input name="password" type="password" autoComplete="new-password" required autoFocus />
      </Field>

      <AuthError error={state.error} message={state.message} />

      <SubmitButton>Save and sign in</SubmitButton>
    </form>
  );
};
