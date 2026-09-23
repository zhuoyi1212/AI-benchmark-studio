import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnvironment } from "@/lib/env/server";
import type { Database } from "@/lib/types/database";

const defaultRequestTimeoutMs = 30_000;
const requestTimeoutScope = new AsyncLocalStorage<{ signal: AbortSignal; operation: string; timeoutMs: number }>();
let serverClient: SupabaseClient<Database> | undefined;

export class SupabaseRequestTimeoutError extends Error {
  constructor(readonly operation: string, readonly timeoutMs: number) {
    super(`Supabase step "${operation}" timed out after ${timeoutMs} ms`);
    this.name = "SupabaseRequestTimeoutError";
  }
}

export async function withSupabaseRequestTimeout<T>(
  operation: string,
  timeoutMs: number,
  run: () => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeoutError = new SupabaseRequestTimeoutError(operation, timeoutMs);
  const timer = setTimeout(() => controller.abort(timeoutError), timeoutMs);
  let rejectOnTimeout: (() => void) | undefined;
  const timeout = new Promise<never>((_, reject) => {
    rejectOnTimeout = () => reject(controller.signal.reason ?? timeoutError);
    controller.signal.addEventListener("abort", rejectOnTimeout, { once: true });
  });

  try {
    return await requestTimeoutScope.run(
      { signal: controller.signal, operation, timeoutMs },
      () => Promise.race([run(), timeout]),
    );
  } finally {
    clearTimeout(timer);
    if (rejectOnTimeout) controller.signal.removeEventListener("abort", rejectOnTimeout);
  }
}

export function getSupabaseServerClient(): SupabaseClient<Database> {
  if (serverClient) return serverClient;

  const { supabaseUrl, supabaseSecretKey } = getServerEnvironment();
  serverClient = createClient<Database>(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: { "x-application-name": "ai-benchmark-studio" },
      fetch: fetchWithTimeout,
    },
  });
  return serverClient;
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const scope = requestTimeoutScope.getStore();
  const requestTimeout = AbortSignal.timeout(scope?.timeoutMs ?? defaultRequestTimeoutMs);
  const signals = [init?.signal, scope?.signal, requestTimeout].filter((signal): signal is AbortSignal => Boolean(signal));
  try {
    return await fetch(input, { ...init, signal: AbortSignal.any(signals) });
  } catch (error) {
    if (scope?.signal.aborted && scope.signal.reason instanceof SupabaseRequestTimeoutError) {
      throw scope.signal.reason;
    }
    if (requestTimeout.aborted) {
      throw new SupabaseRequestTimeoutError(scope?.operation ?? "request", scope?.timeoutMs ?? defaultRequestTimeoutMs);
    }
    throw error;
  }
}
