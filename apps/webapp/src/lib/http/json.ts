/** Keep JSON API errors readable even when a proxy returns HTML or no body. */
export async function readJsonResponse<T>(response: Response): Promise<T> {
  let data: unknown;
  try {
    data = JSON.parse(await response.text());
  } catch {
    throw new Error(
      `The server returned an incomplete response (HTTP ${response.status}). Please retry.`,
    );
  }
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data ? data.error : null;
    throw new Error(
      typeof message === 'string' ? message : `Request failed (HTTP ${response.status}).`,
    );
  }
  return data as T;
}
/** Await the operation inside the error boundary, including rejected promises. */
export async function jsonRoute(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work();
  } catch {
    return Response.json({ error: 'The request could not finish. Please retry.' }, { status: 500 });
  }
}
