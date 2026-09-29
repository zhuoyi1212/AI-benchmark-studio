export async function startNodeWorker() {
  if (process.env.QUICK_WORKER_DISABLED === '1') return;
  const { runQuickWorker } = await import('./worker');
  const runtime = globalThis as typeof globalThis & { quickWorkerTimer?: ReturnType<typeof setInterval>; quickWorkerBusy?: boolean };
  if (runtime.quickWorkerTimer) return;
  runtime.quickWorkerTimer = setInterval(async () => {
    if (runtime.quickWorkerBusy) return;
    runtime.quickWorkerBusy = true;
    try { await runQuickWorker(undefined, 1); }
    catch { console.error('[QuickWorker] Queue unavailable; will check again.'); }
    finally { runtime.quickWorkerBusy = false; }
  }, 5000);
  runtime.quickWorkerTimer.unref();
}
