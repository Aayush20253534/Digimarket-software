import {describe,expect,it,vi} from "vitest";
import request from "supertest";
import type {PrismaClient} from "@digimarket/db";
import type {AuthService,Principal} from "../auth/service";
import {createApp} from "../app";
import {LeadsService} from "./service";
const org="00000000-0000-4000-8000-000000000001";
const ids=["00000000-0000-4000-8000-000000000002","00000000-0000-4000-8000-000000000003"];
const selection={leads:ids.map(id=>({id,version:2}))};
const actor:Principal={organizationId:org,userId:ids[0],sessionId:"test",roles:["FOUNDER"],permissions:new Set(["leads.read"])};
function fixture(){
 const tx={
  lead:{findMany:vi.fn().mockResolvedValue(ids.map(id=>({id,normalizedPhone:null}))),deleteMany:vi.fn().mockResolvedValue({count:2})},
  $queryRaw:vi.fn().mockResolvedValue(selection.leads),
  client:{updateMany:vi.fn().mockResolvedValue({count:1})},
  leadDuplicateCandidate:{deleteMany:vi.fn()},leadActivity:{deleteMany:vi.fn()},auditLog:{createMany:vi.fn()},
 };
 const db={...tx,$transaction:vi.fn(async(work:(value:typeof tx)=>Promise<unknown>)=>work(tx))} as unknown as PrismaClient;
 return {tx,db,service:new LeadsService(db)};
}
describe("bulk lead deletion",()=>{
 it("rejects non-governance users before touching records",async()=>{
  const {service,tx}=fixture();
  await expect(service.bulkDelete({...actor,roles:["EMPLOYEE"]},selection)).rejects.toMatchObject({status:403});
  expect(tx.lead.findMany).not.toHaveBeenCalled();
 });
 it("scopes every selection to the organization and rejects missing/foreign leads atomically",async()=>{
  const {service,tx}=fixture();tx.lead.findMany.mockResolvedValueOnce([{id:ids[0],normalizedPhone:null}]);
  await expect(service.bulkDelete(actor,selection)).rejects.toMatchObject({status:404});
  expect(tx.lead.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{id:{in:ids},organizationId:org,deletedAt:null}}));
  expect(tx.client.updateMany).not.toHaveBeenCalled();expect(tx.lead.deleteMany).not.toHaveBeenCalled();
 });
 it("rejects the whole batch if one selected lead changed",async()=>{
  const {service,tx}=fixture();tx.$queryRaw.mockResolvedValueOnce([{id:ids[0],version:2},{id:ids[1],version:3}]);
  await expect(service.bulkDelete(actor,selection)).rejects.toMatchObject({status:409});
  expect(tx.client.updateMany).not.toHaveBeenCalled();expect(tx.leadActivity.deleteMany).not.toHaveBeenCalled();
  expect(tx.lead.deleteMany).not.toHaveBeenCalled();
 });
 it("unlinks converted clients, deletes selected CRM activity, and audits every deletion",async()=>{
  const {service,tx}=fixture();expect(await service.bulkDelete(actor,selection)).toEqual({ids,deletedCount:2});
  expect(tx.client.updateMany).toHaveBeenCalledWith({where:{organizationId:org,sourceLeadId:{in:ids}},data:{sourceLeadId:null}});
  expect(tx.lead.deleteMany).toHaveBeenCalledWith({where:{organizationId:org,id:{in:ids}}});
  expect(tx.auditLog.createMany.mock.calls[0][0].data.map((row:{entityId:string})=>row.entityId)).toEqual(ids);
 });
 it("lets administrators delete a batch through the application guard but rejects creation",async()=>{
  const {db}=fixture();
  const auth={database:db,config:{},authenticate:vi.fn().mockResolvedValue({...actor,roles:["ADMIN"]})} as unknown as AuthService;
  const app=createApp([],auth);
  const deleted=await request(app).post("/api/v1/leads/bulk-delete").set("Authorization","Bearer test").send(selection);
  expect(deleted.status).toBe(200);expect(deleted.body.data.deletedCount).toBe(2);
  expect((await request(app).post("/api/v1/leads").set("Authorization","Bearer test").send({})).status).toBe(403);
  expect((await request(app).post("/api/v1/leads/bulk-delete").set("Authorization","Bearer test").send({leads:[]})).status).toBe(422);
 });
});
