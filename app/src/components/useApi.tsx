import { createResource, onCleanup } from 'solid-js';

const PREFIX = globalThis?.location?.origin ?? `http://localhost`;

class FetchError extends Error {
  statusCode: number;
  constructor(msg: string, options: ErrorOptions | undefined, statusCode: number) {
    super(msg, options);
    this.statusCode = statusCode;
  }
}

async function fetcher(url: URL | string): Promise<Object | Object[]> {
  const res = await fetch(url.toString(), {
    credentials: 'same-origin',
    headers: [
      ['Content-Type', 'application/json']
    ],
    // ...options
  });

  if (!res.ok) {
    const msg = (await res.json()).message || "No error message available.";
    // If unauthorized this cookie is no good, so we remove it
    const error = new FetchError(msg, undefined, res.status);
    throw error;
  }

  return await res.json();
}

export function useApi(func: Function) {

  const results = createResource(() => {
    const url = new URL(func(), PREFIX);
    if (process.env.NODE_ENV === 'development')
      url.port = '8000';
    return url;
  }, fetcher);
  return results;
}

export function useEvents() {
  const url = new URL('/events', PREFIX);
  if (process.env.NODE_ENV === 'development')
    url.port = '8000';
  const sse = new EventSource(url);
  onCleanup(() => {
    sse.close();
  });
  return sse;
}