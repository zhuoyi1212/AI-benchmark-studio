import { startProfessionalReview } from "@/lib/services/blind-review.service";
import { SupabaseRequestTimeoutError } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!isAuthorized(request)) return new Response(null, { status: 404 });

  const body = await request.json().catch(() => null) as { projectId?: unknown } | null;
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) {
    return Response.json({ ok: false, error: "Invalid project ID" }, { status: 400 });
  }

  try {
    const result = await startProfessionalReview(projectId);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const timedOut = error instanceof SupabaseRequestTimeoutError;
    return Response.json({
      ok: false,
      error: error instanceof Error ? `${error.name}: ${error.message}` : "Unknown Professional Review startup failure",
    }, { status: timedOut ? 504 : 500 });
  }
}

function isAuthorized(request: Request) {
  const token = process.env.E2E_TEST_TOKEN;
  return process.env.NODE_ENV !== "production"
    && process.env.E2E_TEST_MODE === "1"
    && Boolean(token)
    && request.headers.get("x-e2e-token") === token;
}
