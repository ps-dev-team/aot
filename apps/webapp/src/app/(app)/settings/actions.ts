'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

export type SettingsState = { error?: string; saved?: boolean };

const nameSchema = z.object({
  name: z.string().trim().min(1, 'Tell us what to call you').max(120),
});

/**
 * Change the display name.
 *
 * It lives in the auth user's metadata rather than a `profiles` table, because
 * that is all it is: one string the person owns, already carried on the session
 * the app reads on every request. A profile table earns its place when there is
 * something to join to.
 */
export const updateName = async (
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> => {
  const parsed = nameSchema.safeParse({ name: formData.get('name') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { name: parsed.data.name } });

  if (error) return { error: 'Could not save that. Try again in a moment.' };

  /* The whole shell, not just the settings page: the HUD shows this name, and
     it lives in the app layout. */
  revalidatePath('/', 'layout');
  return { saved: true };
};
