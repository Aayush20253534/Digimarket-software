import {describe,expect,it,vi} from "vitest";
import type {PrismaClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {LeadsService} from "./service";
const actor:Principal={organizationId:"00000000-0000-4000-8000-000000000001",userId:"00000000-0000-4000-8000-000000000002",sessionId:"test",roles:["FOUNDER"],permissions:new Set(["leads.read","leads.bulk"])};
const range={gte:new Date("2026-10-21T18:30:00Z"),lt:new Date("2026-11-21T18:30:00Z")};
function fixture(){
 const lead={count:vi.fn().mockResolvedValue(2),findMany:vi.fn().mockResolvedValue([])};
 const client={count:vi.fn().mockResolvedValue(1)};
 const auditLog={create:vi.fn().mockResolvedValue({})};
 return {lead,client,auditLog,service:new LeadsService({lead,client,auditLog} as unknown as PrismaClient)};
}
describe("lead acquisition cycle scope",()=>{
 it("applies the same Indian-date range to listing, live metrics and CSV export",async()=>{
  const {service,lead,client}=fixture();
  const scope={organizationId:actor.organizationId,deletedAt:null,createdAt:range};
  await service.list(actor,{limit:10,cycle:"2026-10",stage:"FOLLOW_UP"});
  expect(lead.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{...scope,status:"FOLLOW_UP"}}));
  const result=await service.metrics(actor,"2026-10");
  expect(result.conversionRatePercent).toBe(50);
  expect(lead.count).toHaveBeenCalledWith({where:{...scope,status:"APPROVED"}});
  expect(lead.count).toHaveBeenCalledWith({where:{...scope,status:"CALL_BUSY"}});
  expect(client.count).toHaveBeenCalledWith({where:{organizationId:actor.organizationId,sourceLead:{...scope,status:{in:["APPROVED","EXPIRED"]}}}});
  const csv=await service.export(actor,"2026-10");
  expect(csv.filename).toBe("digimarket-leads-2026-10.csv");
  expect(lead.findMany).toHaveBeenLastCalledWith(expect.objectContaining({where:scope}));
 });
 it("does not date-filter the Total scope",async()=>{
  const {service,lead,client}=fixture();
  await service.list(actor,{limit:10});
  await service.metrics(actor);
  await service.export(actor);
  const scope={organizationId:actor.organizationId,deletedAt:null};
  expect(lead.findMany).toHaveBeenLastCalledWith(expect.objectContaining({where:scope}));
  expect(client.count).toHaveBeenCalledWith({where:{organizationId:actor.organizationId,sourceLead:{...scope,status:{in:["APPROVED","EXPIRED"]}}}});
 });
});
