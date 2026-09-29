import 'server-only';
import { after } from 'next/server';
import { runQuickWorker } from './worker';

// Low-latency wake-up. The durable queue, server poller and cron are the recovery path.
export function wakeQuickWorker(projectId: string) {
  after(async () => {
    try { await runQuickWorker(projectId, 1); }
    catch { console.error('[QuickWorker] Dispatch failed; persisted jobs await recovery.'); }
  });
}
