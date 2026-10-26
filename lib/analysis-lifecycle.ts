// Analysis calls have a bounded execution budget; a lost worker must not leave
// the UI waiting forever. Reads only project the timeout; retry records failure.
export function analysisExecutionExpired(run: { status: string; updated_at: string; started_at: string | null }, now = Date.now()): boolean {
  const heartbeat = Date.parse(run.updated_at || run.started_at || "");
  return ["pending", "running"].includes(run.status) && Number.isFinite(heartbeat) && now - heartbeat > 30 * 60_000;
}
