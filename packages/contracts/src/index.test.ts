import { describe, expect, it } from "vitest";
import { apiHealthSchema, apiErrorSchema, leadCreateSchema, leadUpdateSchema, leadListQuerySchema, leadStageSchema, serviceDeliveryPlanSchema, serviceDeliveryPlanUpdateSchema, clientServiceSchema } from "./index";

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
 it("allows manual lead capture as Cold Call, Meta Leads or Referral",()=>{
  expect(leadCreateSchema.parse({phone:"+919876543210",source:"COLD_CALL"}).source).toBe("COLD_CALL");
  expect(leadCreateSchema.parse({phone:"+919876543211",source:"META_LEADS"}).source).toBe("META_LEADS");
  expect(leadCreateSchema.parse({phone:"+919876543213",source:"REFERRAL"}).source).toBe("REFERRAL");
  expect(leadCreateSchema.parse({phone:"+919876543212"}).source).toBeUndefined();
 });
 it("rejects unknown sources rather than silently creating inconsistent labels",()=>{
  expect(leadCreateSchema.safeParse({phone:"+919876543210",source:"WHATSAPP"}).success).toBe(false);
  expect(leadUpdateSchema.safeParse({version:1,source:"UNSUPPORTED_SOURCE"}).success).toBe(false);
  expect(leadListQuerySchema.safeParse({source:"UNKNOWN"}).success).toBe(false);
 });
 it("accepts source edits and source-filtered queries",()=>{
  expect(leadUpdateSchema.parse({version:1,source:"META_LEADS"}).source).toBe("META_LEADS");
  expect(leadUpdateSchema.parse({version:1,source:"REFERRAL"}).source).toBe("REFERRAL");
  expect(leadListQuerySchema.parse({source:"COLD_CALL"}).source).toBe("COLD_CALL");
  expect(leadListQuerySchema.parse({source:"REFERRAL"}).source).toBe("REFERRAL");
 });
});

describe("lead agreement pending stage",()=>{
 it("supports stage edits and list filtering",()=>{
  expect(leadStageSchema.parse("AGREEMENT_PENDING")).toBe("AGREEMENT_PENDING");
  expect(leadUpdateSchema.parse({version:2,status:"AGREEMENT_PENDING",stageNote:"Contract sent"}).status).toBe("AGREEMENT_PENDING");
  expect(leadListQuerySchema.parse({stage:"AGREEMENT_PENDING"}).stage).toBe("AGREEMENT_PENDING");
 });
});

describe("lead decision pending stage",()=>{
 it("accepts decision pending in status edits and filters",()=>{
  expect(leadStageSchema.parse("DECISION_PENDING")).toBe("DECISION_PENDING");
  expect(leadUpdateSchema.parse({version:2,status:"DECISION_PENDING",stageNote:"Awaiting confirmation"}).status).toBe("DECISION_PENDING");
  expect(leadListQuerySchema.parse({stage:"DECISION_PENDING"}).stage).toBe("DECISION_PENDING");
 });
});

describe("optional recurrence for client deliveries",()=>{
 const base={clientId:"00000000-0000-4000-8000-000000000001",assigneeId:"00000000-0000-4000-8000-000000000002",title:"Website",startOn:"2026-11-05",endOn:"2026-11-05",weekdays:[]};
 it("accepts one-time services with no weekdays and allows editing them",()=>{
  expect(serviceDeliveryPlanSchema.safeParse(base).success).toBe(true);
  const update={assigneeId:base.assigneeId,title:base.title,startOn:base.startOn,endOn:base.endOn,weekdays:base.weekdays};
  expect(serviceDeliveryPlanUpdateSchema.safeParse({...update,version:1,active:true}).success).toBe(true);
 });
 it("rejects zero-weekday ranges and preserves recurring service validation",()=>{
  expect(serviceDeliveryPlanSchema.safeParse({...base,endOn:"2026-11-30"}).success).toBe(false);
  expect(serviceDeliveryPlanSchema.safeParse({...base,endOn:"2026-11-30",weekdays:[4]}).success).toBe(true);
  expect(serviceDeliveryPlanSchema.safeParse({...base,endOn:"2026-11-30",weekdays:[4,4]}).success).toBe(false);
 });
});

describe("agreed services without duplicate monthly quantity",()=>{
 it("accepts service details without monthly targets",()=>{
  expect(clientServiceSchema.parse({name:"Google Business Profile",description:"Profile creation",status:"ACTIVE"}).name).toBe("Google Business Profile");
 });
 it("rejects removed monthly target fields",()=>{
  expect(clientServiceSchema.safeParse({name:"Video editing",monthlyTarget:8}).success).toBe(false);
 });
});
