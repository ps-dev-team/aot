'use client';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button, Field, Input } from '@/components/ui';
import { requestCode, verifyCode, type OtpState } from '../otp-actions';

export function OtpForm({ redirect }: { redirect?: string }) {
  const [email, setEmail] = useState<string | null>(null);
  return email === null ? (
    <EmailStep onSent={setEmail} />
  ) : (
    <CodeStep redirect={redirect} email={email} onBack={() => setEmail(null)} />
  );
}
function EmailStep({ onSent }: { onSent: (email: string) => void }) {
  const [state, action] = useActionState(async (previous: OtpState, form: FormData) => {
    const result = await requestCode(previous, form);
    if (result.sent && result.email) onSent(result.email);
    return result;
  }, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Email">
        <Input type="email" name="email" autoComplete="email" required />
      </Field>
      {state.error && <p role="alert" className="text-[12.5px] text-oxblood">{state.error}</p>}
      <SubmitButton>Send sign-in code</SubmitButton>
    </form>
  );
}
function CodeStep({
  email,
  onBack,
  redirect,
}: {
  email: string;
  onBack: () => void;
  redirect?: string;
}) {
  const [verified, verify, verifying] = useActionState(verifyCode, {});
  const [resent, resend, resending] = useActionState(requestCode, {});
  return (
    <div className="space-y-5">
      <p role="status" className="text-[13px] text-ink-soft">
        If <strong>{email}</strong> can sign in, a code will arrive shortly.
      </p>
      <form action={verify} className="space-y-4">
        <input type="hidden" name="redirect" value={redirect ?? '/app'} />
        <input type="hidden" name="email" value={email} />
        <Field label="Email code">
          <Input
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6,10}"
            maxLength={10}
            required
          />
        </Field>
        {verified.error && <p role="alert" className="text-[12.5px] text-oxblood">{verified.error}</p>}
        <SubmitButton disabled={resending}>Verify and sign in</SubmitButton>
      </form>
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={onBack} disabled={verifying || resending}>
          Change email
        </Button>
        <form action={resend}>
          <input type="hidden" name="email" value={email} />
          <Button type="submit" variant="ghost" disabled={verifying || resending}>
            {resending ? 'Sending…' : 'Resend code'}
          </Button>
        </form>
      </div>
      {resent.error && <p role="alert" className="text-[12.5px] text-oxblood">{resent.error}</p>}
      {resent.sent && (
        <p role="status" className="text-[13px] text-ink-soft">If this address can sign in, a new code will arrive shortly.</p>
      )}
    </div>
  );
}
export function SubmitButton({
  children,
  disabled = false,
}: {
  children: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" className="w-full" disabled={pending || disabled}>
      {pending ? 'One moment…' : children}
    </Button>
  );
}
