/**
 * What to tell someone when a turn fails.
 *
 * The AI SDK masks every server-side error as "An error occurred." by default,
 * which is the right default — an unmapped error can carry a stack, a prompt or
 * a key. But the failures that actually happen in a chat are operational, not
 * secret: the provider is rate-limiting, the credential is missing, the model
 * took too long. Saying so is the difference between "try again in a minute"
 * and "the product is broken".
 *
 * So: recognised cases get a real sentence, everything else gets the generic
 * one. The full error is logged server-side either way.
 */

export type ChatErrorKind =
  'rate_limit' | 'model_unavailable' | 'no_credential' | 'timeout' | 'aborted' | 'unknown';

const MESSAGES: Record<ChatErrorKind, string> = {
  rate_limit:
    'The model provider is rate-limiting this key. Wait a moment and try again, or switch models in AI_MODEL.',
  model_unavailable:
    'This key cannot reach the configured model. Pick another in AI_MODEL, or add paid credits to the AI Gateway.',
  no_credential:
    'No AI Gateway credential is configured, so the agent cannot reach a model. Set AI_GATEWAY_API_KEY.',
  timeout: 'The model took too long to answer. Try again, or ask for something shorter.',
  aborted: 'That turn was stopped.',
  unknown: 'Something went wrong reaching the model. Try again in a moment.',
};

/**
 * Classify by shape rather than by class.
 *
 * The gateway wraps its errors (a retry error around a rate-limit error around
 * an API-call error), and `instanceof` across that chain means importing every
 * provider's error class and keeping up as they change. The status code and the
 * type string are what actually identify these, and they survive serialization.
 */
export const classifyChatError = (error: unknown): ChatErrorKind => {
  const haystack = describe(error).toLowerCase();

  if (haystack.includes('aborted') || haystack.includes('abortsignal')) return 'aborted';

  /*
   * Checked before the rate limit, because the gateway's free-tier refusal
   * carries "Free tier" in both messages and the two mean different things: one
   * clears on its own in a minute, the other never does until the model changes
   * or the account does.
   */
  if (
    haystack.includes('no_providers_available') ||
    haystack.includes('do not have access') ||
    haystack.includes('model_not_found')
  ) {
    return 'model_unavailable';
  }

  if (
    haystack.includes('rate_limit') ||
    haystack.includes('rate limit') ||
    haystack.includes('429')
  ) {
    return 'rate_limit';
  }
  if (
    haystack.includes('unauthenticated') ||
    haystack.includes('ai_gateway_api_key') ||
    haystack.includes('401')
  ) {
    return 'no_credential';
  }
  if (haystack.includes('timeout') || haystack.includes('timed out')) return 'timeout';

  return 'unknown';
};

/** The sentence to show. Never contains anything the error carried. */
export const chatErrorMessage = (error: unknown): string => MESSAGES[classifyChatError(error)];

/**
 * A string to match against, including nested causes.
 *
 * Bounded depth because an error chain can be circular, and this runs on a
 * request path.
 */
const describe = (error: unknown, depth = 0): string => {
  if (depth > 4 || error == null) return '';
  if (typeof error === 'string') return error;
  if (typeof error !== 'object') return String(error);

  const record = error as Record<string, unknown>;
  const parts = [
    record['name'],
    record['message'],
    record['type'],
    record['statusCode'],
    record['status'],
  ]
    .filter((value) => value != null)
    .map(String);

  return [...parts, describe(record['cause'], depth + 1), describe(record['lastError'], depth + 1)]
    .filter(Boolean)
    .join(' ');
};
