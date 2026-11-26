import { describe, expect, it, vi } from "vitest";
import type { Principal } from "../auth/service";
import { UpstashReadCache } from "./upstash";
const actor: Principal = { organizationId: "org", userId: "user", sessionId: "session", roles: ["FOUNDER"], permissions: new Set(["clients.read"]) };
describe("Upstash read cache", () => {
  it("uses the database without credentials", async () => {
    const transport = vi.fn<typeof fetch>();
    const load = vi.fn(async () => ({ items: [1] }));
    expect(await new UpstashReadCache("", "", transport).read(actor, "report", 10, load)).toEqual({ items: [1] });
    expect(transport).not.toHaveBeenCalled();
  });
  it("reads cached JSON and separates permission scopes", async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ result: '{"items":[1]}' }));
    const cache = new UpstashReadCache("https://example.upstash.io", "token", transport);
    const load = vi.fn(async () => ({ items: [2] }));
    expect(await cache.read(actor, "report", 10, load)).toEqual({ items: [1] });
    await cache.read({ ...actor, permissions: new Set(["clients.read", "finance.read.all"]) }, "report", 10, load);
    expect(load).not.toHaveBeenCalled();
    expect(transport.mock.calls[0][1]?.body).not.toEqual(transport.mock.calls[1][1]?.body);
  });
  it("falls back and backs off on cache errors", async () => {
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    const cache = new UpstashReadCache("https://example.upstash.io", "token", transport);
    const load = vi.fn(async () => 42);
    expect(await cache.read(actor, "report", 10, load)).toBe(42);
    expect(await cache.read(actor, "report", 10, load)).toBe(42);
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
