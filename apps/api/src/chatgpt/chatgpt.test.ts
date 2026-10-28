import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import type { AuthService, Principal } from "../auth/service";
import { CHATGPT_TOOLS, callCrmTool } from "./mcp";
import { CRM_SCOPES, hashSecret, safeScope, trustedChatGptRedirect,
  authenticateChatGpt } from "./oauth";

afterEach(() => { vi.unstubAllEnvs(); });

describe("private ChatGPT integration security", () => {
  it("uses tightly restricted OAuth redirects", () => {
    expect(trustedChatGptRedirect("https://chatgpt.com/connector_platform_oauth_redirect")).toBe(true);
    for (const uri of ["http://chatgpt.com/oauth", "https://chatgpt.com.evil.test/oauth",
      "https://evil.test/oauth", "https://user@chatgpt.com/oauth",
      "https://chatgpt.com/oauth#fragment"]) {
      expect(trustedChatGptRedirect(uri)).toBe(false);
    }
    expect(safeScope("crm.leads.read malicious crm.clients.read")).toEqual([
      "crm.leads.read", "crm.clients.read",
    ]);
  });

  it("exposes unique, bounded tool schemas and marks writes for approval", () => {
    expect(CHATGPT_TOOLS.length).toBe(17);
    expect(new Set(CHATGPT_TOOLS.map(t => t.name)).size).toBe(CHATGPT_TOOLS.length);
    for (const t of CHATGPT_TOOLS) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.inputSchema.additionalProperties).toBe(false);
      if (!t.annotations.readOnlyHint) {
        expect(t.annotations.destructiveHint).toBe(true);
        expect(t.inputSchema.required).toEqual(expect.arrayContaining(["confirmed", "idempotencyKey"]));
      }
    }
    expect(CRM_SCOPES).toContain("crm.analytics.read");
    expect(hashSecret("abc")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not start integration endpoints without explicitly configured HTTPS hosts", async () => {
    vi.stubEnv("CHATGPT_API_ORIGIN", "");
    vi.stubEnv("CHATGPT_WEB_ORIGIN", "");
    const app = createApp();
    const result = await request(app).post("/api/v1/integrations/chatgpt/mcp").send({});
    expect(result.status).toBe(404);
  });

  it("advertises OAuth discovery and rejects unauthenticated MCP requests", async () => {
    vi.stubEnv("CHATGPT_API_ORIGIN", "https://crm.example.org");
    vi.stubEnv("CHATGPT_WEB_ORIGIN", "https://app.example.org");
    const empty = {} as AuthService;
    const app = createApp(["https://app.example.org"], empty);
    const discovery = await request(app).get("/.well-known/oauth-authorization-server");
    expect(discovery.status).toBe(200);
    expect(discovery.body.code_challenge_methods_supported).toContain("S256");
    const resource = await request(app).get("/.well-known/oauth-protected-resource");
    expect(resource.body.resource).toBe("https://crm.example.org/api/v1/integrations/chatgpt/mcp");
    const call = await request(app).post("/api/v1/integrations/chatgpt/mcp")
      .send({ jsonrpc: "2.0", method: "tools/list", id: 1 });
    expect(call.status).toBe(401);
    expect(call.headers["www-authenticate"]).toMatch(/resource_metadata/);
  });

  it("rejects insufficient scope before database access or mutation", async () => {
    const principal: Principal = { userId: "u", organizationId: "org",
      sessionId: "chatgpt", roles: ["FOUNDER"], permissions: new Set(["leads.read"]) };
    const auth = { database: {} } as AuthService;
    await expect(callCrmTool(auth, { principal, grantId: "g", scopes: new Set() },
      "get_crm_overview", {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callCrmTool(auth, { principal, grantId: "g",
      scopes: new Set(["crm.leads.read"]) }, "create_lead",
      { phone: "1234567890", confirmed: true, idempotencyKey: randomUUID() }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects revoked and expired tokens even if a hash matches", async () => {
    const token = "x".repeat(48);
    for (const values of [{ revokedAt: new Date(), accessExpiresAt: new Date(Date.now() + 60_000) },
      { revokedAt: null, accessExpiresAt: new Date(Date.now() - 1000) }]) {
      const auth = { database: { chatGptGrant: { findUnique: vi.fn().mockResolvedValue({
        ...values, refreshExpiresAt: new Date(Date.now() + 60_000),
      }) } } } as unknown as AuthService;
      await expect(authenticateChatGpt(auth, token)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
  });

  it("rejects cross-organization founder role records", async () => {
    const auth = { database: {
      chatGptGrant: { findUnique: vi.fn().mockResolvedValue({
        id: "grant", organizationId: "org-a", userId: "founder",
        scopes: ["crm.leads.read"], revokedAt: null,
        accessExpiresAt: new Date(Date.now() + 60_000),
        refreshExpiresAt: new Date(Date.now() + 60_000),
      }) },
      user: { findFirst: vi.fn().mockResolvedValue({
        id: "founder", roles: [{ role: { organizationId: "org-b", key: "FOUNDER", permissions: [] } }],
      }) },
    } } as unknown as AuthService;
    await expect(authenticateChatGpt(auth, "x".repeat(48))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
