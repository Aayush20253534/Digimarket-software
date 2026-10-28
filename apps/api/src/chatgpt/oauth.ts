import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { AuthService, Principal } from "../auth/service";
import { AuthError, forbidden, unauthorized } from "../auth/errors";

export const CRM_SCOPES = [
  "crm.leads.read", "crm.leads.write", "crm.meetings.read", "crm.meetings.write",
  "crm.followups.read", "crm.followups.write", "crm.clients.read",
  "crm.analytics.read", "crm.contacts.read",
] as const;
export type CrmScope = typeof CRM_SCOPES[number];
export const hashSecret = (value: string) => createHash("sha256").update(value).digest("hex");
const randomSecret = () => randomBytes(32).toString("base64url");
const accessLife = 15 * 60_000;
const refreshLife = 30 * 86_400_000;
const authCodeLife = 5 * 60_000;
const uuid = z.uuid();

export function configuredOrigins() {
  const api = process.env.CHATGPT_API_ORIGIN;
  const web = process.env.CHATGPT_WEB_ORIGIN;
  if (!api || !web) return null;
  try {
    const a = new URL(api), w = new URL(web);
    if (a.protocol !== "https:" || w.protocol !== "https:" || a.pathname !== "/" || w.pathname !== "/") return null;
    return { api: a.origin, web: w.origin };
  } catch { return null; }
}
export function trustedChatGptRedirect(uri: string) {
  try {
    const url = new URL(uri);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash &&
      ["chatgpt.com", "chat.openai.com", "auth.openai.com"].includes(url.hostname) &&
      url.port === "" && uri.length <= 1000;
  } catch { return false; }
}
export const safeScope = (scope: string) => scope.split(" ").filter((s): s is CrmScope =>
  (CRM_SCOPES as readonly string[]).includes(s));
const approveInput = z.strictObject({
  client_id: z.string().min(1).max(120), redirect_uri: z.url().max(1000),
  response_type: z.literal("code"), code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  code_challenge_method: z.literal("S256"),
  scope: z.string().max(500).default("crm.leads.read"),
  state: z.string().max(1024).optional(),
});
const registration = z.strictObject({
  redirect_uris: z.array(z.url().max(1000)).min(1).max(5),
  client_name: z.string().max(120).optional(),
  token_endpoint_auth_method: z.literal("none").optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
});
const tokenRequest = z.object({
  grant_type: z.enum(["authorization_code", "refresh_token"]),
  client_id: z.string().min(1).max(120),
  code: z.string().optional(), code_verifier: z.string().optional(),
  redirect_uri: z.string().optional(), refresh_token: z.string().optional(),
}).passthrough();
export function checked<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new AuthError(422, "VALIDATION_ERROR", "Invalid integration request");
  return result.data;
}
function oauthFailure(response: Response, code: string, status = 400) {
  return response.status(status).set("Cache-Control", "no-store").json({ error: code });
}
function requireFounder(p: Principal) {
  if (!p.roles.includes("FOUNDER")) throw forbidden();
}
function allowedScopes(p: Principal): CrmScope[] {
  const perms = p.permissions;
  const canEdit = perms.has("leads.edit") || perms.has("leads.edit.own");
  return CRM_SCOPES.filter(s => {
    if (s === "crm.clients.read") return perms.has("clients.read");
    if (s === "crm.analytics.read") return perms.has("leads.read");
    if (s === "crm.contacts.read") return perms.has("leads.read");
    if (s.endsWith(".write")) return canEdit;
    return perms.has("leads.read");
  });
}
type AppAuth = { principal: Principal; grantId: string; scopes: Set<string> };
async function liveFounder(auth: AuthService, userId: string, organizationId: string): Promise<Principal> {
  const user = await auth.database.user.findFirst({
    where: { id: userId, organizationId, status: "ACTIVE", mustChangePassword: false },
    include: { roles: { include: { role: { include: { permissions: true } } } } },
  });
  if (!user) throw unauthorized();
  const roles = user.roles.map(r => r.role).filter(r => r.organizationId === organizationId);
  if (!roles.some(r => r.key === "FOUNDER")) throw forbidden();
  return { userId, organizationId, sessionId: "chatgpt", roles: roles.map(r => r.key),
    permissions: new Set(roles.flatMap(r => r.permissions.map(x => x.permissionKey))) };
}
export async function authenticateChatGpt(auth: AuthService, bearer: string): Promise<AppAuth> {
  if (!/^[A-Za-z0-9_-]{35,150}$/.test(bearer)) throw unauthorized();
  const now = new Date();
  const grant = await auth.database.chatGptGrant.findUnique({
    where: { accessTokenHash: hashSecret(bearer) },
  });
  if (!grant || grant.revokedAt || grant.accessExpiresAt <= now || grant.refreshExpiresAt <= now) throw unauthorized();
  const p = await liveFounder(auth, grant.userId, grant.organizationId);
  const approved = new Set(allowedScopes(p));
  const scopes = new Set(grant.scopes.filter(s => approved.has(s as CrmScope)));
  await auth.database.chatGptGrant.updateMany({
    where: { id: grant.id, revokedAt: null }, data: { lastUsedAt: now },
  });
  return { principal: p, grantId: grant.id, scopes };
}
export function requireScope(grant: AppAuth, scope: CrmScope) {
  if (!grant.scopes.has(scope)) throw forbidden();
}
function oauthTokens(access: string, refresh: string, scopes: string[]) {
  return { access_token: access, token_type: "Bearer", expires_in: accessLife / 1000,
    refresh_token: refresh, scope: scopes.join(" ") };
}

