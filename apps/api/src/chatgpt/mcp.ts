import { createHash } from "node:crypto";
import type { Express } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { leadCreateSchema, leadUpdateSchema, leadStageSchema, leadListQuerySchema,
  clientListQuerySchema } from "@digimarket/contracts";
import type { AuthService, Principal } from "../auth/service";
import { LeadsService } from "../leads/service";
import { ClientsService } from "../clients/service";
import { AuthError, forbidden, unauthorized } from "../auth/errors";
import { authenticateChatGpt, checked, configuredOrigins, requireScope,
  type CrmScope } from "./oauth";

type JsonSchema = Record<string, unknown>;
type ToolDefinition = { name: string; description: string; inputSchema: JsonSchema;
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; openWorldHint: boolean } };
const field = (type: string, description: string): JsonSchema => ({ type, description });
const object = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({
  type: "object", properties, required, additionalProperties: false,
});
const uuid = field("string", "Existing record UUID");
const day = field("string", "YYYY-MM-DD calendar date in Asia/Kolkata");
const version = field("integer", "Current CRM optimistic concurrency version");
const limit = { type: "integer", minimum: 1, maximum: 100, default: 20 };
const confirmed = { type: "boolean", const: true, description: "True only after the user has explicitly approved this exact mutation" };
const write = { confirmed, idempotencyKey: field("string", "Fresh UUID for one approved mutation; reuse for a retry") };
const read = (name: string, description: string, properties: Record<string, JsonSchema> = {},
  required: string[] = []): ToolDefinition => ({ name, description, inputSchema: object(properties, required),
  annotations: { readOnlyHint: true, openWorldHint: false } });
const mutate = (name: string, description: string, properties: Record<string, JsonSchema>,
  required: string[]): ToolDefinition => ({ name, description: "WRITE: " + description +
    " Ask the user to confirm before calling. Requires confirmed=true and an idempotency UUID.",
    inputSchema: object({ ...properties, ...write }, [...required, "confirmed", "idempotencyKey"]),
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false } });

export const CHATGPT_TOOLS: ToolDefinition[] = [
  read("get_crm_overview", "Live, tenant-scoped CRM totals. No advertising spend."),
  read("list_leads", "Paginate leads with optional stage and source. Phone is withheld unless explicitly authorized.",
    { stage: field("string", "One of the CRM lead stages"), source: field("string", "COLD_CALL, META_LEADS, REFERRAL"),
      q: field("string", "Business search"), cursor: uuid, limit,
      includePhone: field("boolean", "Return phone numbers only when contact scope permits") }),
  read("get_lead_details", "Safe lead fields, version, schedules and non-sensitive activity history",
    { id: uuid, includePhone: field("boolean", "Explicitly request a phone number") }, ["id"]),
  read("get_todays_meetings", "Meetings for today in Asia/Kolkata"),
  read("list_meetings", "Find currently scheduled meetings within inclusive calendar dates.",
    { from: day, to: day, limit, cursor: uuid }, ["from", "to"]),
  read("list_followups", "Follow-ups currently scheduled for a specified calendar date or paginated register.",
    { on: day, limit, cursor: uuid }),
  read("get_pipeline_metrics", "Count active leads by CRM stage, live production data"),
  read("get_conversion_metrics", "Lead-to-client conversion by lead creation date, never assume paid-ad attribution.",
    { from: day, to: day }, ["from", "to"]),
  read("list_clients", "Authorized client list, contacts redacted by default",
    { q: field("string", "Business search"), status: field("string", "ACTIVE, PAUSED, ARCHIVED"),
      cursor: uuid, limit, includePhone: field("boolean", "Explicitly request permitted client contact data") }),
  read("get_lead_source_report", "Counts per CRM source; source META_LEADS is NOT proof of paid Meta advertising.",
    { from: day, to: day }, ["from", "to"]),
  mutate("create_lead", "Create a lead using the established CRM service and duplicate rules",
    { phone: field("string", "Customer phone, required by CRM"),
      source: field("string", "COLD_CALL, META_LEADS, REFERRAL") }, ["phone"]),
  mutate("update_lead", "Edit allowed contact or business fields with optimistic concurrency",
    { id: uuid, version, businessName: field("string", "Business name"),
      contactName: field("string", "Contact name"), businessType: field("string", "Business type"),
      location: field("string", "Location") }, ["id", "version"]),
  mutate("update_lead_status", "Change stage. APPROVED triggers normal CRM conversion and needs explicit approval.",
    { id: uuid, version, status: field("string", "Existing stage enum"),
      followUpOn: day, meetingOn: day, meetingTime: field("string", "24-hour HH:MM, Asia/Kolkata"),
      confirmClientConversion: field("boolean", "Explicit separate confirmation required for APPROVED") },
    ["id", "version", "status"]),
  mutate("schedule_meeting", "Set status MEETING_PROCESS and a real meeting date and time.",
    { id: uuid, version, meetingOn: day, meetingTime: field("string", "24-hour HH:MM local time") },
    ["id", "version", "meetingOn", "meetingTime"]),
  mutate("schedule_followup", "Set status FOLLOW_UP and a calendar date.",
    { id: uuid, version, followUpOn: day }, ["id", "version", "followUpOn"]),
  mutate("assign_lead", "Assign an existing lead to an active staff member in the same workspace.",
    { id: uuid, version, assignedToId: uuid }, ["id", "version", "assignedToId"]),
  mutate("add_lead_note", "Append an activity note, never replace the activity log.",
    { id: uuid, note: field("string", "Non-secret note, 1-2000 chars") }, ["id", "note"]),
];

