import request from "supertest";
import { describe, expect, it } from "vitest";
import { apiHealthSchema } from "@digimarket/contracts";
import { createApp } from "./app";

describe("Express API foundation", () => {
  const app = createApp();

  it("serves the versioned API health contract", async () => {
    const response = await request(app).get("/api/v1/health");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(apiHealthSchema.safeParse(response.body).success).toBe(true);
  });

  it("does not advertise an Express signature", async () => {
    const response = await request(app).get("/api/v1/health");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("returns a structured 404 without revealing internals", async () => {
    const response = await request(app).get("/api/v1/nonexistent");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(typeof response.body.meta.requestId).toBe("string");
  });

  it("restricts CORS response origins to the configured site", async () => {
    const allowed = await request(app).get("/api/v1/health").set("Origin", "http://localhost:3000");
    const blocked = await request(app).get("/api/v1/health").set("Origin", "https://other.invalid");
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