export function registerChatGptOAuthRoutes(app: Express, auth: AuthService) {
  const origin = configuredOrigins();
  const base = "/api/v1/integrations/chatgpt";
  // Disabled by default. Never make a publicly usable OAuth endpoint without exact HTTPS origins.
  if (!origin) return;
  const limit = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: "draft-8",
    legacyHeaders: false, message: { error: "rate_limited" } });
  const authUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const header = req.get("authorization");
      if (!header || !header.startsWith("Bearer ")) throw unauthorized();
      const p = await auth.authenticate(header.slice(7));
      // Preserve a mandatory enrolled MFA check even if the existing login flow changes.
      const [user, session] = await Promise.all([
        auth.database.user.findUnique({ where: { id: p.userId }, select: { mfaSecretEncrypted: true } }),
        auth.database.session.findUnique({ where: { id: p.sessionId }, select: { mfaVerifiedAt: true } }),
      ]);
      if (user?.mfaSecretEncrypted && !session?.mfaVerifiedAt) throw forbidden();
      res.locals.crmFounder = p;
      next();
    } catch (e) { next(e); }
  };
  const managed = (res: Response) => res.locals.crmFounder as Principal;
  const discover = {
    issuer: origin.api,
    authorization_endpoint: origin.api + base + "/oauth/authorize",
    token_endpoint: origin.api + base + "/oauth/token",
    registration_endpoint: origin.api + base + "/oauth/register",
    scopes_supported: [...CRM_SCOPES], response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"],
  };
  app.get("/.well-known/oauth-authorization-server", (_req, res) =>
    res.set("Cache-Control", "no-store").json(discover));
  app.get(["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/api/v1/integrations/chatgpt/mcp"],
    (_req, res) => res.set("Cache-Control", "no-store").json({
      resource: origin.api + base + "/mcp", authorization_servers: [origin.api],
      scopes_supported: [...CRM_SCOPES], bearer_methods_supported: ["header"],
    }));
  app.use(base, limit);
  app.post(base + "/oauth/register", async (req, res) => {
    const input = checked(registration, req.body);
    if (input.redirect_uris.some(uri => !trustedChatGptRedirect(uri))) return oauthFailure(res, "invalid_redirect_uri");
    if (input.token_endpoint_auth_method && input.token_endpoint_auth_method !== "none")
      return oauthFailure(res, "invalid_client_metadata");
    const clientId = randomUUID();
    await auth.database.chatGptOAuthClient.create({ data: { id: clientId, redirectUris: input.redirect_uris } });
    return res.status(201).set("Cache-Control", "no-store").json({
      client_id: clientId, redirect_uris: input.redirect_uris, token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
    });
  });
  const validClient = async (clientId: string, redirect: string) => {
    const client = await auth.database.chatGptOAuthClient.findUnique({ where: { id: clientId } });
    return Boolean(client && trustedChatGptRedirect(redirect) && client.redirectUris.includes(redirect));
  };
  app.get(base + "/oauth/authorize", async (req, res) => {
    const data = checked(approveInput, req.query);
    if (!await validClient(data.client_id, data.redirect_uri)) return oauthFailure(res, "invalid_client");
    const search = new URLSearchParams(Object.entries(data).filter((entry): entry is [string, string] => typeof entry[1] === "string")).toString();
    res.set("Cache-Control", "no-store").redirect(302,
      origin.web + "/app/integrations/chatgpt/authorize?" + search);
  });
  app.post(base + "/oauth/approve", authUser, async (req, res) => {
    const p = managed(res);
    requireFounder(p);
    const input = checked(approveInput, req.body);
    if (!await validClient(input.client_id, input.redirect_uri)) throw forbidden();
    const requested = safeScope(input.scope);
    if (!requested.length || requested.join(" ") !== input.scope.trim()) throw forbidden();
    const allowed = new Set(allowedScopes(p));
    if (requested.some(s => !allowed.has(s))) throw forbidden();
    const code = randomSecret();
    await auth.database.chatGptOAuthCode.create({ data: {
      codeHash: hashSecret(code), clientId: input.client_id, redirectUri: input.redirect_uri,
      organizationId: p.organizationId, userId: p.userId, scopes: requested,
      codeChallenge: input.code_challenge, expiresAt: new Date(Date.now() + authCodeLife),
    } });
    const redirect = new URL(input.redirect_uri);
    redirect.searchParams.set("code", code);
    if (input.state !== undefined) redirect.searchParams.set("state", input.state);
    await auth.database.auditLog.create({ data: { organizationId: p.organizationId,
      actorId: p.userId, action: "chatgpt.authorized", entityType: "ChatGptOAuthCode",
      entityId: hashSecret(code), afterRedacted: { scopes: requested } } });
    res.set("Cache-Control", "no-store").json({ data: { redirectUrl: redirect.toString() } });
  });
  app.post(base + "/oauth/token", express.urlencoded({ extended: false, limit: "8kb" }), async (req, res) => {
    const input = checked(tokenRequest, req.body);
    if (input.grant_type === "authorization_code") {
      if (!input.code || !input.code_verifier || !input.redirect_uri ||
        !/^[A-Za-z0-9._~-]{43,128}$/.test(input.code_verifier)) return oauthFailure(res, "invalid_grant");
      const codeHash = hashSecret(input.code);
      const code = await auth.database.chatGptOAuthCode.findUnique({ where: { codeHash } });
      if (!code || code.clientId !== input.client_id || code.redirectUri !== input.redirect_uri ||
        code.usedAt || code.expiresAt <= new Date()) return oauthFailure(res, "invalid_grant");
      const calculated = createHash("sha256").update(input.code_verifier).digest("base64url");
      const aa = Buffer.from(calculated), bb = Buffer.from(code.codeChallenge);
      if (aa.length !== bb.length || !timingSafeEqual(aa, bb)) return oauthFailure(res, "invalid_grant");
      if (!await validClient(input.client_id, input.redirect_uri)) return oauthFailure(res, "invalid_grant");
      try { await liveFounder(auth, code.userId, code.organizationId); }
      catch { return oauthFailure(res, "invalid_grant"); }
      const used = await auth.database.chatGptOAuthCode.updateMany({
        where: { codeHash, usedAt: null }, data: { usedAt: new Date() },
      });
      if (used.count !== 1) return oauthFailure(res, "invalid_grant");
      const access = randomSecret(), refresh = randomSecret(), now = Date.now();
      await auth.database.chatGptGrant.create({ data: {
        clientId: code.clientId, userId: code.userId, organizationId: code.organizationId,
        scopes: code.scopes, accessTokenHash: hashSecret(access), refreshTokenHash: hashSecret(refresh),
        accessExpiresAt: new Date(now + accessLife), refreshExpiresAt: new Date(now + refreshLife),
      } });
      return res.set("Cache-Control", "no-store").json(oauthTokens(access, refresh, code.scopes));
    }
    if (!input.refresh_token) return oauthFailure(res, "invalid_grant");
    const oldHash = hashSecret(input.refresh_token);
    const grant = await auth.database.chatGptGrant.findUnique({ where: { refreshTokenHash: oldHash } });
    if (!grant || grant.clientId !== input.client_id || grant.revokedAt ||
      grant.refreshExpiresAt <= new Date()) return oauthFailure(res, "invalid_grant");
    try { await liveFounder(auth, grant.userId, grant.organizationId); }
    catch { return oauthFailure(res, "invalid_grant"); }
    const access = randomSecret(), refresh = randomSecret();
    const updated = await auth.database.chatGptGrant.updateMany({
      where: { id: grant.id, refreshTokenHash: oldHash, revokedAt: null },
      data: { accessTokenHash: hashSecret(access), refreshTokenHash: hashSecret(refresh),
        accessExpiresAt: new Date(Date.now() + accessLife) },
    });
    if (!updated.count) return oauthFailure(res, "invalid_grant");
    return res.set("Cache-Control", "no-store").json(oauthTokens(access, refresh, grant.scopes));
  });
  app.get(base + "/connections", authUser, async (_req, res) => {
    const p = managed(res);
    if (!p.roles.some(r => ["FOUNDER", "ADMIN", "SUPER_ADMIN"].includes(r))) throw forbidden();
    const admin = p.roles.some(r => ["ADMIN", "SUPER_ADMIN"].includes(r));
    const records = await auth.database.chatGptGrant.findMany({
      where: { organizationId: p.organizationId, ...(admin ? {} : { userId: p.userId }) },
      select: { id: true, userId: true, scopes: true, createdAt: true, lastUsedAt: true,
        accessExpiresAt: true, refreshExpiresAt: true, revokedAt: true },
      orderBy: { createdAt: "desc" }, take: 100,
    });
    res.set("Cache-Control", "no-store").json({ data: { enabled: true, connections: records } });
  });
  app.post(base + "/connections/:id/revoke", authUser, async (req, res) => {
    const p = managed(res), id = checked(uuid, req.params.id);
    if (!p.roles.some(r => ["FOUNDER", "ADMIN", "SUPER_ADMIN"].includes(r))) throw forbidden();
    const admin = p.roles.some(r => ["ADMIN", "SUPER_ADMIN"].includes(r));
    const updated = await auth.database.chatGptGrant.updateMany({
      where: { id, organizationId: p.organizationId, ...(admin ? {} : { userId: p.userId }) },
      data: { revokedAt: new Date(), accessTokenHash: null, refreshTokenHash: null },
    });
    if (!updated.count) throw new AuthError(404, "NOT_FOUND", "Connection not found");
    await auth.database.auditLog.create({ data: { organizationId: p.organizationId,
      actorId: p.userId, action: "chatgpt.revoked", entityType: "ChatGptGrant", entityId: id } });
    res.set("Cache-Control", "no-store").json({ data: { revoked: true } });
  });
}
