import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const ACCESS_REALM = "AI Benchmark Studio";
const DEFAULT_USERNAME = "studio";
const ACCESS_HEADER = "x-ai-benchmark-access";

export function proxy(request: NextRequest) {
  // This exact endpoint verifies CRON_SECRET itself.
  if (request.nextUrl.pathname === '/api/cron/quick-workflow') return NextResponse.next();
  const configuredPassword = process.env.APP_ACCESS_PASSWORD;
  const configuredUsername = process.env.APP_ACCESS_USERNAME?.trim() || DEFAULT_USERNAME;
  const credentials = parseBasicCredentials(request.headers.get("authorization"));
  const authenticated = Boolean(
    configuredPassword
    && credentials
    && secureEqual(credentials.username, configuredUsername)
    && secureEqual(credentials.password, configuredPassword),
  );

  if (authenticated) return nextWithAccess(request, "admin");

  if (isPublicReadRequest(request)) {
    return nextWithAccess(request, "read-only");
  }

  if (!configuredPassword) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Server access protection is not configured.", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return nextWithAccess(request, "admin");
  }

  return new NextResponse("Administrator authentication required.", {
    status: 401,
    headers: {
      "Cache-Control": "no-store",
      "WWW-Authenticate": `Basic realm="${ACCESS_REALM}", charset="UTF-8"`,
    },
  });
}

function isPublicReadRequest(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;

  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/api/")) return false;
  if (pathname === "/admin" || pathname.startsWith("/settings") || pathname.startsWith("/benchmark")) return false;
  if (pathname === "/projects/new" || pathname.startsWith("/projects/demo")) return false;
  if (/^\/projects\/[^/]+\/settings(?:\/|$)/.test(pathname)) return false;
  return true;
}

function nextWithAccess(request: NextRequest, access: "admin" | "read-only") {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(ACCESS_HEADER, access);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Authorization");
  return response;
}

function parseBasicCredentials(header: string | null) {
  if (!header?.startsWith("Basic ")) return null;

  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function secureEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