const id = z.uuid();
const iso = z.iso.date();
const page = z.strictObject({ cursor: id.optional(), limit: z.number().int().min(1).max(100).default(20) });
const span = z.strictObject({ from: iso, to: iso }).refine(x => x.from <= x.to, "Invalid date range");
const writeBase = z.object({ confirmed: z.literal(true), idempotencyKey: id });
const objectId = z.strictObject({ id, includePhone: z.boolean().optional() });
const dateInput = z.strictObject({ on: iso.optional(), cursor: id.optional(),
  limit: z.number().int().min(1).max(100).default(20) });
const leadInput = leadListQuerySchema.pick({ stage: true, source: true, q: true, cursor: true, limit: true })
  .extend({ includePhone: z.boolean().optional() }).strict();
const clientInput = clientListQuerySchema.pick({ q: true, status: true, cursor: true, limit: true })
  .extend({ includePhone: z.boolean().optional() }).strict();
const meetingInput = span.safeExtend({ cursor: id.optional(),
  limit: z.number().int().min(1).max(100).default(20) });
const createLeadInput = leadCreateSchema.extend(writeBase.shape);
const updateLeadInput = leadUpdateSchema.pick({
  version: true, businessName: true, contactName: true, businessType: true, location: true,
}).extend({ id, ...writeBase.shape });
const changeStatus = z.strictObject({
  id, version: z.number().int().positive(), status: leadStageSchema,
  followUpOn: iso.optional(), meetingOn: iso.optional(),
  meetingTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
  confirmClientConversion: z.boolean().optional(),
}).extend(writeBase.shape);
const scheduleMeeting = z.strictObject({ id, version: z.number().int().positive(),
  meetingOn: iso, meetingTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/) }).and(writeBase);
const scheduleFollowup = z.strictObject({ id, version: z.number().int().positive(), followUpOn: iso }).and(writeBase);
const assignLead = z.strictObject({ id, version: z.number().int().positive(),
  assignedToId: id }).and(writeBase);
const addNote = z.strictObject({ id, note: z.string().trim().min(1).max(2000) }).and(writeBase);
const localDay = () => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const istStart = (date: string) => new Date(Date.parse(date + "T00:00:00.000Z") - 330 * 60_000);
const startEnd = (input: { from: string; to: string }) => ({
  gte: istStart(input.from), lt: new Date(istStart(input.to).getTime() + 86_400_000),
});
const redactLead = (lead: Record<string, unknown>, withPhone: boolean) => ({
  id: lead.id, businessName: lead.businessName, contactName: lead.contactName,
  status: lead.status, source: lead.source, version: lead.version, meetingAt: lead.meetingAt,
  nextFollowUpAt: lead.nextFollowUpAt, assignedToId: lead.assignedToId,
  createdAt: lead.createdAt, ...(withPhone ? { phone: lead.phone } : {}),
});
const redactClient = (client: Record<string, unknown>, withPhone: boolean) => ({
  id: client.id, businessName: client.businessName, status: client.status,
  sourceLeadId: client.sourceLeadId, version: client.version,
  createdAt: client.createdAt, ...(withPhone ? { phone: client.phone, email: client.email } : {}),
});
const requiredScope: Record<string, CrmScope> = {
  get_crm_overview: "crm.analytics.read", list_leads: "crm.leads.read",
  get_lead_details: "crm.leads.read", get_todays_meetings: "crm.meetings.read",
  list_meetings: "crm.meetings.read", list_followups: "crm.followups.read",
  get_pipeline_metrics: "crm.analytics.read", get_conversion_metrics: "crm.analytics.read",
  list_clients: "crm.clients.read", get_lead_source_report: "crm.analytics.read",
  create_lead: "crm.leads.write", update_lead: "crm.leads.write",
  update_lead_status: "crm.leads.write", schedule_meeting: "crm.meetings.write",
  schedule_followup: "crm.followups.write", assign_lead: "crm.leads.write",
  add_lead_note: "crm.leads.write",
};
type GrantIdentity = { principal: Principal; grantId: string; scopes: Set<string> };

