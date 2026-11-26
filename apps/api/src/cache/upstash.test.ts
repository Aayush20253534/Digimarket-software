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
    const transport = vi.fn<typeof fetch>().mockImplementation(async (_url,init) => {
      const args=JSON.parse(String(init?.body)) as string[];
      return Response.json({result:args[1].startsWith("aw:delivery:version:")?null:'{"items":[1]}'});
    });
    const cache = new UpstashReadCache("https://example.upstash.io", "token", transport);
    const load = vi.fn(async () => ({ items: [2] }));
    expect(await cache.read(actor, "report", 10, load)).toEqual({ items: [1] });
    await cache.read({ ...actor, permissions: new Set(["clients.read", "finance.read.all"]) }, "report", 10, load);
    expect(load).not.toHaveBeenCalled();
    expect(transport.mock.calls[1][1]?.body).not.toEqual(transport.mock.calls[3][1]?.body);
    expect(cache.snapshot().hit).toBe(2);
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

describe("organization invalidation",()=>{
 it("cannot serve an old snapshot after successful version rotation",async()=>{
  const values=new Map<string,string>();
  const transport=vi.fn<typeof fetch>().mockImplementation(async(_url,init)=>{
   const args=JSON.parse(String(init?.body)) as string[];
   if(args[0]==="SET"){values.set(args[1],args[2]);return Response.json({result:"OK"});}
   return Response.json({result:values.get(args[1])??null});
  });
  const cache=new UpstashReadCache("https://example.upstash.io","token",transport);
  let value=1;const load=vi.fn(async()=>value);
  expect(await cache.read(actor,"report",10,load)).toBe(1);value=2;
  expect(await cache.read(actor,"report",10,load)).toBe(1);
  await cache.invalidateOrganization(actor.organizationId);
  expect(await cache.read(actor,"report",10,load)).toBe(2);
  expect(load).toHaveBeenCalledTimes(2);
  expect(cache.snapshot()).toMatchObject({hit:1,miss:2,invalidation:1});
 });
});
