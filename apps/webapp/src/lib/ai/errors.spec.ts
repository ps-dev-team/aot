import { describe, expect, it } from 'vitest';

import { chatErrorMessage, classifyChatError } from './errors';

/**
 * These are matched by shape rather than by class, so the tests use the shapes
 * the gateway actually throws — a retry error wrapping a rate-limit error
 * wrapping an API-call error. The nesting is the part that breaks naive
 * matching, and it is exactly what happened in practice.
 */

/** What `AI_RetryError` looks like around a 429, trimmed to the fields read. */
const gatewayRateLimit = () => ({
  name: 'AI_RetryError',
  message:
    'Failed after 3 attempts. Last error: Free tier requests on this model are rate-limited.',
  lastError: {
    name: 'GatewayRateLimitError',
    statusCode: 429,
    type: 'rate_limit_exceeded',
    cause: { name: 'AI_APICallError', statusCode: 429 },
  },
});

describe('classifyChatError', () => {
  it('recognises a rate limit nested two levels down', () => {
    expect(classifyChatError(gatewayRateLimit())).toBe('rate_limit');
  });

  it('recognises a missing credential', () => {
    const error = {
      name: 'GatewayAuthenticationError',
      message:
        'Unauthenticated request to AI Gateway. Set the AI_GATEWAY_API_KEY environment variable.',
    };
    expect(classifyChatError(error)).toBe('no_credential');
  });

  /*
   * The gateway says "Free tier users do not have access to this model" for a
   * model the key cannot reach at all, and "Free tier requests on this model
   * are rate-limited" for one it can. Both mention the free tier; only one
   * clears by waiting, so they must not collapse into the same advice.
   */
  it('tells "cannot reach this model" apart from "slow down"', () => {
    const blocked = {
      name: 'AI_APICallError',
      message: 'Free tier users do not have access to this model.',
      type: 'no_providers_available',
    };
    expect(classifyChatError(blocked)).toBe('model_unavailable');
    expect(classifyChatError(gatewayRateLimit())).toBe('rate_limit');
  });

  it('recognises an unknown model', () => {
    expect(classifyChatError({ type: 'model_not_found', message: 'no such model' })).toBe(
      'model_unavailable',
    );
  });

  it('recognises a timeout', () => {
    expect(classifyChatError(new Error('The operation timed out'))).toBe('timeout');
  });

  it('recognises an abort', () => {
    expect(classifyChatError({ name: 'AbortError', message: 'The operation was aborted' })).toBe(
      'aborted',
    );
  });

  it('falls back to unknown for anything else', () => {
    expect(classifyChatError(new Error('kaboom'))).toBe('unknown');
    expect(classifyChatError(null)).toBe('unknown');
    expect(classifyChatError('a bare string')).toBe('unknown');
  });

  /* An error chain can point back at itself; this runs on a request path. */
  it('survives a circular cause chain', () => {
    const error: Record<string, unknown> = { name: 'Loop', message: 'round we go' };
    error['cause'] = error;
    expect(() => classifyChatError(error)).not.toThrow();
  });
});

describe('chatErrorMessage', () => {
  it('says what to do about a rate limit', () => {
    const message = chatErrorMessage(gatewayRateLimit());
    expect(message).toMatch(/rate-limiting/i);
    expect(message).toMatch(/try again/i);
  });

  /* The mapped sentence must not carry anything the error was holding: an
     unmapped error can have a stack, a prompt or a key in it. */
  it('never echoes the original error text', () => {
    const message = chatErrorMessage(new Error('secret-key-abc123 blew up at line 42'));
    expect(message).not.toContain('secret-key-abc123');
    expect(message).toBe('Something went wrong reaching the model. Try again in a moment.');
  });
});
