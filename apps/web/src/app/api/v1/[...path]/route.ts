import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const endpoints: Record<string, string[]> = {
  "health": ["GET"],
  "notes": ["GET","POST"],
  "notes/notebooks": ["GET","POST"],
  "asset-folders": ["GET","POST"],
  "finance/proof-intent": ["POST"],
  "finance/proof-confirm": ["POST"],
  "search": ["GET"],
  "reports/overview": ["GET"],
  "notifications": ["GET"],
  "notifications/read-all": ["POST"],
  "founders": ["GET","POST"],
  "founders/eligible-staff": ["GET"],
  "company-settings": ["GET","PUT"],
  "billing-defaults": ["GET"],
  "company-settings/billing": ["PUT"],
  "auth/login": ["POST"],
  "auth/change-password": ["POST"],
  "auth/refresh": ["POST"],
  "auth/logout": ["POST"],
  "me": ["GET"],
  "users": ["GET", "POST"],
  "approval-policies": ["GET"],
  "approvals": ["GET", "POST"],
  "finance/categories": ["GET", "POST"],
  "finance/entries": ["GET", "POST"],
  "finance/summary": ["GET"],
  "finance/export": ["GET"],
  "leads": ["GET","POST"],
  "clients": ["GET","POST"],
  "assets": ["GET"],
  "projects": ["GET","POST"],
  "projects/assignees": ["GET"],
  "tasks": ["GET","POST"],
  "content": ["GET","POST"],
  "invoices": ["GET","POST"],
  "invoices/receivables": ["GET"],
  "payments": ["GET","POST"],
  "billing-schedules": ["GET","POST"],
  "profitability/report": ["GET"],
  "profitability/export": ["GET"],
  "profitability/expenses": ["GET"],
  "profitability/recognitions": ["GET","POST"],
  "content/staff": ["GET"],
  "tasks/team": ["GET"],
  "task-recurrences": ["GET","POST"],
  "assets/upload-intent": ["POST"],
  "assets/confirm": ["POST"],
  "leads/duplicates": ["GET"],
  "leads/assignees": ["GET"],
  "leads/import": ["POST"],
  "leads/export": ["GET"],
};
const folderArchivePattern=/^asset-folders\/[0-9a-fA-F-]{36}\/download$/;
const folderDetailPattern=/^asset-folders\/[0-9a-fA-F-]{36}$/;
const financeProofPattern=/^finance\/entries\/[0-9a-fA-F-]{36}\/proof$/;
const assetOrganizePattern=/^assets\/[0-9a-fA-F-]{36}\/organize$/;
const noteDetailPattern=/^notes\/[0-9a-fA-F-]{36}$/;
const notebookDetailPattern=/^notes\/notebooks\/[0-9a-fA-F-]{36}$/;
const noteMetadataPattern=/^notes\/[0-9a-fA-F-]{36}\/metadata$/;
const noteRestorePattern=/^notes\/[0-9a-fA-F-]{36}\/restore$/;
const notePermanentPattern=/^notes\/[0-9a-fA-F-]{36}\/permanent$/;
const notificationReadPattern=/^notifications\/[0-9a-fA-F-]{36}\/read$/;
const founderDetailPattern=/^founders\/[0-9a-fA-F-]{36}$/;
const financeCategoryDetailPattern = /^finance\/categories\/[0-9a-fA-F-]{36}$/;
const financeEntryDetailPattern = /^finance\/entries\/[0-9a-fA-F-]{36}$/;
const financeCategoryStatusPattern = /^finance\/categories\/[0-9a-fA-F-]{36}\/status$/;
const policyPattern = /^approval-policies\/(GENERAL|FINANCE|CONTENT|DELIVERABLE)$/;
const approvalPattern = /^approvals\/[0-9a-fA-F-]{36}$/;
const decisionPattern = /^approvals\/[0-9a-fA-F-]{36}\/(decision|cancel)$/;
const profitExpensePattern=/^profitability\/expenses\/[0-9a-fA-F-]{36}\/allocations$/;
const profitReversePattern=/^profitability\/recognitions\/[0-9a-fA-F-]{36}\/reverse$/;
const invoiceDetailPattern=/^invoices\/[0-9a-fA-F-]{36}$/;
const invoiceActionPattern=/^invoices\/[0-9a-fA-F-]{36}\/(issue|void)$/;
const invoicePdfPattern=/^invoices\/[0-9a-fA-F-]{36}\/pdf$/;
const paymentActionPattern=/^payments\/[0-9a-fA-F-]{36}\/(verify|reject)$/;
const billingSchedulePattern=/^billing-schedules\/[0-9a-fA-F-]{36}$/;
const contentDetailPattern=/^content\/[0-9a-fA-F-]{36}$/;
const contentActionPattern=/^content\/[0-9a-fA-F-]{36}\/(submit|schedule|publish|cancel)$/;
const taskDetailPattern=/^tasks\/[0-9a-fA-F-]{36}$/;
const taskActionPattern=/^tasks\/[0-9a-fA-F-]{36}\/(assignees|checklist|comments)$/;
const taskChecklistItemPattern=/^tasks\/[0-9a-fA-F-]{36}\/checklist\/[0-9a-fA-F-]{36}$/;
const taskRecurrencePattern=/^task-recurrences\/[0-9a-fA-F-]{36}$/;
const projectDetailPattern = /^projects\/[0-9a-fA-F-]{36}$/;
const projectChildrenPattern = /^projects\/[0-9a-fA-F-]{36}\/(members|milestones|deliverables)$/;
const projectMemberRemovePattern = /^projects\/[0-9a-fA-F-]{36}\/members\/[0-9a-fA-F-]{36}\/remove$/;
const projectMilestonePattern = /^projects\/[0-9a-fA-F-]{36}\/milestones\/[0-9a-fA-F-]{36}$/;
const projectDeliverablePattern = /^projects\/[0-9a-fA-F-]{36}\/deliverables\/[0-9a-fA-F-]{36}$/;
const projectDeliverableSubmitPattern = /^projects\/[0-9a-fA-F-]{36}\/deliverables\/[0-9a-fA-F-]{36}\/submit$/;
const clientDetailPattern = /^clients\/[0-9a-fA-F-]{36}$/;
const clientChildrenPattern = /^clients\/[0-9a-fA-F-]{36}\/(contacts|services)$/;
const clientConvertPattern = /^leads\/[0-9a-fA-F-]{36}\/convert$/;
const assetIdPattern = /^assets\/[0-9a-fA-F-]{36}$/;
const assetActionPattern = /^assets\/[0-9a-fA-F-]{36}\/(authorized-download|link|archive)$/;
const leadDetailPattern = /^leads\/[0-9a-fA-F-]{36}$/;
const leadAssignPattern = /^leads\/[0-9a-fA-F-]{36}\/assign$/;
const leadNotesPattern = /^leads\/[0-9a-fA-F-]{36}\/notes$/;
const leadDuplicateReviewPattern = /^leads\/duplicates\/[0-9a-fA-F-]{36}\/review$/;
const userActionPattern = /^users\/[0-9a-fA-F-]{36}\/(reset-password|disable|role)$/;

