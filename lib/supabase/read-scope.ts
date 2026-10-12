import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';

type ReadScope = { responses: Map<string, Promise<Response>>; values: Map<string, Promise<unknown>>; requests: number; reused: number };
const pageReads = new AsyncLocalStorage<ReadScope>();

// Deliberately limited to a single server page render: never shared with actions,
// workers, another visitor, or the next refresh after a write.
export function withPageReads<Args extends unknown[], Result>(render: (...args: Args) => Promise<Result>) {
  return async (...args: Args): Promise<Result> => {
    if (pageReads.getStore()) return render(...args);
    const state: ReadScope = { responses: new Map(), values: new Map(), requests: 0, reused: 0 };
    const started = performance.now();
    try { return await pageReads.run(state, () => render(...args)); }
    finally {
      if (process.env.LOG_PAGE_READS === '1') console.info('[PageReads]', {
        page: render.name, durationMs: Math.round(performance.now() - started), requests: state.requests, reused: state.reused,
      });
    }
  };
}

// Read-only service composition, including signed downloads, can be reused inside
// this render. Actions and workers have no scope and always execute fresh reads.
export async function memoPageRead<T>(key: string, execute: () => Promise<T>): Promise<T> {
  const scope = pageReads.getStore();
  if (!scope) return execute();
  const previous = scope.values.get(key);
  if (previous) return previous as Promise<T>;
  const pending = execute();
  scope.values.set(key, pending);
  try { return await pending; }
  catch (error) { scope.values.delete(key); throw error; }
}

export async function fetchPageRead(input: RequestInfo | URL, init: RequestInit | undefined, execute: () => Promise<Response>) {
  const scope = pageReads.getStore();
  if (!scope || input instanceof Request || init?.signal || (init?.method ?? 'GET').toUpperCase() !== 'GET') return execute();
  const headers = [...new Headers(init?.headers).entries()].sort(([a], [b]) => a.localeCompare(b));
  const key = JSON.stringify([String(input), headers, init?.cache, init?.credentials]);
  const previous = process.env.PAGE_READ_DEDUPE_DISABLED === '1' ? undefined : scope.responses.get(key);
  if (previous) { scope.reused++; return (await previous).clone(); }
  scope.requests++;
  const pending = execute();
  scope.responses.set(key, pending);
  try {
    const response = await pending;
    if (!response.ok) scope.responses.delete(key);
    return response.clone();
  } catch (error) { scope.responses.delete(key); throw error; }
}
