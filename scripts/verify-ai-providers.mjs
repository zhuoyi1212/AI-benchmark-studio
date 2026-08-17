import { readFile } from "node:fs/promises";

const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const zaiKey = requireValue(env.ZAI_API_KEY, "ZAI_API_KEY");
const deepSeekKey = requireValue(env.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY");

const zaiResponse = await fetch("https://api.z.ai/api/paas/v4/web_search", {
  method: "POST",
  headers: { Authorization: `Bearer ${zaiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({ search_engine: "search-prime", search_query: "Gamma official website", count: 1 }),
  signal: AbortSignal.timeout(30_000),
});
if (!zaiResponse.ok) throw new Error(`Z.AI Web Search verification failed (${zaiResponse.status})`);
const zaiPayload = await zaiResponse.json();
if (!Array.isArray(zaiPayload.search_result)) throw new Error("Z.AI Web Search returned an unexpected envelope");

const deepSeekResponse = await fetch("https://api.deepseek.com/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${deepSeekKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: env.DEEPSEEK_REASONING_MODEL || "deepseek-v4-pro",
    messages: [
      { role: "system", content: "Return JSON only." },
      { role: "user", content: "Return a JSON object with ok=true." },
    ],
    response_format: { type: "json_object" },
    thinking: { type: "enabled" },
    reasoning_effort: "high",
    max_tokens: 128,
    stream: false,
  }),
  signal: AbortSignal.timeout(90_000),
});
if (!deepSeekResponse.ok) throw new Error(`DeepSeek verification failed (${deepSeekResponse.status})`);
const deepSeekPayload = await deepSeekResponse.json();
if (typeof deepSeekPayload.choices?.[0]?.message?.content !== "string") {
  throw new Error("DeepSeek returned an unexpected envelope");
}

console.log("Z.AI Web Search: verified");
console.log("DeepSeek V4: verified");

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return [];
    const separator = trimmed.indexOf("=");
    if (separator < 1) return [];
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    return [[key, value]];
  }));
}

function requireValue(value, name) {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
