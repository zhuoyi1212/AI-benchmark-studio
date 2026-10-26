import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/** Private Storage only. Derivatives refer to an original artifact, never new experimental artifacts. */
export interface MediaCache {
  read(key: string): Promise<unknown | undefined>;
  write(key: string, value: unknown): Promise<void>;
}
export const mediaEvidenceRepository: MediaCache = {
  async read(key) {
    const { data, error } = await getSupabaseServerClient().storage.from("benchmark-artifacts").download(`media-cache/${key}.json`);
    if (error || !data) return undefined;
    if (data.size > 32 * 1024 * 1024) return undefined;
    try { return JSON.parse(await data.text()); } catch { return undefined; }
  },
  async write(key, value) {
    const body = JSON.stringify(value);
    if (Buffer.byteLength(body) > 32 * 1024 * 1024) throw new Error("Media cache size exceeded");
    const { error } = await getSupabaseServerClient().storage.from("benchmark-artifacts").upload(`media-cache/${key}.json`, body, { contentType: "application/json", upsert: false });
    // A competing worker may already have written the same immutable derivative.
    if (error && !["409", "Duplicate"].includes(String(error.statusCode))) throw new Error("Media cache write failed");
  },
};
