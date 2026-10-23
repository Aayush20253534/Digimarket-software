import { describe, expect, it } from "vitest";
import { apiHealthSchema, apiErrorSchema, leadCreateSchema, leadUpdateSchema, leadListQuerySchema, leadStageSchema } from "./index";

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

describe("lead acquisition sources",()=>{
 it("allows manual lead capture as Cold Call or Meta Leads",()=>{
  expect(leadCreateSchema.parse({phone:"+919876543210",source:"COLD_CALL"}).source).toBe("COLD_CALL");
  expect(leadCreateSchema.parse({phone:"+919876543211",source:"META_LEADS"}).source).toBe("META_LEADS");
  expect(leadCreateSchema.parse({phone:"+919876543212"}).source).toBeUndefined();
 });
 it("rejects unknown sources rather than silently creating inconsistent labels",()=>{
  expect(leadCreateSchema.safeParse({phone:"+919876543210",source:"WHATSAPP"}).success).toBe(false);
  expect(leadUpdateSchema.safeParse({version:1,source:"REFERRAL"}).success).toBe(false);
  expect(leadListQuerySchema.safeParse({source:"UNKNOWN"}).success).toBe(false);
 });
 it("accepts source edits and source-filtered queries",()=>{
  expect(leadUpdateSchema.parse({version:1,source:"META_LEADS"}).source).toBe("META_LEADS");
  expect(leadListQuerySchema.parse({source:"COLD_CALL"}).source).toBe("COLD_CALL");
 });
});

describe("lead decision pending stage",()=>{
 it("accepts decision pending in status edits and filters",()=>{
  expect(leadStageSchema.parse("DECISION_PENDING")).toBe("DECISION_PENDING");
  expect(leadUpdateSchema.parse({version:2,status:"DECISION_PENDING",stageNote:"Awaiting confirmation"}).status).toBe("DECISION_PENDING");
  expect(leadListQuerySchema.parse({stage:"DECISION_PENDING"}).stage).toBe("DECISION_PENDING");
 });
});
