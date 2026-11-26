import { createHash } from "node:crypto";
import type { Principal } from "../auth/service";

/** Disposable read-through cache. PostgreSQL and live authorization remain authoritative. */
export class UpstashReadCache {
  private readonly pending = new Map<string, Promise<unknown>>();
  private unavailableUntil = 0;
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
      throw new Error("cache unavailable");
    }
  }

  async read<T>(actor: Principal, resource: string, ttl: number, load: () => Promise<T>): Promise<T> {
    if (!this.enabled()) return load();
    const digest = createHash("sha256").update(JSON.stringify([
      actor.organizationId, actor.userId, [...actor.roles].sort(), [...actor.permissions].sort(), resource,
    ])).digest("hex");
    const key = "aw:read:v1:" + digest;
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;
    const work = (async () => {
      try {
        const cached = await this.command(["GET", key]);
        if (typeof cached === "string") return JSON.parse(cached) as T;
      } catch { /* fail open for disposable data only, never authorization */ }
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
