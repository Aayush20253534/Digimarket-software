import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const endpoints: Record<string, string[]> = {
  "health": ["GET"],
  "auth/login": ["POST"],
  "auth/change-password": ["POST"],
  "auth/mfa/setup": ["POST"],
  "auth/mfa/confirm": ["POST"],
  "auth/mfa/verify": ["POST"],
  "auth/refresh": ["POST"],
  "auth/logout": ["POST"],
  "me": ["GET"],
  "users": ["GET", "POST"],
};
const userActionPattern = /^users\/[0-9a-fA-F-]{36}\/(reset-password|disable|role)$/;

function permitted(path: string, method: string): boolean {
  if (userActionPattern.test(path)) {
    return (path.endsWith("/role") ? method === "PUT" : method === "POST");
  }
  return endpoints[path]?.includes(method) ?? false;
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await context.params;
  const path = parts.join("/");
  if (!permitted(path, request.method)) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Route not found" } }, { status: 404 });
  }

  const origin = request.nextUrl.origin;
  if (request.method !== "GET" && request.headers.get("origin") !== origin) {
    return NextResponse.json({ error: { code: "ORIGIN_DENIED", message: "Untrusted request origin" } }, { status: 403 });
  }

  const base = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";
  const url = new URL("/api/v1/" + path, base);
  const headers = new Headers({ "accept": "application/json", "origin": origin });
  const authorization = request.headers.get("authorization");
  const cookie = request.headers.get("cookie");
  if (authorization) headers.set("authorization", authorization);
  if (cookie) headers.set("cookie", cookie);

  let body: ArrayBuffer | undefined;
  if (request.method !== "GET") {
    if (!request.headers.get("content-type")?.startsWith("application/json") && path !== "auth/logout" && path !== "auth/refresh") {
      return NextResponse.json({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "JSON required" } }, { status: 415 });
    }
    body = await request.arrayBuffer();
    if (body.byteLength > 131072) {
      return NextResponse.json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request too large" } }, { status: 413 });
    }
    if (body.byteLength) headers.set("content-type", "application/json");
  }

  try {
    const response = await fetch(url, {
      method: request.method, headers, body,
      cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(12000),
    });
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    const contentType = response.headers.get("content-type");
    if (contentType?.startsWith("application/json")) responseHeaders.set("content-type", "application/json");
    for (const value of response.headers.getSetCookie()) responseHeaders.append("set-cookie", value);
    return new NextResponse(response.status === 204 ? null : await response.arrayBuffer(), {
      status: response.status, headers: responseHeaders,
    });
  } catch {
    return NextResponse.json({ error: { code: "UPSTREAM_UNAVAILABLE", message: "Service temporarily unavailable" } }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
