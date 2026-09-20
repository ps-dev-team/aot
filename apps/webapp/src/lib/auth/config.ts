import { z } from 'zod';

const schema = z.object({
  registration: z.enum(['public', 'invite-only']).default('public'),
  emailMethod: z.enum(['password', 'otp']).default('password'),
  google: z.enum(['true', 'false']).default('false'),
});
/** Server-owned configuration. Never trust a hidden form field for registration policy. */
export function authConfig() {
  const value = schema.parse({
    registration: process.env.AUTH_REGISTRATION,
    emailMethod: process.env.AUTH_EMAIL_METHOD,
    google: process.env.AUTH_GOOGLE_ENABLED,
  });
  return {
    ...value,
    publicSignup: value.registration === 'public',
    googleEnabled: value.google === 'true',
  };
}
