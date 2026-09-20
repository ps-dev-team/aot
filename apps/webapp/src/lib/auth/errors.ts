export type AuthFailure = { code?: string; status?: number };
/** Stable provider codes only. Never log raw errors, addresses, tokens, or webhook payloads. */
export function authFailure(error: AuthFailure, operation: string): string {
  console.warn('[auth]', { operation, code: error.code ?? 'unknown', status: error.status });
  switch (error.code) {
    case 'over_email_send_rate_limit':
      return 'Email sending is temporarily at its limit. Please try later or contact support.';
    case 'over_request_rate_limit':
      return 'Please wait before requesting another code.';
    case 'hook_timeout':
    case 'hook_timeout_after_retry':
      return 'The email service could not be reached. Please contact support.';
    case 'hook_payload_invalid_content_type':
    case 'hook_payload_over_size_limit':
      return 'The email service is not configured correctly. Please contact support.';
    case 'otp_expired':
      return 'That code is invalid or expired. Request a new one.';
    default:
      return error.status === 429
        ? 'Too many attempts. Please try again later.'
        : 'Unable to complete sign-in. Please try again or contact support.';
  }
}
