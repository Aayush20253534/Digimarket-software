import {describe,expect,it,vi} from "vitest";
import type {PrismaClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {LeadAnalyticsService,type LeadAnalyticsQuery} from "./lead-report";

const query:LeadAnalyticsQuery={from:"2026-10-01",to:"2026-10-31",page:1,limit:20};
const actor=(permissions:string[]):Principal=>({
 userId:"user-1",organizationId:"org-1",sessionId:"test",roles:["FOUNDER"],permissions:new Set(permissions),
});
const base={businessName:"Example",contactName:null,phone:null,businessType:"Restaurant",
 location:"Prayagraj",source:"META_LEADS",assignedToId:null,assignee:null,
 nextFollowUpAt:null,createdAt:new Date("2026-10-03T06:00:00Z"),updatedAt:new Date("2026-10-07T07:00:00Z")};
const rows=[
 {...base,id:"lead-approved",status:"APPROVED",convertedClient:{id:"client-1",createdAt:new Date("2026-10-07T06:00:00Z")}},
 {...base,id:"lead-not-converted",status:"APPROVED",source:"COLD_CALL",convertedClient:null},
 {...base,id:"lead-pending",status:"DECISION_PENDING",source:"META_LEADS",convertedClient:null},
];
function service(){
 const findMany=vi.fn(async()=>rows);
 const findActivity=vi.fn(async()=>[
  {leadId:"lead-approved",createdAt:new Date("2026-10-05T06:00:00Z"),metadata:{toStatus:"MEETING_PROCESS"}},
  {leadId:"lead-approved",createdAt:new Date("2026-10-07T06:00:00Z"),metadata:{toStatus:"APPROVED"}},
  {leadId:"lead-pending",createdAt:new Date("2026-10-04T06:00:00Z"),metadata:{toStatus:"MEETING_PROCESS"}},
 ]);
 const db={lead:{findMany},leadActivity:{findMany:findActivity}} as unknown as PrismaClient;
 return {subject:new LeadAnalyticsService(db),findMany,findActivity};
}
describe("Lead Analytics",()=>{
 it("requires both reports and leads permissions even for a CSV export",async()=>{
  const {subject,findMany}=service();
  for(const grants of [[],["reports.business.read"],["leads.read"]]){
   await expect(subject.report(actor(grants),query)).rejects.toMatchObject({status:403});
   await expect(subject.csv(actor(grants),query)).rejects.toMatchObject({status:403});
  }
  expect(findMany).not.toHaveBeenCalled();
 });
 it("separates approved leads from clients converted and uses recorded stage transitions",async()=>{
  const {subject,findMany,findActivity}=service();
  const a=actor(["reports.business.read","leads.read"]);
  const result=await subject.report(a,query);
  expect(result.summary.total).toBe(3);
  expect(result.summary.approved).toBe(2);
  expect(result.summary.converted).toBe(1);
  expect(result.summary.approvalRate).toBe(66.67);
  expect(result.summary.conversionRate).toBe(33.33);
  expect(result.funnel.find(x=>x.name==="Meeting process")?.count).toBe(2);
  expect(result.funnel.find(x=>x.name==="Client converted")?.count).toBe(1);
  expect(result.sources.find(x=>x.name==="META_LEADS")?.total).toBe(2);
  expect(result.summary.averageApprovalDays).toBe(4);
  expect(result.summary.approvalTimingSample).toBe(1);
  expect(result.items[0].approved).toBe(true);
  expect(result.items[0].converted).toBe(true);
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({
   organizationId:"org-1",deletedAt:null,
  })}));
  expect(findActivity).toHaveBeenCalled();
 });
 it("paginates the register without changing summary totals",async()=>{
  const {subject}=service();
  const result=await subject.report(actor(["reports.business.read","leads.read"]),{...query,page:2,limit:2});
  expect(result.summary.total).toBe(3);
  expect(result.items).toHaveLength(1);
  expect(result.page).toBe(2);
  expect(result.hasMore).toBe(false);
 });
 it("reports and exports Referral separately with exact source filtering",async()=>{
   const {subject,findMany}=service();
   findMany.mockResolvedValue([{...rows[0],source:"REFERRAL"}]);
   const a=actor(["reports.business.read","leads.read"]);
   const referralQuery={...query,source:"REFERRAL" as const};
   const result=await subject.report(a,referralQuery);
   expect(result.summary.referral).toBe(1);
   expect(result.sources.find(x=>x.name==="REFERRAL")?.total).toBe(1);
   expect(result.sources.find(x=>x.name==="META_LEADS")?.total).toBe(0);
   expect(result.items[0].source).toBe("REFERRAL");
   expect(findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({AND:[{OR:[{source:"REFERRAL"}]}]})}));
   const exported=await subject.csv(a,referralQuery);
   expect(exported.csv).toContain('"REFERRAL"');
  });
  it("escapes spreadsheet formulas in exports",async()=>{
  const {subject,findMany}=service();
  findMany.mockResolvedValueOnce([{...rows[0],businessName:"=HYPERLINK(\"https://example.test\")"}]);
  const result=await subject.csv(actor(["reports.business.read","leads.read"]),query);
  expect(result.csv).toContain("\"'=HYPERLINK");
 });
});
