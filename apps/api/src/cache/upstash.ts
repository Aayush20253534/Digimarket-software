import { createHash, randomUUID } from "node:crypto";
import type { Principal } from "../auth/service";

/** Disposable read-through cache. PostgreSQL and live authorization remain authoritative. */
export class UpstashReadCache {
  private readonly pending = new Map<string, Promise<unknown>>();
  private unavailableUntil = 0;
  private readonly counters={hit:0,miss:0,bypass:0,error:0,invalidation:0,coalesced:0};
  snapshot(){return {...this.counters,configured:!!this.url&&!!this.token,available:this.enabled()};}
  private versionKey(org:string){return "aw:delivery:version:"+createHash("sha256").update(org).digest("hex");}
  /** Changes namespace after a committed delivery/contract write; old keys expire naturally. */
  async invalidateOrganization(org:string){
    if(!this.enabled())return;
    try{await this.command(["SET",this.versionKey(org),randomUUID(),"EX",3600]);this.counters.invalidation++;}
    catch{/* An unavailable cache is bypassed for longer than report TTL. */}
  }
  constructor(private readonly url = process.env.UPSTASH_REDIS_REST_URL,
    private readonly token = process.env.UPSTASH_REDIS_REST_TOKEN,
    private readonly transport: typeof fetch = fetch) {}

  private enabled() {
    return !!this.token && !!this.url && /^https:\/\/[^/]+\.upstash\.io\/?$/.test(this.url) && Date.now() >= this.unavailableUntil;
  }

  private async command(args: (string | number)[]): Promise<unknown> {
    if (!this.enabled()) throw new Error("cache unavailable");
    try {
      const response = await this.transport(this.url!, {
        method: "POST", headers: { authorization: "Bearer " + this.token, "content-type": "application/json" },
        body: JSON.stringify(args), signal: AbortSignal.timeout(180), redirect: "error",
      });
      if (!response.ok) throw new Error("cache unavailable");
      const body = await response.json() as { result?: unknown; error?: unknown };
      if (body.error || !("result" in body)) throw new Error("cache unavailable");
      return body.result;
    } catch {
      // Prevent an unavailable cache from adding a network timeout to every request.
      this.unavailableUntil = Date.now() + 30_000;
      this.counters.error++;
      throw new Error("cache unavailable");
    }
  }

  async read<T>(actor: Principal, resource: string, ttl: number, load: () => Promise<T>): Promise<T> {
    if (!this.enabled()){this.counters.bypass++;return load();}
    let version:unknown;
    try{version=await this.command(["GET",this.versionKey(actor.organizationId)]);}
    catch{this.counters.bypass++;return load();}
    if(version!==null&&typeof version!=="string"){this.counters.bypass++;return load();}
    const digest = createHash("sha256").update(JSON.stringify([
      actor.organizationId, actor.userId, [...actor.roles].sort(), [...actor.permissions].sort(), resource, version,
    ])).digest("hex");
    const key = "aw:read:v1:" + digest;
    const existing = this.pending.get(key);
    if (existing){this.counters.coalesced++;return existing as Promise<T>;}
    const work = (async () => {
      try {
        const cached = await this.command(["GET", key]);
        if (typeof cached === "string"){const value=JSON.parse(cached) as T;this.counters.hit++;return value;}
      } catch { /* fail open for disposable data only, never authorization */ }
      this.counters.miss++;
      const result = await load();
      // Bounded snapshots only; avoid caching unexpectedly large payloads.
      try {
        const serialized = JSON.stringify(result);
        if (serialized.length <= 128_000) await this.command(["SET", key, serialized, "EX", ttl]);
      } catch { /* database result remains usable */ }
      return result;
    })();
    this.pending.set(key, work);
    try { return await work; }
    finally { if (this.pending.get(key) === work) this.pending.delete(key); }
  }
}

// The API process shares a single cache across read and write route registrations.
let instance:UpstashReadCache|undefined;
export function workspaceReadCache(){return instance??=new UpstashReadCache();}
