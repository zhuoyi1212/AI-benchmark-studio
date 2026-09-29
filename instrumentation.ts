export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.VERCEL || process.env.NEXT_PHASE === 'phase-production-build') return;
    const { startNodeWorker } = await import('./lib/quick/node-worker');
    await startNodeWorker();
  }
}
