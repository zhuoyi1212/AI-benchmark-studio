import { verifyMediaRuntime } from "@/lib/media/runtime-check";

// /api/* is administrator-only under proxy.ts, including read requests.
export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json(await verifyMediaRuntime(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ ok: false, error: "FFmpeg/FFprobe runtime verification failed" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
