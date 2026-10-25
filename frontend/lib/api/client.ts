export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000').replace(/\/+$/, '');

/** JSON in, JSON out. A Blob body (e.g. an uploaded PNG) is sent as-is with its own content type. */
export async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const body = init?.body;
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: init?.method ?? 'GET',
      headers:
        body === undefined ? undefined : { 'Content-Type': body instanceof Blob ? body.type : 'application/json' },
      body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
    });
  } catch {
    throw new Error(`Cannot reach the backend at ${API_URL}. Is it running?`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}
