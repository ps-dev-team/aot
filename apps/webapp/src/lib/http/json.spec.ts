import { expect, it } from 'vitest';
import { jsonRoute, readJsonResponse } from './json';
it('awaits asynchronous route rejections within the error boundary', async () => {
  const r = await jsonRoute(async () => {
    await Promise.resolve();
    throw new Error('private');
  });
  expect(r.status).toBe(500);
  expect(await r.json()).toEqual({ error: 'The request could not finish. Please retry.' });
});
it('handles empty and proxy error replies without JSON syntax errors', async () => {
  for (const text of ['', '<html>error</html>'])
    await expect(readJsonResponse(new Response(text, { status: 502 }))).rejects.toThrow('HTTP 502');
  await expect(
    readJsonResponse(Response.json({ error: 'Try later' }, { status: 429 })),
  ).rejects.toThrow('Try later');
});
