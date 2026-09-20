'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { siteBase } from '@/lib/supabase/route';
import { authConfig } from '@/lib/auth/config';
import { authFailure } from '@/lib/auth/errors';
import { safeRedirect } from './schemas';
export type OtpState = { sent?: boolean; email?: string; error?: string };
export async function requestCode(_: OtpState, form: FormData): Promise<OtpState> {
  const parsed = z.email().safeParse(
    String(form.get('email') ?? '')
      .trim()
      .toLowerCase(),
  );
  if (!parsed.success) return { error: 'Enter a valid email address.' };
  const client = await createClient();
  const { error } = await client.auth.signInWithOtp({
    email: parsed.data,
    options: {
      shouldCreateUser: authConfig().publicSignup,
      emailRedirectTo: `${siteBase()}/callback?type=email&method=otp`,
    },
  });
  if (error && !['otp_disabled', 'user_not_found'].includes(error.code ?? ''))
    return { error: authFailure(error, 'request_code') };
  return { sent: true, email: parsed.data };
}
export async function verifyCode(_: OtpState, form: FormData): Promise<OtpState> {
  const email = String(form.get('email') ?? '')
    .trim()
    .toLowerCase();
  const token = String(form.get('token') ?? '').replace(/\s/g, '');
  if (!z.email().safeParse(email).success || !/^\d{6,10}$/.test(token))
    return { error: 'Enter the code from your email.' };
  const client = await createClient();
  const { error } = await client.auth.verifyOtp({ email, token, type: 'email' });
  if (error) return { error: authFailure(error, 'verify_code') };
  redirect(safeRedirect(form.get('redirect')?.toString()));
}
