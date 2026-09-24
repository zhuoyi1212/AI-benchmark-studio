import "server-only";

import { z } from "zod";

export class CompletionStreamError extends Error {
  constructor(readonly category: "invalid_envelope" | "network") {
    super("AI completion stream is invalid or incomplete");
  }
}

const chunkSchema = z.object({
  id: z.string().optional(),
  request_id: z.string().optional(),
  choices: z.array(z.object({
    index: z.number().optional(),
    delta: z.object({ content: z.string().nullable().optional() }).optional(),
    finish_reason: z.string().nullable().optional(),
  })),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional(),
  }).nullable().optional(),
});

// Keep only answer deltas; provider reasoning is discarded per event.
export async function readCompletionStream(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new CompletionStreamError("network");
  const decoder = new TextDecoder();
  let pending = "";
  let content = "";
  let id: string | undefined;
  let requestId: string | undefined;
  let finishReason: string | null = null;
  let usage: z.infer<typeof chunkSchema>["usage"];
  let done = false;
  function event(value: string) {
    const data = value.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    if (!data.trim()) return;
    if (data.trim() === "[DONE]") { done = true; return; }
    let json: unknown;
    try { json = JSON.parse(data); } catch { throw new CompletionStreamError("invalid_envelope"); }
    const parsed = chunkSchema.safeParse(json);
    if (!parsed.success) throw new CompletionStreamError("invalid_envelope");
    const chunk = parsed.data;
    id = chunk.id ?? id;
    requestId = chunk.request_id ?? requestId;
    usage = chunk.usage ?? usage;
    const choice = chunk.choices.find(item => (item.index ?? 0) === 0);
    content += choice?.delta?.content ?? "";
    finishReason = choice?.finish_reason ?? finishReason;
    if (content.length > 2_000_000) throw new CompletionStreamError("invalid_envelope");
  }
  try {
    while (!done) {
      const chunk = await reader.read();
      pending += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      let boundary: RegExpExecArray | null;
      while (!done && (boundary = /\r?\n\r?\n/.exec(pending))) {
        event(pending.slice(0, boundary.index));
        pending = pending.slice(boundary.index + boundary[0].length);
      }
      if (pending.length > 2_000_000) throw new CompletionStreamError("invalid_envelope");
      if (chunk.done) { if (pending.trim() && !done) event(pending); break; }
    }
    if (!finishReason) throw new CompletionStreamError("network");
    return { id, request_id: requestId, choices: [{ message: { content }, finish_reason: finishReason }], usage: usage ?? undefined };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
