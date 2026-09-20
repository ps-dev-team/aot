'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button, Field, Input } from '@/components/ui';

import { login, type AuthState } from '../actions';
import { AuthError, AuthLink, asAuthError } from '../auth-card';

export const LoginForm = ({
  redirect,
  initialError,
}: {
  redirect?: string;
  initialError?: string;
}) => {
  const [state, action] = useActionState<AuthState, FormData>(login, {});
  /* The server action owns `state.error` once submitted; before that, the error
     the redirect brought is the one to show. */
  const error = state.error ?? asAuthError(initialError);

  return (
    <form action={action} className="flex flex-col gap-4">
      {redirect ? <input type="hidden" name="redirect" value={redirect} /> : null}

      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required autoFocus />
      </Field>

      <Field label="Password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>

      <AuthError error={error} message={state.message} />

      <SubmitButton>Sign in</SubmitButton>

      <p className="text-center text-[12.5px] text-ink-faint">
        <AuthLink href="/reset-request">Forgot your password?</AuthLink>
      </p>
    </form>
  );
};

/**
 * Its own component because `useFormStatus` only reports the status of the form
 * *above* it — read inside the form component it would always be idle.
 */
export const SubmitButton = ({ children }: { children: string }) => {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" className="w-full" disabled={pending}>
      {pending ? 'One moment…' : children}
    </Button>
  );
};
