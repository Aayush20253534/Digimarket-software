import { describe, expect, it } from "vitest";
import { apiHealthSchema, apiErrorSchema } from "./index";

describe("shared API contracts", () => {
  it("accepts a conforming API health response", () => {
    const parsed = apiHealthSchema.safeParse({
      data: { service: "api", status: "ok", timestamp: new Date().toISOString() },
      meta: { version: "v1" },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid health claims", () => {
    expect(apiHealthSchema.safeParse({
      data: { service: "api", status: "ready", timestamp: "not-a-date" },
      meta: { version: "v1" },
    }).success).toBe(false);
  });

  it("parses standardized errors", () => {
    expect(apiErrorSchema.parse({ error: { code: "NOT_FOUND", message: "Not found" } }).error.code)
      .toBe("NOT_FOUND");
  });
});
