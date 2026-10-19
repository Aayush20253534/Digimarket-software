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
  "approval-policies": ["GET"],
  "approvals": ["GET", "POST"],
};
const policyPattern = /^approval-policies\/(GENERAL|FINANCE|CONTENT|DELIVERABLE)$/;
const approvalPattern = /^approvals\/[0-9a-fA-F-]{36}$/;
const decisionPattern = /^approvals\/[0-9a-fA-F-]{36}\/(decision|cancel)$/;
const userActionPattern = /^users\/[0-9a-fA-F-]{36}\/(reset-password|disable|role)$/;

function permitted(path: string, method: string): boolean {
  if (policyPattern.test(path)) return method === "PUT";
  if (approvalPattern.test(path)) return method === "GET";
  if (decisionPattern.test(path)) return method === "POST";
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

  // Next.js may normalize the incoming Host to localhost even when a browser
  // connects via 127.0.0.1 or a reverse proxy. Trust only configured frontend
  // origins, never an arbitrary Host value supplied with a request.
  const allowedOrigins = (process.env.WEB_ALLOWED_ORIGINS ??
    process.env.CORS_ALLOWED_ORIGINS ??
    "http://localhost:3000,http://127.0.0.1:3000").split(",").map((value) => value.trim());
  const incomingOrigin = request.headers.get("origin");
  if (request.method !== "GET" && (!incomingOrigin || !allowedOrigins.includes(incomingOrigin))) {
    return NextResponse.json({ error: { code: "ORIGIN_DENIED", message: "Untrusted request origin" } }, { status: 403 });
  }
  const origin = incomingOrigin && allowedOrigins.includes(incomingOrigin) ? incomingOrigin : allowedOrigins[0];

  const base = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";
  const url = new URL("/api/v1/" + path, base);
  if (path === "approvals") {
    const view = request.nextUrl.searchParams.get("view");
    if (view === "mine" || view === "queue") url.searchParams.set("view", view);
  }
  const headers = new Headers({ "accept": "application/json", "origin": origin });
  const authorization = request.headers.get("authorization");
  const cookie = request.headers.get("cookie");
  if (authorization) headers.set("authorization", authorization);
  if (cookie) headers.set("cookie", cookie);

  let body: ArrayBuffer | undefined;
  if (request.method !== "GET") {
    if (!request.headers.get("content-type")?.startsWith("application/json") && path !== "auth/logout" && path !== "auth/refresh" && !path.endsWith("/cancel")) {
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
