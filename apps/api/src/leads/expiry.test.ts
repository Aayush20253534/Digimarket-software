import {describe,expect,it,vi} from "vitest";
import type {PrismaClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {LeadsService} from "./service";
const org="00000000-0000-4000-8000-000000000001",id="00000000-0000-4000-8000-000000000002";
const actor:Principal={organizationId:org,userId:id,sessionId:"test",roles:["FOUNDER"],permissions:new Set(["leads.read","leads.edit","clients.read","clients.edit"])};
function fixture(status="APPROVED",ended=false){
 const current={id,organizationId:org,status,version:1,assignedToId:null,createdById:id,nextFollowUpAt:null,meetingAt:null,normalizedPhone:"9999999999",normalizedBusinessName:"example",createdAt:new Date("2026-10-24T00:00:00Z")};
 const changed={...current,status:"EXPIRED",version:2};
 const lead={findFirst:vi.fn().mockResolvedValue(current),updateMany:vi.fn().mockResolvedValue({count:1}),findUniqueOrThrow:vi.fn().mockResolvedValue(changed),findMany:vi.fn().mockResolvedValue([])};
 const client={findFirst:vi.fn().mockResolvedValue(ended?{id,status:"EXPIRED",agreementEndedOn:new Date("2026-11-23T00:00:00Z")}:null),create:vi.fn()};
 const tx={lead,client,leadActivity:{create:vi.fn(),findMany:vi.fn().mockResolvedValue([])},leadDuplicateCandidate:{findMany:vi.fn().mockResolvedValue([])},auditLog:{create:vi.fn()}};
 const db={...tx,$transaction:vi.fn(async(work:(v:typeof tx)=>Promise<unknown>)=>work(tx))} as unknown as PrismaClient;
 return {lead,client,tx,current,service:new LeadsService(db)};
}
describe("manual former-client stage",()=>{
 it("rejects expiry from unapproved leads",async()=>{
  const {service,lead}=fixture("PENDING",true);
  await expect(service.update(actor,id,{version:1,status:"EXPIRED"})).rejects.toMatchObject({status:422});
  expect(lead.updateMany).not.toHaveBeenCalled();
 });
 it("requires a manually ended linked client before changing an approved lead",async()=>{
  const {service,lead,client}=fixture();
  expect((await service.detail(actor,id)).canExpire).toBe(false);
  await expect(service.update(actor,id,{version:1,status:"EXPIRED"})).rejects.toMatchObject({code:"AGREEMENT_NOT_ENDED"});
  expect(client.findFirst).toHaveBeenLastCalledWith({where:{organizationId:org,sourceLeadId:id,status:"EXPIRED",agreementEndedOn:{not:null}},select:{id:true}});
  expect(lead.updateMany).not.toHaveBeenCalled();
 });
 it("requires client editing permission",async()=>{
  const {service,lead}=fixture("APPROVED",true);
  const restricted={...actor,permissions:new Set(["leads.read","leads.edit","clients.read"])};
  expect((await service.detail(restricted,id)).canExpire).toBe(false);
  await expect(service.update(restricted,id,{version:1,status:"EXPIRED"})).rejects.toMatchObject({status:403});
  expect(lead.updateMany).not.toHaveBeenCalled();
 });
 it("preserves acquisition date, client link and audits a valid transition",async()=>{
  const {service,lead,client,tx,current}=fixture("APPROVED",true);
  expect((await service.detail(actor,id)).canExpire).toBe(true);
  const result=await service.update(actor,id,{version:1,status:"EXPIRED"});
  expect(result).toMatchObject({status:"EXPIRED",createdAt:current.createdAt});
  expect(lead.updateMany).toHaveBeenCalledWith({where:{id,organizationId:org,deletedAt:null,version:1},data:{status:"EXPIRED",version:{increment:1}}});
  expect(client.create).not.toHaveBeenCalled();
  expect(tx.leadActivity.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({kind:"STAGE_CHANGED",metadata:expect.objectContaining({fromStatus:"APPROVED",toStatus:"EXPIRED"})})}));
 });
 it("does not reopen expired leads or return approved leads to sales stages",async()=>{
  await expect(fixture("EXPIRED",true).service.update(actor,id,{version:1,status:"PENDING"})).rejects.toMatchObject({status:409});
  await expect(fixture("APPROVED",true).service.update(actor,id,{version:1,status:"PENDING"})).rejects.toMatchObject({status:409});
 });
});