export async function callCrmTool(auth: AuthService, grant: GrantIdentity,
  name: string, raw: unknown): Promise<unknown> {
  if (!(name in requiredScope)) throw new AuthError(404, "UNKNOWN_TOOL", "Unknown CRM tool");
  requireScope(grant, requiredScope[name]);
  const db = auth.database, p = grant.principal;
  const leads = new LeadsService(db), clients = new ClientsService(db);
  const args = raw ?? {};
  // Granting a scope never overrides normal CRM role permissions.
  const phonePermitted = grant.scopes.has("crm.contacts.read") && p.permissions.has("leads.read");
  const dateScope = (input: { from: string; to: string }) => ({
    organizationId: p.organizationId, deletedAt: null, createdAt: startEnd(input),
  });
  const convertReport = async (input: { from: string; to: string }) => {
    if (!p.permissions.has("leads.read") || !p.permissions.has("clients.read")) throw forbidden();
    const where = dateScope(input);
    const [eligible, converted, booked] = await Promise.all([
      db.lead.count({ where }),
      db.client.count({ where: { organizationId: p.organizationId,
        sourceLead: { ...where } } }),
      db.lead.count({ where: { ...where, meetingAt: { not: null } } }),
    ]);
    return { from: input.from, to: input.to, eligibleLeads: eligible,
      convertedClients: converted, currentlyScheduledMeetings: booked,
      conversionRatePercent: eligible ? Math.round(converted / eligible * 10000) / 100 : null,
      meetingBookingRatePercent: eligible ? Math.round(booked / eligible * 10000) / 100 : null,
      paidMetaSpend: null, paidAttributionStatus: "UNAVAILABLE",
      caveat: "Meeting counts reflect only currently scheduled meetings. CRM source is not paid-ad attribution." };
  };
  const execute = async () => {
    switch (name) {
      case "get_crm_overview":
        return { ...(await leads.metrics(p)), attributionStatus: "NOT_AVAILABLE_FROM_CRM" };
      case "list_leads": {
        const input = checked(leadInput, args);
        const result = await leads.list(p, { stage: input.stage, source: input.source,
          q: input.q, cursor: input.cursor, limit: input.limit });
        return { ...result, items: result.items.map(item => redactLead(item, phonePermitted && input.includePhone === true)) };
      }
      case "get_lead_details": {
        const input = checked(objectId, args);
        const lead = await leads.detail(p, input.id);
        return redactLead(lead, phonePermitted && input.includePhone === true);
      }
      case "get_todays_meetings": {
        checked(z.strictObject({}), args);
        const day = localDay();
        const result = await leads.meetingsOn(p, day);
        return { ...result, items: result.items.map(x => redactLead(x, false)) };
      }
      case "list_meetings": {
        const input = checked(meetingInput, args);
        if (!p.permissions.has("leads.read")) throw forbidden();
        const where = { organizationId: p.organizationId, deletedAt: null,
          status: "MEETING_PROCESS" as const, meetingAt: startEnd(input) };
        const rows = await db.lead.findMany({ where, take: input.limit + 1,
          ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
          orderBy: [{ meetingAt: "asc" }, { id: "asc" }],
          select: { id: true, businessName: true, contactName: true, status: true, meetingAt: true } });
        const items = rows.slice(0, input.limit);
        return { items, nextCursor: rows.length > input.limit ? items.at(-1)?.id : null };
      }
      case "list_followups": {
        const input = checked(dateInput, args);
        if (input.on) {
          const result = await leads.followUpsOn(p, input.on);
          return { ...result, items: result.items.map(x => redactLead(x, false)) };
        }
        const result = await leads.scheduledFollowUps(p, input);
        return { ...result, items: result.items.map(x => ({
          id: x.id, businessName: x.businessName, contactName: x.contactName,
          nextFollowUpAt: x.nextFollowUpAt,
        })) };
      }
      case "get_pipeline_metrics": {
        checked(z.strictObject({}), args);
        if (!p.permissions.has("leads.read")) throw forbidden();
        const stages = await db.lead.groupBy({ by: ["status"],
          where: { organizationId: p.organizationId, deletedAt: null },
          _count: { _all: true } });
        return { stages: stages.map(x => ({ stage: x.status, leads: x._count._all })) };
      }
      case "get_conversion_metrics":
        return convertReport(checked(span, args));
      case "list_clients": {
        const input = checked(clientInput, args);
        const result = await clients.list(p, { q: input.q, status: input.status,
          cursor: input.cursor, limit: input.limit });
        return { ...result, items: result.items.map(x => redactClient(x, phonePermitted && input.includePhone === true)) };
      }
      case "get_lead_source_report": {
        const input = checked(span, args);
        if (!p.permissions.has("leads.read") || !p.permissions.has("clients.read")) throw forbidden();
        const groups = await db.lead.groupBy({ by: ["source"], where: dateScope(input),
          _count: { _all: true } });
        const converted = await db.client.findMany({ where: {
          organizationId: p.organizationId, sourceLead: dateScope(input),
        }, select: { sourceLead: { select: { source: true } } }, take: 10001 });
        const tallies = new Map<string, number>();
        for (const row of converted.slice(0, 10000)) {
          const source = row.sourceLead?.source ?? "UNKNOWN";
          tallies.set(source, (tallies.get(source) ?? 0) + 1);
        }
        return { from: input.from, to: input.to,
          sources: groups.map(g => ({ source: g.source ?? "UNKNOWN", leads: g._count._all,
            convertedClients: tallies.get(g.source ?? "UNKNOWN") ?? 0 })),
          complete: converted.length <= 10000,
          paidAttributionStatus: "UNAVAILABLE",
          caveat: "META_LEADS is a CRM channel label, not verified paid Meta campaign attribution." };
      }
      case "create_lead": {
        const input = checked(createLeadInput, args);
        return redactLead(await leads.create(p, { phone: input.phone, source: input.source }), false);
      }
      case "update_lead": {
        const input = checked(updateLeadInput, args);
        return redactLead(await leads.update(p, input.id, {
          version: input.version, businessName: input.businessName,
          contactName: input.contactName, businessType: input.businessType, location: input.location,
        }), false);
      }
      case "update_lead_status": {
        const input = checked(changeStatus, args);
        if (input.status === "APPROVED" && input.confirmClientConversion !== true)
          throw new AuthError(422, "CONFIRM_CONVERSION", "Explicit client conversion confirmation required");
        return redactLead(await leads.update(p, input.id, { version: input.version,
          status: input.status, followUpOn: input.followUpOn,
          meetingOn: input.meetingOn, meetingTime: input.meetingTime }), false);
      }
      case "schedule_meeting": {
        const input = checked(scheduleMeeting, args);
        return redactLead(await leads.update(p, input.id, { version: input.version,
          status: "MEETING_PROCESS", meetingOn: input.meetingOn,
          meetingTime: input.meetingTime }), false);
      }
      case "schedule_followup": {
        const input = checked(scheduleFollowup, args);
        return redactLead(await leads.update(p, input.id, { version: input.version,
          status: "FOLLOW_UP", followUpOn: input.followUpOn }), false);
      }
      case "assign_lead": {
        const input = checked(assignLead, args);
        return redactLead(await leads.assign(p, input.id, input.version, input.assignedToId), false);
      }
      case "add_lead_note": {
        const input = checked(addNote, args);
        const result = await leads.note(p, input.id, input.note);
        return { noteId: result.id, leadId: input.id, createdAt: result.createdAt };
      }
      default: throw new AuthError(404, "UNKNOWN_TOOL", "Unknown CRM tool");
    }
  };
  const definition = CHATGPT_TOOLS.find(t => t.name === name);
  if (!definition || definition.annotations.readOnlyHint) return execute();
  // The confirmation flag is checked inside the Zod contract before any service mutation.
  // Reserve the key before executing: a crash leaves it pending instead of silently duplicating a write.
  const payload = checked(z.object({ confirmed: z.literal(true), idempotencyKey: id }).passthrough(), args);
  const payloadHash = createHash("sha256").update(JSON.stringify({ name, args })).digest("hex");
  try {
    await db.chatGptWrite.create({ data: {
      grantId: grant.grantId, key: payload.idempotencyKey, toolName: name,
      payloadHash, state: "PENDING",
    } });
  } catch {
    const previous = await db.chatGptWrite.findUnique({
      where: { grantId_key: { grantId: grant.grantId, key: payload.idempotencyKey } },
    });
    if (!previous || previous.payloadHash !== payloadHash || previous.toolName !== name)
      throw new AuthError(409, "IDEMPOTENCY_CONFLICT", "Mutation key used for another request");
    if (previous.state !== "DONE")
      throw new AuthError(409, "MUTATION_UNCERTAIN", "Earlier mutation is pending; inspect CRM before retrying");
    return previous.result;
  }
  try {
    const result = await execute();
    await db.chatGptWrite.update({ where: { grantId_key: {
      grantId: grant.grantId, key: payload.idempotencyKey } },
      data: { state: "DONE", result: result as object } });
    await db.auditLog.create({ data: { organizationId: p.organizationId, actorId: p.userId,
      action: "chatgpt." + name, entityType: "ChatGptGrant",
      entityId: grant.grantId, afterRedacted: { tool: name } } });
    return result;
  } catch (error) {
    await db.chatGptWrite.updateMany({ where: {
      grantId: grant.grantId, key: payload.idempotencyKey, state: "PENDING",
    }, data: { state: "UNCERTAIN" } });
    throw error;
  }
}

