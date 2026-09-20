'use client';

import { useActionState } from 'react';

import { Field, Input } from '@/components/ui';

import { signup, type AuthState } from '../actions';
import { AuthError } from '../auth-card';
import { SubmitButton } from '../login/login-form';

export const SignupForm = () => {
  const [state, action] = useActionState<AuthState, FormData>(signup, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Name">
        <Input name="name" autoComplete="name" required autoFocus />
      </Field>

      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>

      <Field label="Password" hint="At least 12 characters.">
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>

      <AuthError error={state.error} message={state.message} />

      <SubmitButton>Create account</SubmitButton>
    </form>
  );
};