function permitted(path: string, method: string): boolean {
  if(financeProofPattern.test(path))return method==="GET";
  if(folderArchivePattern.test(path))return method==="POST";
  if(folderDetailPattern.test(path))return ["PUT","DELETE"].includes(method);
  if(assetOrganizePattern.test(path))return method==="POST";
  if(noteDetailPattern.test(path))return ["GET","PUT","DELETE"].includes(method);
  if(notebookDetailPattern.test(path))return ["PUT","DELETE"].includes(method);
  if(noteMetadataPattern.test(path))return method==="PUT";
  if(noteRestorePattern.test(path))return method==="POST";
  if(notePermanentPattern.test(path))return method==="DELETE";
  if(notificationReadPattern.test(path))return method==="POST";
  if(founderDetailPattern.test(path))return method==="PUT";
  if(profitExpensePattern.test(path))return method==="PUT";
  if(profitReversePattern.test(path))return method==="POST";
  if(invoiceDetailPattern.test(path))return ["GET","PUT"].includes(method);
  if(invoiceActionPattern.test(path))return method==="POST";
  if(invoicePdfPattern.test(path))return method==="GET";
  if(paymentActionPattern.test(path))return method==="POST";
  if(billingSchedulePattern.test(path))return method==="PUT";
  if(contentDetailPattern.test(path))return ["GET","PUT"].includes(method);
  if(contentActionPattern.test(path))return method==="POST";
  if(taskDetailPattern.test(path))return ["GET","PUT"].includes(method);
  if(taskActionPattern.test(path))return path.endsWith("/assignees")?method==="PUT":method==="POST";
  if(taskChecklistItemPattern.test(path))return method==="PUT";
  if(taskRecurrencePattern.test(path))return method==="PUT";
  if (projectDetailPattern.test(path)) return ["GET","PUT"].includes(method);
  if (projectChildrenPattern.test(path)) return method==="POST";
  if (projectMemberRemovePattern.test(path)) return method==="POST";
  if (projectMilestonePattern.test(path)) return method==="PUT";
  if (projectDeliverablePattern.test(path)) return method==="PUT";
  if (projectDeliverableSubmitPattern.test(path)) return method==="POST";
  if (assetIdPattern.test(path)) return method==="GET";
  if (assetActionPattern.test(path)) return method==="POST";
  if (clientDetailPattern.test(path)) return ["GET","PUT"].includes(method);
  if (clientChildrenPattern.test(path)) return method === "POST";
  if (clientConvertPattern.test(path)) return method === "POST";
  if (leadDetailPattern.test(path)) return ["GET","PUT"].includes(method);
  if (leadAssignPattern.test(path)) return method === "PUT";
  if (leadNotesPattern.test(path)||leadDuplicateReviewPattern.test(path)) return method === "POST";
  if (financeCategoryDetailPattern.test(path)||financeEntryDetailPattern.test(path)) return ["PUT","DELETE"].includes(method);
  if (financeCategoryStatusPattern.test(path)) return method === "PUT";
  if (policyPattern.test(path)) return method === "PUT";
  if (approvalPattern.test(path)) return method === "GET";
  if (decisionPattern.test(path)) return method === "POST";
  if (userActionPattern.test(path)) {
    return (path.endsWith("/role") ? method === "PUT" : method === "POST");
  }
  return endpoints[path]?.includes(method) ?? false;
}