export function registerChatGptMcpRoutes(app: Express, auth: AuthService) {
  const origin = configuredOrigins();
  if (!origin) return;
  const path = "/api/v1/integrations/chatgpt/mcp";
  const limit = rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: "draft-8",
    legacyHeaders: false });
  const challenge = "Bearer resource_metadata=" + JSON.stringify(origin.api +
    "/.well-known/oauth-protected-resource");
  app.get(path, (_req, res) => res.set("Allow", "POST").status(405).end());
  app.delete(path, (_req, res) => res.status(405).end());
  app.post(path, limit, async (req, res) => {
    res.set("Cache-Control", "no-store");
    const bearer = req.get("authorization");
    if (!bearer?.startsWith("Bearer ")) return res.set("WWW-Authenticate", challenge)
      .status(401).json({ error: "unauthorized" });
    let grant: GrantIdentity;
    try { grant = await authenticateChatGpt(auth, bearer.slice(7)); }
    catch { return res.set("WWW-Authenticate", challenge).status(401).json({ error: "unauthorized" }); }
    const request = req.body as { jsonrpc?: unknown; method?: unknown; id?: unknown;
      params?: { name?: unknown; arguments?: unknown } } | null;
    if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string")
      return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } });
    const rpcId = typeof request.id === "number" || typeof request.id === "string" ? request.id : null;
    if (request.method === "notifications/initialized" || request.method.startsWith("notifications/"))
      return res.status(202).end();
    const success = (result: unknown) => res.json({ jsonrpc: "2.0", id: rpcId, result });
    if (request.method === "initialize") return success({ protocolVersion: "2025-06-18",
      serverInfo: { name: "amplifyworld-crm", version: "0.1.0" },
      capabilities: { tools: { listChanged: false } } });
    if (request.method === "ping") return success({});
    if (request.method === "tools/list") {
      const allowed = CHATGPT_TOOLS.filter(tool => grant.scopes.has(requiredScope[tool.name]));
      return success({ tools: allowed });
    }
    if (request.method !== "tools/call" || typeof request.params?.name !== "string")
      return res.json({ jsonrpc: "2.0", id: rpcId,
        error: { code: -32601, message: "Method not found" } });
    const name = request.params.name;
    try {
      const data = await callCrmTool(auth, grant, name, request.params.arguments);
      return success({ content: [{ type: "text", text: JSON.stringify(data) }] });
    } catch (error) {
      const known = error instanceof AuthError ? error : null;
      const code = known?.code ?? (error instanceof z.ZodError ? "VALIDATION_ERROR" : "TOOL_FAILED");
      // CRM and provider errors can contain contact values; never serialize raw error messages.
      console.warn(JSON.stringify({ event: "chatgpt.tool_error", tool: name, code,
        orgId: grant.principal.organizationId }));
      return success({ isError: true, content: [{ type: "text", text: JSON.stringify({ error: code }) }] });
    }
  });
}
