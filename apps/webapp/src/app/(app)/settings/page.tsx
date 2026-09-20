import { redirect } from 'next/navigation';

/** Settings has no landing page of its own; the first section is the landing. */
export default function SettingsIndexPage() {
  redirect('/settings/account');
}
