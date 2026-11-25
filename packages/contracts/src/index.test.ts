import { describe, expect, it } from "vitest";
import { apiHealthSchema, apiErrorSchema, leadCreateSchema, leadUpdateSchema, leadListQuerySchema, followUpListQuerySchema, leadStageSchema, clientServiceSchema, financeEntryInputSchema, financeEntryAdminEditSchema } from "./index";

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



describe("agreed services without duplicate monthly quantity",()=>{
 it("accepts service details without monthly targets",()=>{
  expect(clientServiceSchema.parse({name:"Google Business Profile",description:"Profile creation",status:"ACTIVE"}).name).toBe("Google Business Profile");
 });
 it("rejects removed monthly target fields",()=>{
  expect(clientServiceSchema.safeParse({name:"Video editing",monthlyTarget:8}).success).toBe(false);
 });
});



describe("Meta Ads financial entry ownership",()=>{
  const base={
    kind:"EXPENSE",categoryId:"00000000-0000-4000-8000-000000000001",
    amount:"350.00",occurredOn:"2026-11-04",method:"UPI",
    idempotencyKey:"00000000-0000-4000-8000-000000000002",
  };
  const clientId="00000000-0000-4000-8000-000000000003";
  it("preserves old self-funded entries with no clientId",()=>{
    expect(financeEntryInputSchema.parse(base).clientId).toBeUndefined();
    expect(financeEntryInputSchema.parse({...base,clientId:null}).clientId).toBeNull();
  });
  it("accepts client-linked Meta Ads submissions and rejects malformed client IDs",()=>{
    expect(financeEntryInputSchema.parse({...base,clientId}).clientId).toBe(clientId);
    expect(financeEntryInputSchema.safeParse({...base,clientId:"another-workspace"}).success).toBe(false);
  });
  it("accepts ownership changes on edited finance entries",()=>{
    const edit={categoryId:base.categoryId,amount:base.amount,occurredOn:base.occurredOn,
      method:base.method,merchantOrSource:"Meta",description:"Ad campaign"};
    expect(financeEntryAdminEditSchema.parse({...edit,clientId}).clientId).toBe(clientId);
    expect(financeEntryAdminEditSchema.parse({...edit,clientId:null}).clientId).toBeNull();
  });
});

describe("lead temperature",()=>{
 it("accepts optional explicit qualification and rejects unsupported classifications",()=>{
  expect(leadUpdateSchema.parse({version:1}).temperature).toBeUndefined();
  for(const temperature of ["HOT","WARM","COLD","UNCLASSIFIED"]){
   expect(leadUpdateSchema.parse({version:1,temperature}).temperature).toBe(temperature);
   expect(leadListQuerySchema.parse({temperature}).temperature).toBe(temperature);
  }
  expect(leadUpdateSchema.safeParse({version:1,temperature:"UNKNOWN"}).success).toBe(false);
  expect(leadListQuerySchema.safeParse({temperature:"UNKNOWN"}).success).toBe(false);
 });
});

describe("follow-up register filters",()=>{
 it("validates all-cycle schedule filters and rejects acquisition-cycle filtering",()=>{
  expect(followUpListQuerySchema.parse({view:"overdue",temperature:"HOT",from:"2026-11-01",to:"2026-11-25",month:"2026-11",limit:"20"})).toMatchObject({view:"overdue",temperature:"HOT",limit:20});
  expect(followUpListQuerySchema.safeParse({from:"2026-12-01",to:"2026-11-01"}).success).toBe(false);
  expect(followUpListQuerySchema.safeParse({month:"2026-13"}).success).toBe(false);
  expect(followUpListQuerySchema.safeParse({cycle:"2026-10"}).success).toBe(false);
 });
});
