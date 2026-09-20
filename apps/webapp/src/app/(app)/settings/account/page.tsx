import { redirect } from 'next/navigation';

import { Card, CardDescription, CardTitle, Field, Input } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';

import { SettingsPage } from '../settings-page';
import { AccountForm } from './account-form';

export const metadata = { title: 'Account' };

export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) redirect('/login');

  const name = (user.user_metadata?.['name'] as string | undefined) ?? '';
  const provider = user.app_metadata?.provider ?? 'email';

  return (
    <SettingsPage description="Your name and how you sign in." title="Account">
      <AccountForm name={name} />

      <Card>
        <CardTitle>Sign-in</CardTitle>
        <CardDescription>
          How you get in. Changing this is not built yet — it is the kind of change that needs a
          confirmation email, not a form field.
        </CardDescription>
        <div className="flex flex-col gap-4">
          <Field label="Email">
            <Input defaultValue={user.email ?? ''} disabled readOnly />
          </Field>
          <Field hint="Set when the account was created." label="Method">
            <Input
              defaultValue={provider === 'google' ? 'Google' : 'Email and password'}
              disabled
              readOnly
            />
          </Field>
        </div>
      </Card>
    </SettingsPage>
  );
}
