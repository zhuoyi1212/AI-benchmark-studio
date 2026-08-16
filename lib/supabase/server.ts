import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnvironment } from "@/lib/env/server";
import type { Database } from "@/lib/types/database";

let serverClient: SupabaseClient<Database> | undefined;

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
    },
  });
  return serverClient;
}
