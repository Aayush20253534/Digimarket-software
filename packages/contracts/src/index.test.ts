import { describe, expect, it } from "vitest";
import { apiHealthSchema, apiErrorSchema, leadCreateSchema, leadUpdateSchema, leadListQuerySchema, followUpListQuerySchema, meetingListQuerySchema, meetingConflictQuerySchema, leadStageSchema, clientServiceSchema, clientRenewSchema, clientListQuerySchema, clientUpdateSchema, financeEntryInputSchema, financeEntryAdminEditSchema, financeBreakdownQuerySchema } from "./index";

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

describe("meeting workspace contracts",()=>{
 it("validates schedule filters, outcome metadata and Google Meet links",()=>{
  expect(meetingListQuerySchema.parse({view:"overdue",type:"GOOGLE_MEET",temperature:"HOT",month:"2026-11",limit:"20"})).toMatchObject({limit:20,type:"GOOGLE_MEET"});
  expect(meetingListQuerySchema.safeParse({from:"2026-12-01",to:"2026-11-01"}).success).toBe(false);
  expect(meetingListQuerySchema.safeParse({cycle:"2026-10"}).success).toBe(false);
  expect(leadUpdateSchema.safeParse({version:1,meetingOutcome:"NO_SHOW",status:"FOLLOW_UP",followUpOn:"2026-11-26"}).success).toBe(true);
  expect(leadUpdateSchema.safeParse({version:1,meetingType:"GOOGLE_MEET",meetingJoinUrl:"https://meet.google.com/abc-defg-hij",meetingDurationMinutes:60}).success).toBe(true);
  expect(leadUpdateSchema.safeParse({version:1,meetingJoinUrl:"https://meet.google.com.example.com/abc"}).success).toBe(false);
  expect(meetingConflictQuerySchema.safeParse({id:"00000000-0000-4000-8000-000000000001",on:"2026-11-26",time:"15:30",duration:"0"}).success).toBe(false);
 });
});

describe("client workspace contracts",()=>{it("validates renewal, health and filters",()=>{expect(clientRenewSchema.safeParse({version:1,startOn:"2026-11-25",endOn:"2026-11-24",monthlyFee:"1000",monthlyAdBudget:"500",reason:"Renewal"}).success).toBe(false);expect(clientUpdateSchema.safeParse({version:1,health:"HEALTHY",onboarding:["AGREEMENT"]}).success).toBe(true);expect(clientUpdateSchema.safeParse({version:1,health:"HOT"}).success).toBe(false);expect(clientListQuerySchema.parse({workspace:"1",expiring:"1",sort:"contractEndOn"}).workspace).toBe("1");});});

 it("validates financial report category drilldown",()=>{
  const period={kind:"EXPENSE",from:"2026-11-22",to:"2026-12-21"};
  expect(financeBreakdownQuerySchema.safeParse({...period,categoryId:"00000000-0000-4000-8000-000000000001"}).success).toBe(true);
  expect(financeBreakdownQuerySchema.safeParse({...period,categoryId:"invalid"}).success).toBe(false);
 });