// Vercel gives each production/preview deployment a distinct verified host.
// Only trust platform-assigned *.vercel.app hosts and explicit frontend origins;
// never trust arbitrary Host or X-Forwarded-Host headers for CSRF validation.
function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    return url.protocol === "https:" || localHttp ? url.origin : null;
  } catch {
    return null;
  }
}

function platformVercelOrigin(host: string | undefined): string | null {
  if (!host || !/^[a-z0-9-]+(?:[.][a-z0-9-]+)*[.]vercel[.]app$/.test(host)) return null;
  return "https://" + host;
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await context.params;
  const path = parts.join("/");
  if (!permitted(path, request.method)) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Route not found" } }, { status: 404 });
  }

  const configuredOrigins = (process.env.WEB_ALLOWED_ORIGINS ??
    process.env.CORS_ALLOWED_ORIGINS ??
    "http://localhost:3000,http://127.0.0.1:3000")
    .split(",").map(normalizeOrigin).filter((value): value is string => value !== null);
  const allowedOrigins = new Set(configuredOrigins);
  if (process.env.VERCEL === "1") {
    for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
      const vercelOrigin = platformVercelOrigin(host);
      if (vercelOrigin) allowedOrigins.add(vercelOrigin);
    }
  }
  const incomingOrigin = request.headers.get("origin");
  if (request.method !== "GET" && (!incomingOrigin || !allowedOrigins.has(incomingOrigin))) {
    return NextResponse.json({ error: { code: "ORIGIN_DENIED", message: "Untrusted request origin" } }, { status: 403 });
  }
  // The backend validates cookie-authenticated POSTs against its own CORS list.
  // Forward one configured canonical origin, not an alternate deployment alias.
  const upstreamOrigin = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",").map(normalizeOrigin).find((value) => value !== null) ?? configuredOrigins[0];
  if (!upstreamOrigin) {
    return NextResponse.json({ error: { code: "ORIGIN_CONFIG_ERROR", message: "Frontend origin configuration is missing" } }, { status: 503 });
  }

  const base = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";
  const url = new URL("/api/v1/" + path, base);
  if (path === "approvals" || ["finance/entries","finance/summary","finance/export"].includes(path)) {
    const view = request.nextUrl.searchParams.get("view");
    if (view && (path==="approvals"?["mine","queue","history"]:["mine","all"]).includes(view)) url.searchParams.set("view", view);
  }
  if(noteDetailPattern.test(path)&&request.method==="DELETE"){
    const version=request.nextUrl.searchParams.get("version");
    if(version!==null)url.searchParams.set("version",version);
  }
  if(path==="search"){
    const q=request.nextUrl.searchParams.get("q");
    if(q!==null)url.searchParams.set("q",q);
  }
  if(path==="reports/overview"){
    for(const key of ["from","to"]){
      const v=request.nextUrl.searchParams.get(key);
      if(v!==null)url.searchParams.set(key,v);
    }
  }
  if(path==="notifications"){
    for(const key of ["unread","limit"]){
      const v=request.nextUrl.searchParams.get(key);
      if(v!==null)url.searchParams.set(key,v);
    }
  }
  if (path === "asset-folders") {
    const parentId=request.nextUrl.searchParams.get("parentId");
    if(parentId!==null)url.searchParams.set("parentId",parentId);
  }
  if (path === "assets") {
    for (const key of ["q","clientId","status","cursor","limit","folderId","sort","direction"]) {
      const value=request.nextUrl.searchParams.get(key);
      if(value!==null)url.searchParams.set(key,value);
    }
  }
  if(["profitability/report","profitability/export","profitability/expenses"].includes(path)){
    for(const key of ["from","to","clientId"]){
      const v=request.nextUrl.searchParams.get(key);
      if(v!==null)url.searchParams.set(key,v);
    }
  }
  if(path==="profitability/recognitions"){
    const id=request.nextUrl.searchParams.get("clientId");
    if(id!==null)url.searchParams.set("clientId",id);
  }
  if(path==="invoices"){
    for(const key of ["clientId","status","limit","cursor"]){
      const v=request.nextUrl.searchParams.get(key);
      if(v!==null)url.searchParams.set(key,v);
    }
  }
  if(path==="payments"){
    const v=request.nextUrl.searchParams.get("clientId");
    if(v!==null)url.searchParams.set("clientId",v);
  }
  if (path === "content") {
    for (const key of ["clientId","ownerId","status","platform","start","end","q","limit","cursor"]) {
      const value=request.nextUrl.searchParams.get(key);
      if(value!==null)url.searchParams.set(key,value);
    }
  }
  if (path === "tasks") {
    for(const key of ["view","status","projectId","q","cursor","limit"]){
      const v=request.nextUrl.searchParams.get(key);
      if(v!==null)url.searchParams.set(key,v);
    }
  }
  if (path === "projects") {
    for (const key of ["q","status","clientId","cursor","limit"]) {
      const value=request.nextUrl.searchParams.get(key);
      if(value!==null)url.searchParams.set(key,value);
    }
  }
  if (path === "clients") {
    for (const key of ["status","q","cursor","limit"]) {
      const value=request.nextUrl.searchParams.get(key);
      if(value!==null)url.searchParams.set(key,value);
    }
  }
  if (path === "leads") {
    for (const key of ["stage","assignedToId","q","cursor","limit"]) {
      const value=request.nextUrl.searchParams.get(key);
      if(value!==null)url.searchParams.set(key,value);
    }
  }
  const headers = new Headers({ "accept": "application/json", "origin": upstreamOrigin });
  const authorization = request.headers.get("authorization");
  const cookie = request.headers.get("cookie");
  if (authorization) headers.set("authorization", authorization);
  if (cookie) headers.set("cookie", cookie);

  let body: ArrayBuffer | undefined;
  if (request.method !== "GET") {
    if (!request.headers.get("content-type")?.startsWith("application/json") && path !== "auth/logout" && path !== "auth/refresh" && request.method !== "DELETE" && !path.endsWith("/cancel")) {
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
      cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(folderArchivePattern.test(path)?55000:12000),
    });
    // A new web deployment can point at a stale Render API. Its fallback 404
    // includes meta.requestId, unlike an actual missing note. Report the
    // deployment mismatch instead of misleading users with "Route not found".
    if (response.status===404 && (path==="notes" || noteDetailPattern.test(path))) {
      const payload=await response.clone().json().catch(()=>null) as
        {error?:{code?:string;message?:string};meta?:{requestId?:string}} | null;
      if(payload?.error?.code==="NOT_FOUND" && payload.error.message==="Route not found"
        && typeof payload.meta?.requestId==="string"){
        return NextResponse.json({error:{code:"NOTES_API_NOT_DEPLOYED",
          message:"Notes is not available on the deployed API. Deploy the latest main branch on Render and apply the database migrations."}},
          {status:503,headers:{"Cache-Control":"no-store"}});
      }
    }
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    const contentType = response.headers.get("content-type");
    if (contentType?.startsWith("application/json")) responseHeaders.set("content-type", "application/json");
    if (folderArchivePattern.test(path) && contentType?.startsWith("application/zip")){
      responseHeaders.set("content-type","application/zip");
      const disposition=response.headers.get("content-disposition");
      if(disposition)responseHeaders.set("content-disposition",disposition);
    }
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
export const DELETE = proxy;
