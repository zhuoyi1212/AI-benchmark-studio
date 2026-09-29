// Run on a persistent host when the web app uses serverless functions.
const origin = process.env.QUICK_WORKER_ORIGIN;
const secret = process.env.CRON_SECRET;
if (!origin || !secret) throw new Error('Set QUICK_WORKER_ORIGIN and CRON_SECRET in the worker environment.');
const url = new URL('/api/cron/quick-workflow', origin);
if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
  throw new Error('Remote workers require HTTPS.');
}
let stopped = false;
process.on('SIGTERM', () => { stopped = true; });
process.on('SIGINT', () => { stopped = true; });
while (!stopped) {
  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${secret}` }, redirect: 'error',
      signal: AbortSignal.timeout(310_000),
    });
    if (!response.ok) console.error(`Quick worker dispatch returned HTTP ${response.status}`);
  } catch { console.error('Quick worker dispatch unavailable; retrying.'); }
  if (!stopped) await new Promise(resolve => setTimeout(resolve, 5000));
}
