import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const ACCESS_REALM = "AI Benchmark Studio";
const DEFAULT_USERNAME = "studio";
const PUBLIC_PATHS = new Set(["/"]);

export function proxy(request: NextRequest) {
  // This exact endpoint verifies CRON_SECRET itself.
  if (request.nextUrl.pathname === '/api/cron/quick-workflow') return NextResponse.next();
  if (PUBLIC_PATHS.has(request.nextUrl.pathname)) return nextWithSurface(request, "showcase");

  const configuredPassword = process.env.APP_ACCESS_PASSWORD;

  if (!configuredPassword) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Server access protection is not configured.", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return nextWithSurface(request, "workspace");
  }

  const configuredUsername = process.env.APP_ACCESS_USERNAME?.trim() || DEFAULT_USERNAME;
  const credentials = parseBasicCredentials(request.headers.get("authorization"));

  if (
    !credentials
    || !secureEqual(credentials.username, configuredUsername)
    || !secureEqual(credentials.password, configuredPassword)
  ) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": `Basic realm="${ACCESS_REALM}", charset="UTF-8"`,
      },
    });
  }

  const response = nextWithSurface(request, "workspace");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function nextWithSurface(request: NextRequest, surface: "showcase" | "workspace") {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-ai-benchmark-surface", surface);
  return NextResponse.next({ request: { headers: requestHeaders } });
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
