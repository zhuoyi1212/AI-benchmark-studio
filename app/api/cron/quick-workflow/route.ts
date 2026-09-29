import { timingSafeEqual } from 'node:crypto';
import { runQuickWorker } from '@/lib/quick/worker';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret ?? ''}`);
  if (!secret || expected.length !== provided.length || !timingSafeEqual(expected, provided)) return new Response('Unauthorized', { status: 401 });
  await runQuickWorker(undefined, 1);
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
